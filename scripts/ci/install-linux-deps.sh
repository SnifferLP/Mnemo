#!/usr/bin/env bash
# Installs Mnemo's Linux build dependencies from an explicitly probed apt mirror.
#
# The GitHub-hosted Ubuntu image resolves apt through
# mirror+file:/etc/apt/apt-mirrors.txt, which points at azure.archive.ubuntu.com.
# That resolver fails intermittently ("Temporary failure resolving
# 'azure.archive.ubuntu.com'"), and apt then walks the whole package list one
# download timeout at a time for ~50 minutes instead of failing. This script
# replaces the routing with a single probed mirror, validates the indexes and
# every package candidate before downloading anything, and fails fast with a
# diagnostic when no usable mirror exists.
#
# Used by .github/workflows/ci.yml and .github/workflows/build-linux.yml so both
# jobs behave identically.
#
# Usage:
#   scripts/ci/install-linux-deps.sh [package ...]
#
# With no arguments it installs the full Tauri dependency set. Arguments replace
# that set. Set MNEMO_UBUNTU_SUITE to target a release other than noble.
set -euo pipefail

suite="${MNEMO_UBUNTU_SUITE:-noble}"

if [ "$#" -gt 0 ]; then
  packages=("$@")
else
  packages=(
    libwebkit2gtk-4.1-dev
    libgtk-3-dev
    libayatana-appindicator3-dev
    librsvg2-dev
    libsoup-3.0-dev
    patchelf
  )
fi

if [ ! -f /etc/os-release ] || ! grep -q '^ID=ubuntu' /etc/os-release; then
  echo "error: this script supports Ubuntu runners only." >&2
  exit 1
fi

if ! command -v apt-get >/dev/null 2>&1; then
  echo "error: apt-get is not available on this runner." >&2
  exit 1
fi

# Containers may run as root; everywhere else apt needs sudo.
if [ "$(id -u)" -eq 0 ]; then
  sudo_cmd=()
elif command -v sudo >/dev/null 2>&1; then
  sudo_cmd=(sudo)
else
  echo "error: installing packages requires root or sudo." >&2
  exit 1
fi

echo "::group::Runner apt configuration"
echo "--- /etc/apt/apt-mirrors.txt"
cat /etc/apt/apt-mirrors.txt || true
echo "--- /etc/apt/sources.list"
cat /etc/apt/sources.list || true
echo "--- /etc/apt/sources.list.d"
grep -R . /etc/apt/sources.list.d/ || true
for host in azure.archive.ubuntu.com archive.ubuntu.com security.ubuntu.com; do
  echo "--- getent ahosts ${host}"
  getent ahosts "$host" || echo "unresolved"
done
echo "--- resolv.conf"
cat /etc/resolv.conf || true
echo "::endgroup::"

# Only HTTPS mirrors that carry all four suites are candidates.
candidates=(
  "https://archive.ubuntu.com/ubuntu"
  "https://mirrors.edge.kernel.org/ubuntu"
  "https://ftp.osuosl.org/pub/ubuntu"
  "https://mirror.math.princeton.edu/pub/ubuntu"
)
suites=("${suite}" "${suite}-updates" "${suite}-backports" "${suite}-security")

chosen=""
for mirror in "${candidates[@]}"; do
  host="${mirror#*://}"
  host="${host%%/*}"
  if ! getent ahosts "$host" >/dev/null 2>&1; then
    echo "DNS failure: $host does not resolve" >&2
    continue
  fi
  reachable=1
  for candidate_suite in "${suites[@]}"; do
    if ! curl -fsSI --max-time 8 "$mirror/dists/${candidate_suite}/Release" >/dev/null 2>&1; then
      echo "Unresponsive: ${mirror}/dists/${candidate_suite}" >&2
      reachable=0
      break
    fi
  done
  if [ "$reachable" -eq 1 ]; then
    echo "Selected mirror: $mirror"
    chosen="$mirror"
    break
  fi
done

if [ -z "$chosen" ]; then
  echo "error: no apt mirror answered for ${suites[*]}." >&2
  echo "This runner cannot install Linux build dependencies; refusing to attempt a full package download." >&2
  for mirror in "${candidates[@]}"; do
    host="${mirror#*://}"
    host="${host%%/*}"
    if getent ahosts "$host" >/dev/null 2>&1; then
      echo "  $host resolves but does not serve the ${suite} suites over HTTPS" >&2
    else
      echo "  $host does not resolve" >&2
    fi
  done
  exit 1
fi

# Drop mirror+file routing and unrelated third-party lists so the update is
# deterministic and a single failing repository is fatal.
"${sudo_cmd[@]}" mkdir -p /etc/apt/sources.list.d.disabled
for file in /etc/apt/sources.list.d/*; do
  [ -e "$file" ] || continue
  "${sudo_cmd[@]}" mv "$file" /etc/apt/sources.list.d.disabled/
done
"${sudo_cmd[@]}" rm -f /etc/apt/sources.list
printf 'deb %s %s main restricted universe multiverse\ndeb %s %s main restricted universe multiverse\ndeb %s %s main restricted universe multiverse\ndeb %s %s main restricted universe multiverse\n' \
  "$chosen" "$suite" \
  "$chosen" "${suite}-updates" \
  "$chosen" "${suite}-backports" \
  "$chosen" "${suite}-security" | "${sudo_cmd[@]}" tee /etc/apt/sources.list >/dev/null
echo "--- effective sources"
cat /etc/apt/sources.list

apt_options=(
  -o Acquire::Retries=2
  -o Acquire::http::Timeout=10
  -o Acquire::https::Timeout=10
  -o Acquire::ForceIPv4=true
  -o DPkg::Lock::Timeout=60
)

started=$SECONDS
"${sudo_cmd[@]}" apt-get "${apt_options[@]}" -o APT::Update::Error-Mode=any update

# Validate the indexes before downloading a single package.
if ! find /var/lib/apt/lists -name "*${suite}*Packages*" -print -quit | grep -q .; then
  echo "error: apt update produced no ${suite} package index from $chosen." >&2
  exit 1
fi
for package in "${packages[@]}"; do
  if ! apt-cache policy "$package" | grep -q 'Candidate: [0-9]'; then
    echo "error: $package is not available from $chosen." >&2
    apt-cache policy "$package" >&2
    exit 1
  fi
done

"${sudo_cmd[@]}" apt-get "${apt_options[@]}" -o APT::Update::Error-Mode=any install -y --no-install-recommends \
  "${packages[@]}"

for package in "${packages[@]}"; do
  if ! dpkg -s "$package" >/dev/null 2>&1; then
    echo "error: $package is still missing after installation." >&2
    exit 1
  fi
done
echo "Linux build dependencies installed from $chosen in $((SECONDS - started))s"
