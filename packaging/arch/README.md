# Arch Linux packaging

Mnemo's Arch package is built for **x86_64** only. The package installs the application binary, desktop entry, hicolor icons and license notices.

## Install a release package

```bash
sudo pacman -U mnemo-<version>-1-x86_64.pkg.tar.zst
```

## Rebuild the binary package

Build the release binary without Tauri's own Linux bundles:

```bash
pnpm tauri build --no-bundle
./packaging/arch/build-binary-package.sh
```

The script creates a temporary package recipe and writes `mnemo-<version>-1-x86_64.pkg.tar.zst` into this directory. Generated packages are ignored by Git and should be attached to a GitHub Release, not committed.

## Build from source

`PKGBUILD` is the source-package recipe. It expects the release archive `mnemo-<version>.tar.gz` in this directory and verifies its SHA-256 checksum.

```bash
cd packaging/arch
makepkg -si
```

Build dependencies: `nodejs`, `pnpm`, `rust` and `pkgconf`. Runtime dependencies are `webkit2gtk-4.1`, `gtk3`, `libsoup3` and `hicolor-icon-theme`.

For a release, generate the archive from a clean committed tree:

```bash
./packaging/arch/make-source-archive.sh
```

Update `sha256sums` in `PKGBUILD` with the printed value, then verify the package in a clean environment. The source archive is a release asset; it is intentionally not committed.

Until a GitHub Release asset URL is available, keep the archive next to `PKGBUILD`. After publishing, the recipe can point `source` at the release asset and should be rechecked against its checksum.
