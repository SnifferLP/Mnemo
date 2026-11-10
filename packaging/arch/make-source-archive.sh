#!/usr/bin/env bash
# Creates the release source archive from a clean committed tree.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
version="$(node -p "require('${root}/package.json').version")"
archive="$root/packaging/arch/mnemo-${version}.tar.gz"

if [[ -n "$(git -C "$root" status --porcelain)" ]]; then
  echo "error: commit or stash all changes before creating a release archive." >&2
  exit 1
fi

git -C "$root" archive \
  --format=tar.gz \
  --prefix="mnemo-${version}/" \
  --output="$archive" \
  HEAD

echo "Created $archive"
sha256sum "$archive"
echo "Update sha256sums in packaging/arch/PKGBUILD with the value above."
