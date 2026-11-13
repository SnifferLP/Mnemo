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

## 3. Updater signing

Mnemo uses the official Tauri 2 updater for Windows x64 NSIS builds and Linux x86_64 AppImages. The `.deb` and Arch packages intentionally do not use the in-app updater.

The updater key pair is created once with:

```bash
tauri signer generate -w ~/.tauri/mnemo-updater.key
```

Only the **public** key belongs in `src-tauri/tauri.conf.json` under `plugins.updater.pubkey`. Never commit the private key or its password. The release repository must contain these Actions secrets:

- `TAURI_SIGNING_PRIVATE_KEY` — the encrypted private key content (not a repository file).
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — its password.

Store a secure backup of both. If the private key is lost, existing installations cannot verify future updates and users would have to install a new build manually.

Normal CI builds deliberately do not require the key. Only release builds pass `--config src-tauri/tauri.release.conf.json` and receive the two secrets. That config enables `bundle.createUpdaterArtifacts`; it must not be enabled for an unsigned build, because Tauri will reject a public key without a private signing key.

## 4. Build the artifacts

### Windows

The supported build is Windows x64 with the MSVC Rust toolchain and Node.js 22. The platform configuration selects NSIS and the embedded WebView2 bootstrapper:

```powershell
pnpm install --frozen-lockfile
pnpm tauri build --bundles nsis
```

Expected bundle:

- `src-tauri/target/release/bundle/nsis/Mnemo_<version>_x64-setup.exe`
- `src-tauri/target/release/bundle/nsis/Mnemo_<version>_x64-setup.exe.sig` when the updater-enabled config and signing secret are present

The Windows Authenticode installer remains **unsigned**. Do not describe it as code-signed. SmartScreen may warn users about an unknown publisher. The separate Tauri `.sig` file signs the updater payload; it is not a Windows Authenticode signature.

### Linux AppImage and Debian package

```bash
pnpm tauri build
```

Expected bundles:

- `src-tauri/target/release/bundle/appimage/Mnemo_<version>_amd64.AppImage`
- `src-tauri/target/release/bundle/appimage/Mnemo_<version>_amd64.AppImage.sig` when the updater-enabled config and signing secret are present
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

## 5. Automated GitHub Release workflow

Publishing a GitHub Release triggers `.github/workflows/release.yml`. It runs these jobs in parallel:

1. Windows checks and signed NSIS installer.
2. Linux signed AppImage and `.deb`.
3. Arch package.
4. Source archive.

After all four succeed, the publish job downloads the artifacts, verifies that the Windows and AppImage signatures exist, writes a `latest.json` manifest with the signed Windows and Linux entries, writes `SHA256SUMS`, and attaches everything to the existing release. The workflow does not create the release or tag. It fails instead of publishing a manifest that references a missing or unsigned artifact.

The release build requires both updater secrets. The reusable build workflows check for them before compiling. If either is missing, the release fails with an explicit error; normal CI builds remain unsigned and do not need the secrets.

### Ubuntu apt configuration and mirror failures

The hosted image resolves apt through `mirror+file:/etc/apt/apt-mirrors.txt`,
which selects `azure.archive.ubuntu.com`. That resolver fails intermittently
(`Temporary failure resolving 'azure.archive.ubuntu.com'`). apt then keeps the
index metadata it did fetch, prints `0 upgraded, 181 newly installed`, and walks
the package list one download timeout at a time, so the step looks hung instead
of failed.

`scripts/ci/install-linux-deps.sh` is the single implementation of this workaround. Both
`build-linux.yml` (release bundles) and `ci.yml` (Rust checks) call it, so the two jobs
cannot drift apart. It takes an optional package list and defaults to the full Tauri
dependency set. The step:

- prints the runner's apt configuration, `resolv.conf` and the DNS result for
  each Ubuntu host;
- probes four HTTPS mirrors for `noble`, `noble-updates`, `noble-backports` and
  `noble-security` and uses the first that serves all four;
- moves `sources.list.d/*` aside and writes a single explicit `sources.list` for
  that mirror, so nothing can fall back to `mirror+file` and no unrelated
  repository can mask a failure;
- runs `apt-get update -o APT::Update::Error-Mode=any`, so any failing repository
  is fatal, then checks that a noble package index exists and that every required
  package has a candidate version before installing anything;
- bounds every acquire (`Acquire::http::Timeout=10`, `Acquire::https::Timeout=10`,
  `Acquire::Retries=2`, `Acquire::ForceIPv4`, `DPkg::Lock::Timeout=60`), installs
  with `--no-install-recommends`, verifies every package with `dpkg -s`, and runs
  inside a five minute step timeout (30 minutes for the Rust checks job, 75 minutes for the
  Linux bundle job).

Measured on the release recovery run: 2 m 37 s for update plus install.

The runner image stays on `ubuntu-24.04`. `ubuntu-22.04` was evaluated as a
reliability fallback and rejected as a fix: both hosted images sit behind the
same Azure resolver, so the image version does not change DNS behaviour, and
switching would mask the failure rather than address it. 24.04 also matches the
glibc baseline the AppImage targets and ships `libwebkit2gtk-4.1-dev` directly.

### Recovering an incomplete release

A run triggered by the `release` event resolves its workflow files from the tag
itself, so a workflow fix on `main` cannot reach an existing tag, and moving the
tag is never an option. `release.yml` therefore also accepts a manual dispatch
with an explicit target tag:

```bash
gh workflow run release.yml --ref main -f tag=v1.2.4
```

The dispatch run checks out the tag for application source, uses the current
workflow logic from `main`, rebuilds every artifact and attaches them to the
existing release. It resolves the tag, the release body and the pre-release flag
from the release itself, so recovery cannot flip a stable release to a
pre-release or vice versa. If no release exists for the tag the run fails; it
never creates a tag, a release or a rewrite of history.

The workflow preserves the release's pre-release flag. Publish a pre-release only for test builds; publish the normal stable release without the pre-release flag. The in-app Stable Releases channel filters out any GitHub release marked as a pre-release.

### Update channels and discovery

At runtime Mnemo calls the GitHub releases API, filters drafts and the selected channel, compares SemVer versions, and then asks Tauri's updater to fetch `latest.json` from the exact selected release tag. It does not use `/releases/latest` for both channels. Stable only accepts releases with `prerelease=false`; Pre-Releases accepts stable and pre-release releases. An update is offered only when its manifest exists and Tauri accepts it for the current target.

The manifest includes:

- `windows-x86_64` pointing to the NSIS installer and its `.sig`.
- `linux-x86_64` pointing to the AppImage and its `.sig`.

Never hand-edit a published manifest to point at a different release. Re-run the release workflow instead.

Create the tag and release only after the version commit is on `main` and CI is green. The release must be published rather than left as a draft to start the workflow.

## 6. Verify artifacts and manual QA

```bash
sha256sum \
  src-tauri/target/release/bundle/appimage/Mnemo_<version>_amd64.AppImage \
  src-tauri/target/release/bundle/appimage/Mnemo_<version>_amd64.AppImage.sig \
  src-tauri/target/release/bundle/deb/Mnemo_<version>_amd64.deb \
  packaging/arch/mnemo-<version>-1-x86_64.pkg.tar.zst \
  packaging/arch/mnemo-<version>.tar.gz
```

Download all release assets, including the normal packages, both updater signatures, `latest.json` and `SHA256SUMS`, and verify them. Confirm `latest.json` has the same version as the tag and that both entries carry non-empty signatures. Confirm the Stable Releases channel does not accept a pre-release tag.

### Automated coverage

CI checks:

- TypeScript, frontend tests and production frontend build on Linux and Windows.
- Rust formatting, Clippy and Rust tests on Linux and Windows.
- NSIS installer creation and artifact upload.
- Linux AppImage and `.deb` creation.
- Arch package creation.
- Gitleaks secret scanning.
- actionlint on every `.github/workflows/*.yml` and `*.yaml` file, plus `bash -n`
  and ShellCheck 0.11.0 on every tracked `*.sh` script (including
  `scripts/ci/install-linux-deps.sh`). Pinned versions and checksums live in
  the `workflow-lint` job in `ci.yml`; update both together.

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

### Manual updater QA

On Windows x64 and Linux x86_64 AppImage builds, verify at least:

- Startup completes without waiting for the GitHub check; a blocked network does not prevent launch.
- Stable Releases with only a pre-release above the installed version reports no update.
- Pre-Releases sees the same pre-release and shows the notification once.
- Switching channels persists across restart and the next check uses the new channel.
- Later dismisses the notification and it does not reappear for the same version in that session.
- Download shows progress, the signature is accepted, the app restarts or the NSIS installer relaunches it, and user data/settings survive.
- A deliberately invalid signature, missing asset or download failure leaves the current installation usable and shows an error.
- Package-managed `.deb` and Arch builds report that automatic updates are handled by the package manager.

## 7. winget publishing (automatic)

The package `SnifferLP.Mnemo` is published to Microsoft's Windows Package Manager repository (`microsoft/winget-pkgs`). `.github/workflows/winget-release.yml` keeps it up to date; no manual step is needed for a normal release.

The identifier is `SnifferLP.Mnemo`. Its `Publisher` field stays `The Mnemo Authors`, which is what the application and the installer report; the identifier prefix does not have to match the publisher name. The first submission started as `TheMnemoAuthors.Mnemo` and was renamed in the same pull request before being merged, so only one package identifier ever exists.

### How it works

1. Publishing a GitHub Release starts the workflow. Drafts never emit the event, and both events and manual runs are rejected unless the release is stable — a tag such as `v1.2.6-rc.1` is refused.
2. The tag must equal `package.json`'s version at that tag and must be a plain `X.Y.Z` version, otherwise the run fails before anything is downloaded.
3. The workflow refuses to continue when the version is already in `winget-pkgs` (nothing happens, the run is green with a summary notice), when an open `winget-pkgs` pull request already mentions it, or when the version is not newer than the newest published one.
4. It waits up to 45 minutes for `Mnemo_<version>_x64-setup.exe` to be attached to the release, because the release workflow builds the installer after the release is published.
5. It downloads the installer, computes its SHA-256 and cross-checks it against the release's `SHA256SUMS` asset. A mismatch is fatal.
6. It installs a pinned `wingetcreate` (`1.28.1.0`) and verifies the download's SHA-256.
7. `wingetcreate update SnifferLP.Mnemo` rewrites only the installer URL, hash, version, release date and release-notes URL of the existing package, so publisher, license, tags, `InstallerType: nullsoft`, `Scope: user` and the `Silent: /S` switch from the first submission are preserved. The workflow then asserts every one of those fields is present in the output.
8. `winget validate --manifest <dir>` validates the files; `wingetcreate submit` validates them again with the same engine and opens the pull request.
9. The run fails if no pull request URL is reported or if the pull request is not open afterwards. A failure also writes a `FAILED` section to the run summary, so a broken run is never summarized as a success.

Pull requests are titled `Update: SnifferLP.Mnemo to <version>`; the first submission used `New package: … version 1.2.5`.

The initial submission (PR #479558) must be merged before the automation can update the package: `wingetcreate update` reads the existing manifest from `winget-pkgs` and the workflow stops with an explicit error while the package is unknown there.

### Required secret

| Secret | Contents |
| --- | --- |
| `WINGET_GITHUB_TOKEN` | A **classic** GitHub personal access token belonging to the account that owns the fork, with the `public_repo` scope. The optional `delete_repo` scope lets wingetcreate remove a fork it created when submission fails. |

Fine-grained tokens are not supported by wingetcreate. Create the token at **Settings → Developer settings → Personal access tokens (classic)**, then add it under **Settings → Secrets and variables → Actions**. The workflow passes it to `wingetcreate` through the `WINGET_CREATE_GITHUB_TOKEN` environment variable, never as a command-line argument. Only the manifest-generation and submission steps receive it; the generation step needs it so the `winget-pkgs` lookups are authenticated instead of sharing the anonymous 60-requests-per-hour limit of hosted runner IPs. A dry run still works when the secret is absent.

No other secret is needed. The workflow itself runs with `permissions: contents: read` and uses the default `GITHUB_TOKEN` only to read the release and query `winget-pkgs`.

### Testing the workflow without releasing

`workflow_dispatch` accepts an existing stable tag and a `dry_run` input that defaults to `true`:

```bash
# Generate and validate the manifests, upload them as an artifact, open no PR
gh workflow run winget-release.yml --ref main -f tag=v1.2.5 -f dry_run=true

# Same pipeline with submission enabled (only for a version that is not published yet)
gh workflow run winget-release.yml --ref main -f tag=v1.2.6 -f dry_run=false
```

A dry run on an already published version regenerates and revalidates it; that is the way to exercise the whole pipeline without touching `winget-pkgs`.

### Troubleshooting

| Summary / error | Meaning and action |
| --- | --- |
| `already published` | The version is already in `winget-pkgs`. Nothing to do; no PR was opened. |
| `pull request already open` | An open PR already covers this version. Wait for it to be merged instead of opening another. |
| `is marked as a pre-release` / `is a draft` | Only stable releases are mirrored. Publish the stable release without the pre-release flag. |
| `package.json at … declares version …` | The tag and the committed version disagree. Fix the version commit and re-tag. |
| `is not newer than the latest published` | The release is older than what `winget-pkgs` already has; nothing is submitted. |
| `Installer … did not appear … within 45 minutes` | The release workflow did not attach the NSIS installer. Re-run `release.yml` for that tag, then re-run this workflow. |
| `SHA256 mismatch` | The published asset and `SHA256SUMS` disagree; treat the release as broken and rebuild it. |
| `WINGET_GITHUB_TOKEN is not set` | Add the repository secret described above. |
| `wingetcreate update failed … after 3 attempt(s)` | The tool retries transient failures twice (20 s apart) before failing. Read the printed log: a rate limit means the token is missing or exhausted, a missing package means the initial submission is not merged yet, and a manifest error needs a field fix. |
| `wingetcreate submit failed` | Read the log in the run output. Validation errors are usually a field problem in the manifest; see the [validation failure guide](https://github.com/microsoft/winget-pkgs/blob/master/doc/ValidationFailureGuide.md). |
| `winget CLI unavailable` | The runner image lost the App Installer MSIX. Validation still runs inside `wingetcreate`, and the summary records that `winget validate` was skipped. |

Microsoft's own validation pipeline runs on the pull request afterwards. A red check there blocks merging and needs a manifest fix, not an app change.

### Manual fallback

If automation fails and a release still needs to reach winget, run the same steps by hand on Windows:

```powershell
$env:WINGET_CREATE_GITHUB_TOKEN = '<classic PAT with public_repo>'
$version = '1.2.6'
$url = "https://github.com/SnifferLP/Mnemo/releases/download/v$version/Mnemo_${version}_x64-setup.exe"

wingetcreate update SnifferLP.Mnemo `
  --urls $url `
  --version $version `
  --release-date 2026-11-20 `
  --release-notes-url "https://github.com/SnifferLP/Mnemo/releases/tag/v$version" `
  --out manifests `
  --no-open

winget validate --manifest manifests\SnifferLP\Mnemo\$version
wingetcreate submit --prtitle "Update: SnifferLP.Mnemo to $version" --no-open manifests\SnifferLP\Mnemo\$version
```

The workflow uploads every generated manifest as the `winget-manifests-<version>` artifact, so a failed run can be inspected and resubmitted without regenerating anything.

## 8. Publish checks

- Confirm the release assets download and install.
- Confirm the source archive matches the recorded checksum.
- Confirm `main` remains clean and the tag points to the intended commit.
- Confirm the release notes distinguish the Windows Authenticode signing status from the Tauri updater signature.
- Confirm the release includes `latest.json`, both `.sig` files and the normal packages.
- Update any AUR or distribution recipe separately, with its own review and checksum.
