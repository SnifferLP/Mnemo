# Releasing Mnemo

This document is for maintainers preparing a public release. Do not commit generated packages or binaries; attach them to a GitHub Release instead.

## 1. Set the version

Update the version consistently in:

- `package.json`
- `src-tauri/tauri.conf.json`
- `src-tauri/Cargo.toml`
- `src-tauri/Cargo.lock` (the `mnemo` package entry)
- `packaging/arch/PKGBUILD`
- `packaging/arch/build-binary-package.sh`
- `CHANGELOG.md` and user-facing release notes

Keep `pnpm-lock.yaml` unchanged unless dependencies changed.

## 2. Run the full verification suite

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build

cd src-tauri
cargo fmt --all --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test --all-targets
```

Also verify a clean checkout builds, confirm no database or secret is present, and inspect `git status` for generated files.

## 3. Build Linux artifacts

```bash
pnpm tauri build
```

Expected bundles:

- `src-tauri/target/release/bundle/appimage/Mnemo_<version>_amd64.AppImage`
- `src-tauri/target/release/bundle/deb/Mnemo_<version>_amd64.deb`

Build the Arch binary package from the release binary:

```bash
pnpm tauri build --no-bundle
./packaging/arch/build-binary-package.sh
```

This writes `packaging/arch/mnemo-<version>-1-x86_64.pkg.tar.zst`.

## 4. Create the source archive

From a clean committed tree:

```bash
./packaging/arch/make-source-archive.sh
```

The script creates `packaging/arch/mnemo-<version>.tar.gz` and prints its SHA-256. Update `sha256sums` in `packaging/arch/PKGBUILD` to that value. The archive is a release asset, not a committed source file.

If the repository URL is known, update the `source` line in `PKGBUILD` to the release-asset URL after the release exists, then re-check the checksum. Until then, the PKGBUILD expects the archive next to it.

## 5. Verify artifacts

```bash
sha256sum \
  src-tauri/target/release/bundle/appimage/Mnemo_<version>_amd64.AppImage \
  src-tauri/target/release/bundle/deb/Mnemo_<version>_amd64.deb \
  packaging/arch/mnemo-<version>-1-x86_64.pkg.tar.zst \
  packaging/arch/mnemo-<version>.tar.gz
```

- Install the Arch package and the `.deb` on a clean system or container where practical.
- Run the AppImage.
- Confirm the version in the window, package metadata and About/Data settings.
- Check the bundled fonts render offline.

## 6. Publish the GitHub Release

1. Create a tag `v<version>` from the reviewed commit.
2. Create a GitHub Release with user-facing notes from `CHANGELOG.md`.
3. Attach the AppImage, Debian package, Arch package and source archive.
4. Include the SHA-256 checksums in the release notes.
5. Do not upload databases, `.env` files, provider keys or local build directories.

Only publish Windows artifacts if they were built and tested on Windows. macOS is not a supported target.

## 7. Post-release checks

- Confirm the release assets download and install.
- Confirm the source archive matches the recorded checksum.
- Confirm `main` remains clean and the tag points to the intended commit.
- Update any AUR or distribution recipe separately, with its own review and checksum.
