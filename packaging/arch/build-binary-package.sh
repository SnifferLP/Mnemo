#!/usr/bin/env bash
# Builds an installable Arch package from the already-compiled release binary.
# Run `pnpm tauri build` (or `pnpm tauri build --no-bundle`) first.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
binary="$root/src-tauri/target/release/mnemo"
out="$root/packaging/arch"

[[ -x "$binary" ]] || {
  echo "error: $binary not found. Run 'pnpm tauri build' first." >&2
  exit 1
}

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

install -m755 "$binary" "$work/mnemo"
install -m644 "$out/mnemo.desktop" "$work/mnemo.desktop"
install -m644 "$root/src-tauri/icons/32x32.png" "$work/mnemo-32.png"
install -m644 "$root/src-tauri/icons/128x128.png" "$work/mnemo-128.png"
install -m644 "$root/src-tauri/icons/128x128@2x.png" "$work/mnemo-256.png"
install -m644 "$root/LICENSE" "$work/LICENSE"
install -m644 "$root/THIRD_PARTY_NOTICES.md" "$work/THIRD_PARTY_NOTICES.md"
install -m644 "$root/licenses/OFL-1.1.txt" "$work/OFL-1.1.txt"

cat > "$work/PKGBUILD" <<'EOF'
pkgname=mnemo
pkgver=1.2.5
pkgrel=1
pkgdesc="Offline-first AI study platform with flashcards, spaced repetition and tests"
url="https://github.com/SnifferLP/Mnemo"
arch=('x86_64')
license=('MIT')
depends=('webkit2gtk-4.1' 'gtk3' 'libsoup3' 'hicolor-icon-theme')
source=('mnemo' 'mnemo.desktop' 'mnemo-32.png' 'mnemo-128.png' 'mnemo-256.png' 'LICENSE' 'THIRD_PARTY_NOTICES.md' 'OFL-1.1.txt')
sha256sums=('SKIP' 'SKIP' 'SKIP' 'SKIP' 'SKIP' 'SKIP' 'SKIP' 'SKIP')

package() {
  install -Dm755 "$srcdir/mnemo" "$pkgdir/usr/bin/mnemo"
  install -Dm644 "$srcdir/mnemo.desktop" "$pkgdir/usr/share/applications/mnemo.desktop"
  install -Dm644 "$srcdir/mnemo-32.png" "$pkgdir/usr/share/icons/hicolor/32x32/apps/mnemo.png"
  install -Dm644 "$srcdir/mnemo-128.png" "$pkgdir/usr/share/icons/hicolor/128x128/apps/mnemo.png"
  install -Dm644 "$srcdir/mnemo-256.png" "$pkgdir/usr/share/icons/hicolor/256x256/apps/mnemo.png"
  install -Dm644 "$srcdir/LICENSE" "$pkgdir/usr/share/licenses/$pkgname/LICENSE"
  install -Dm644 "$srcdir/THIRD_PARTY_NOTICES.md" "$pkgdir/usr/share/licenses/$pkgname/THIRD_PARTY_NOTICES.md"
  install -Dm644 "$srcdir/OFL-1.1.txt" "$pkgdir/usr/share/licenses/$pkgname/OFL-1.1.txt"
}
EOF

mkdir -p "$out"
PKGDEST="$out" bash -c 'cd "$1" && makepkg -f --noconfirm' _ "$work"
echo "Package written to $out"
ls -lh "$out"/mnemo-*.pkg.tar.zst
