#!/usr/bin/env bash
# Creates the release source archive from a clean committed tree.
#
# The Arch recipe is deliberately excluded: its checksum describes this
# archive, so including the recipe would make the archive self-referential.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
version="$(node -p "require('${root}/package.json').version")"
archive="$root/packaging/arch/mnemo-${version}.tar.gz"
temporary="$(mktemp)"
extract_dir="$(mktemp -d)"
trap 'rm -rf "$temporary" "$extract_dir"' EXIT

if [[ -n "$(git -C "$root" status --porcelain)" ]]; then
  echo "error: commit or stash all changes before creating a release archive." >&2
  exit 1
fi

git -C "$root" archive \
  --format=tar \
  --prefix="mnemo-${version}/" \
  --output="$temporary" \
  HEAD

tar -xf "$temporary" -C "$extract_dir"
rm -f "$extract_dir/mnemo-${version}/packaging/arch/PKGBUILD"

# Repack with stable metadata so the archive, and therefore the PKGBUILD
# checksum, does not change when the commit timestamp changes.
tar \
  --sort=name \
  --mtime='UTC 2020-01-01' \
  --owner=0 \
  --group=0 \
  --numeric-owner \
  --format=gnu \
  -cf "$temporary" \
  -C "$extract_dir" \
  "mnemo-${version}"
gzip -n -9 -c "$temporary" > "$archive"

echo "Created $archive"
sha256sum "$archive"
echo "Update sha256sums in packaging/arch/PKGBUILD with the value above."
