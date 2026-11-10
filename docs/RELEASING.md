# Releasing Mnemo

This document is for maintainers preparing a public release. Generated packages and binaries are release assets, not committed files. The repository's release workflow builds Windows, Linux and Arch artifacts when a GitHub Release is published.

## 1. Set the version

Update the version consistently in:

- `package.json`
- `src-tauri/tauri.conf.json`
- `src-tauri/Cargo.toml`
- `src-tauri/Cargo.lock` (the `mnemo` package entry)
- `packaging/arch/PKGBUILD`
- `packaging/arch/build-binary-package.sh`
- `CHANGELOG.md` and the GitHub Release notes

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

## 3. Build the artifacts

### Windows

The supported build is Windows x64 with the MSVC Rust toolchain and Node.js 22. The platform configuration selects NSIS and the embedded WebView2 bootstrapper:

```powershell
pnpm install --frozen-lockfile
pnpm tauri build --bundles nsis
```

Expected bundle:

- `src-tauri/target/release/bundle/nsis/Mnemo_<version>_x64-setup.exe`

The installer is **unsigned**. Do not describe it as signed. SmartScreen may warn users about an unknown publisher.

### Linux AppImage and Debian package

```bash
pnpm tauri build
```

Expected bundles:

- `src-tauri/target/release/bundle/appimage/Mnemo_<version>_amd64.AppImage`
- `src-tauri/target/release/bundle/deb/Mnemo_<version>_amd64.deb`

### Arch package

```bash
pnpm tauri build --no-bundle
./packaging/arch/build-binary-package.sh
```

This writes `packaging/arch/mnemo-<version>-1-x86_64.pkg.tar.zst`.

### Source archive

From a clean committed tree:

```bash
./packaging/arch/make-source-archive.sh
```

The script creates `packaging/arch/mnemo-<version>.tar.gz` and prints its SHA-256. The archive deliberately excludes `packaging/arch/PKGBUILD`, because the recipe contains the archive's checksum and including it would make the archive self-referential. Pin `sha256sums` in `PKGBUILD` to the printed value and commit that change. The archive itself remains a release asset and is not committed.

The release workflow regenerates the source archive from the tagged commit and attaches it, together with a `SHA256SUMS` file.

## 4. Automated GitHub Release workflow

Publishing a GitHub Release triggers `.github/workflows/release.yml`. It runs these jobs in parallel:

1. Windows checks and NSIS installer.
2. Linux AppImage and `.deb`.
3. Arch package.
4. Source archive.

After all four succeed, the publish job downloads the artifacts, writes `SHA256SUMS`, and attaches the files to the existing release. The workflow does not create the release or tag.

Create the tag and release only after the version commit is on `main` and CI is green. The release must be published rather than left as a draft to start the workflow.

## 5. Verify artifacts and manual QA

```bash
sha256sum \
  src-tauri/target/release/bundle/appimage/Mnemo_<version>_amd64.AppImage \
  src-tauri/target/release/bundle/deb/Mnemo_<version>_amd64.deb \
  packaging/arch/mnemo-<version>-1-x86_64.pkg.tar.zst \
  packaging/arch/mnemo-<version>.tar.gz
```

### Automated coverage

CI checks:

- TypeScript, frontend tests and production frontend build on Linux and Windows.
- Rust formatting, Clippy and Rust tests on Linux and Windows.
- NSIS installer creation and artifact upload.
- Linux AppImage and `.deb` creation.
- Arch package creation.
- Gitleaks secret scanning.

### Manual Windows QA checklist

A Windows CI runner proves compilation, tests and installer creation. It does **not** prove interactive desktop behavior. Before calling a Windows release fully verified, check on a real Windows 10 or Windows 11 x64 machine:

- Fresh per-user installation, Start Menu shortcut, icon and uninstall entry.
- First launch, database creation, and relaunch with existing data.
- Saving, editing and removing an API key; protected `secure.key` survives a restart.
- Import and export with paths containing spaces and non-ASCII characters.
- Backup and restore, keeping the app closed during restore.
- Media attachment, image display and audio playback.
- Window sizing, maximizing and Windows display scaling (100%, 125%, 150%).
- Keyboard shortcuts, including Ctrl combinations.
- Multiple app instances and database access behavior.
- AI provider connection, model listing and error messages with a test provider.

Record what was tested and on which Windows version. If a check was not performed, state that plainly in the release notes.

### Manual Linux QA checklist

- Install the Arch package and the `.deb` where practical.
- Run the AppImage, including `--appimage-extract-and-run` without FUSE.
- Confirm the version in the window, package metadata and Data settings.
- Check bundled fonts render offline, themes and existing databases remain intact.

## 6. Publish checks

- Confirm the release assets download and install.
- Confirm the source archive matches the recorded checksum.
- Confirm `main` remains clean and the tag points to the intended commit.
- Confirm the release notes do not call unsigned Windows artifacts signed.
- Update any AUR or distribution recipe separately, with its own review and checksum.
