# Flatpak packaging

Mnemo's Linux packages are the **Flatpak** (`com.mnemo.study`) and the **AppImage**. Debian packages are no longer built.

| Item | Value |
| --- | --- |
| Application ID | `com.mnemo.study` |
| Runtime | `org.gnome.Platform//51` (freedesktop-sdk 26.08) |
| SDK | `org.gnome.Sdk//51` |
| SDK extensions | `org.freedesktop.Sdk.Extension.rust-stable//26.08`, `org.freedesktop.Sdk.Extension.node22//26.08` |
| Architectures | `x86_64` (see `flathub.json`) |
| Flathub status | **Prepared, not submitted.** Mnemo is not published on Flathub yet. |

## Files

| File | Purpose |
| --- | --- |
| `com.mnemo.study.yml` | The build manifest, following Flathub conventions. |
| `com.mnemo.study.metainfo.xml` | AppStream metadata: name, summary, description, screenshots, release notes. |
| `com.mnemo.study.desktop` | Desktop entry, named after the application ID. |
| `icons/com.mnemo.study.png` | 512×512 application icon; smaller sizes come from `src-tauri/icons`. |
| `cargo-sources.json` | Every crate in `src-tauri/Cargo.lock`, pinned by SHA-256. |
| `node-sources.json` | Every npm tarball for `pnpm-lock.yaml`, plus the script that pre-populates an offline pnpm store. |
| `flathub.json` | Restricts Flathub builds to `x86_64`. |

The manifest also declares the `pnpm` release binary as a pinned archive, so the build uses the same package manager version as CI without network access.

## Why this runtime

Tauri 2 on Linux links against **WebKitGTK 4.1**, GTK 3 and libsoup 3. `org.gnome.Platform` ships those libraries (including WebKitGTK 4.1) together with GStreamer for card audio, so the Flatpak needs no bundled WebKit and no distribution packages. GNOME 51 is the current stable branch and still provides `libwebkit2gtk-4.1`, which is why it was chosen over `org.freedesktop.Platform` (no WebKit) and older GNOME branches (Flathub rejects stale runtimes).

## Permissions

`finish-args` is deliberately minimal:

| Permission | Why it is needed |
| --- | --- |
| `--socket=wayland`, `--socket=fallback-x11`, `--share=ipc` | Show the GTK window on Wayland and, as a fallback, on X11. |
| `--device=dri` | WebKitGTK renders through EGL/GBM; without it the page falls back to software rendering. |
| `--socket=pulseaudio` | Card audio attachments are played by WebKitGTK through GStreamer. |
| `--share=network` | AI features call the provider the user configures, including a local Ollama. |

There is **no** `--filesystem` permission. Imports, exports, backups and restores use the XDG desktop portal's file chooser, which grants Mnemo access to exactly the files the user picks; the repository link opens through the portal as well. The application writes only to its own sandbox directories.

## Build

Requirements: `flatpak` and `flatpak-builder`, plus the runtime and extensions above:

```bash
flatpak remote-add --user --if-not-exists flathub https://dl.flathub.org/repo/flathub.flatpakrepo
flatpak install --user flathub \
  org.gnome.Platform//51 org.gnome.Sdk//51 \
  org.freedesktop.Sdk.Extension.rust-stable//26.08 \
  org.freedesktop.Sdk.Extension.node22//26.08

flatpak-builder --user --force-clean --disable-rofiles-fuse \
  --default-branch=stable \
  --state-dir=flatpak-state --repo=flatpak-repo flatpak-build \
  packaging/flatpak/com.mnemo.study.yml
```

`--default-branch=stable` matters: Flathub publishes the `stable` branch, so a bundle built for the same branch is updated into the Flathub build later instead of installing a second copy.

The manifest's only source of the repository is a `git` source pinned to the release tag, so a build always compiles the tagged tree.

## Distributable bundle

Flathub publication is the long-term path, but no bundle can be installed from Flathub until Mnemo is accepted there. Every release therefore also ships a standalone bundle that Flatpak installs directly:

```bash
flatpak build-bundle --runtime-repo=https://dl.flathub.org/repo/flathub.flatpakrepo \
  flatpak-repo Mnemo_<version>_x86_64.flatpak com.mnemo.study stable
flatpak install --user ./Mnemo_<version>_x86_64.flatpak
```

`--runtime-repo` points the bundle at Flathub for the GNOME runtime, so the bundle stays small and the runtime is shared with other Flatpak applications.

## Updates

Flatpak owns updates for Flatpak installations. `flatpak update com.mnemo.study`, a software centre, or the Flatpak background updater installs a newer build from the remote the application came from (Flathub once published, or the release bundle otherwise). The in-app Tauri updater detects the sandbox through `/.flatpak-info` and reports in **Settings → Updates** that Flatpak delivers updates; it never downloads an AppImage into a Flatpak installation. This avoids two competing update paths and cannot break the sandbox.

## Regenerating the source lists

`cargo-sources.json` and `node-sources.json` must be regenerated whenever `src-tauri/Cargo.lock` or `pnpm-lock.yaml` changes:

```bash
# Cargo
python3 flatpak-builder-tools/cargo/flatpak-cargo-generator.py \
  -o packaging/flatpak/cargo-sources.json src-tauri/Cargo.lock

# Node / pnpm (pnpm 12 needs store version v11)
flatpak-node-generator --no-requests-cache --pnpm-store-version v11 \
  -o packaging/flatpak/node-sources.json pnpm pnpm-lock.yaml
```

Both tools come from [flatpak-builder-tools](https://github.com/flatpak/flatpak-builder-tools). The `pnpm` archive checksum in the manifest must be updated together with the `packageManager` version in `package.json`.

## Flathub submission

Everything Flathub needs is in this directory, but the submission itself is a separate step that requires a Flathub pull request and reviewer approval:

1. Fork `flathub/flathub` and check out its `new-pr` branch.
2. Create a branch named `com.mnemo.study` and copy `com.mnemo.study.yml`, `com.mnemo.study.metainfo.xml`, `com.mnemo.study.desktop`, `icons/`, `cargo-sources.json`, `node-sources.json` and `flathub.json` into it.
3. Open the pull request and answer the reviewer's questions. Flathub then builds the manifest itself; the source is the tagged GitHub repository, so no build output is uploaded.
4. Only after the pull request is merged is `flatpak install flathub com.mnemo.study` valid. Until then, the release bundle is the only Flatpak distribution channel.

Do not describe Mnemo as available on Flathub before that merge.

## Sandbox audit summary

| Area | Behaviour inside the sandbox |
| --- | --- |
| Data directory | Tauri resolves `$XDG_DATA_HOME/com.mnemo.study`, which Flatpak maps to `~/.var/app/com.mnemo.study/data/com.mnemo.study/`. The SQLite database, `media/` and `secure.key` live there and persist across updates. |
| Database | SQLite with WAL in the app's own sandbox directory; no host paths are used. |
| Imports/exports | File chooser through the portal; the returned document-portal path is readable and writable by the sandboxed process. |
| Media | Stored in the sandbox `media/` directory and served to the webview through Tauri's asset protocol, which is scoped to the app data directory. |
| Settings | Stored in the SQLite database, not in host configuration files. |
| Fonts | Bundled with the frontend through `@fontsource`, so no system font packages are required. |
| Network | AI providers and GitHub release lookups; updates are delegated to Flatpak. |
| Desktop integration | `com.mnemo.study.desktop`, the application ID and the AppStream metadata are exported by the runtime, so GNOME, KDE Plasma and other desktops show the correct name, icon and category. |
| Empty-state security | No host filesystem, no session bus access beyond portals, no device access other than DRM. |
