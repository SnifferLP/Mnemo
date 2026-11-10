# Changelog

All notable changes to Mnemo are documented here. The project follows [Semantic Versioning](https://semver.org/).

## [1.2.1] - 2026-11-10

### Changed

- Reworked the German interface catalogue for consistent flashcard terminology, including “Lernset”, “Intervallwiederholung” and “beherrscht”, with clearer wording across the dashboard, library, settings, study modes and AI screens.
- Updated the German translation tests and README test count to match the 20-test frontend suite.

### Fixed

- Corrected the German label for audio playback from “Spielen” to “Abspielen”.
- Added the missing German confirmation shown when removing an AI provider, including the provider-name placeholder.

## [1.2.0] - 2026-11-10

### Added

- Windows 10/11 x64 support with an NSIS installer, Start Menu entry, application icon and uninstaller.
- Current-user Windows installer setup, so administrator rights are not normally required.
- Windows DPAPI protection for the local API-key vault, with an atomic migration from the pre-1.2.0 raw key format.
- Windows CI that runs frontend and Rust checks, builds the NSIS installer and uploads it as an artifact.
- Multi-platform release automation for Windows, Linux and Arch artifacts, including a source archive and SHA-256 checksums.
- Shared bundle metadata for publisher, copyright and project homepage.

### Changed

- Mnemo is now documented and packaged as a Windows and Linux desktop application.
- The README has been reorganized around installation, platform support, privacy, development and support.
- Linux bundle configuration remains the default for Linux builds; Windows-specific packaging lives in `tauri.windows.conf.json`.
- Arch source archives exclude the self-referential `PKGBUILD`; the recipe checksum is pinned to the generated archive.
- `.gitignore` now covers Windows debugger and Visual Studio output.

### Security

- Provider API keys remain encrypted at rest with AES-256-GCM and are never exposed to the frontend.
- Windows stores the master key as a DPAPI-protected blob bound to the current user.
- Linux continues to write `secure.key` with mode `0600`.
- Windows installers are currently unsigned and are documented as such. No unsigned artifact is presented as signed.
- No project API keys, telemetry or cloud account are required.

## [1.1.0] - 2026-11-10

### Added

- Typography setting with **Editorial Serif** (Instrument Serif) and **Modern Sans** (Source Sans 3).
- Complete English and German interface localization, including study modes, dialogs, settings, empty states and notifications.
- Locale-aware dates, weekdays, months and plural formatting.
- Offline bundled fonts and a third-party license notice.

### Changed

- Display typography is now configurable without changing UI or monospace fonts.
- Preference persistence now includes display font and language.
- Documentation and packaging metadata target the public 1.1.0 release.

### Security

- Provider API keys remain encrypted at rest with AES-256-GCM and are never exposed to the frontend.
- No project API keys, telemetry or cloud account are required.

## Earlier versions

Mnemo 1.0.x were private development builds and are not part of the public release history.
