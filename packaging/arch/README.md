# Arch Linux packaging

Mnemo's Arch package is built for **x86_64**. The package installs the application binary, desktop entry, hicolor icons and license notices.

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

`PKGBUILD` is the source-package recipe. It expects the release archive `mnemo-<version>.tar.gz` in this directory.

Build dependencies: `nodejs`, `pnpm`, `rust` and `pkgconf`. Runtime dependencies are `webkit2gtk-4.1`, `gtk3`, `libsoup3` and `hicolor-icon-theme`.

```bash
cd packaging/arch
makepkg -si
```

### Source archive and checksum

For a release, generate the archive from a clean committed tree:

```bash
./packaging/arch/make-source-archive.sh
```

The script prints the SHA-256. Pin that value in `PKGBUILD` and commit the recipe change. The archive excludes `packaging/arch/PKGBUILD` on purpose: the recipe contains the archive checksum, so including the recipe would make the archive self-referential and make a stable checksum impossible.

The source archive is a release asset; it is intentionally not committed. The release workflow regenerates it from the tagged commit and attaches it alongside the binary packages.
