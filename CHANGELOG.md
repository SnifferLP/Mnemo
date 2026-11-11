# Changelog

All notable changes to Mnemo are documented here. The project follows [Semantic Versioning](https://semver.org/).

## [1.2.4-rc.1] - 2026-11-11

A visual release. Navigation, routes, workflows and stored data are unchanged.

### Changed

- Rebuilt the interface around a card dashboard: a soft cool-grey canvas, white surfaces with 12–24 px radii, soft shadows and significantly fewer visible borders.
- Introduced a centralised design system in `src/index.css` covering background, surface, text and accent colours, radii, elevation, spacing, typography, control sizes and interactive states, documented in `docs/DESIGN.md`.
- Moved the accent palette to a cobalt-led scheme, including a brighter dark-theme accent and retuned ember, violet, teal, rose and amber variants. Blue is now the default accent for new installations; existing stored preferences are kept.
- Restyled every screen and shared component: dashboard, study sets, set detail, folders, create, AI assistant, Magic Notes, editor, statistics, archive, settings, study session, practice test and matching game.
- Replaced underline tabs with soft segmented controls and converted outlined panels, metadata rules and list dividers into tinted surfaces, chips and spacing.
- Restyled dialogs, dropdowns, select menus, popovers, tooltips, switches, sliders, progress bars, empty states, loading panels and error panels to match the new surfaces.
- Rebuilt the sidebar as a floating card rail with a tinted active state, keeping labels, icons, order and destinations unchanged.
- Updated the dark theme with the same surface, elevation and contrast rules as the light theme.

### Fixed

- Keyboard focus on inputs and selects now shows a visible accent outline instead of relying on a border colour change.

## [1.2.3] - 2026-11-11

### Added

- Automatic in-app updates for Windows x64 NSIS installations and Linux x86_64 AppImages using the official Tauri 2 updater plugin.
- Stable and pre-release update channels, defaulting to Stable Releases and persisted with the other local settings.
- A non-blocking bottom-right update notification with release notes, download progress, signature verification and explicit Later/Dismiss actions.
- A Settings → Updates section with channel selection, installed version, manual checks, loading/error feedback and support information.
- Signed updater artifacts and a generated `latest.json` manifest in the release pipeline, with separate stable/pre-release GitHub release discovery.

### Fixed

- Imported documents in the AI Generator can now be removed individually. Removing a document deletes its stored row, clears only its selection state and leaves other documents untouched.
- Missing or stale document references are ignored by generation instead of breaking AI requests.

### Changed

- Normal CI builds remain unsigned and do not require the updater private key. Only release builds use the updater-enabled configuration and signing secrets.
- The release workflow now refuses to publish updater metadata if the expected signatures are missing.

### Security

- Updater artifacts are signed with the Tauri minisign key. The public key is embedded in the application; the encrypted private key and password are stored only as GitHub Actions secrets.
- Stable-channel checks never consider GitHub pre-releases. Pre-release checks may consider both pre-release and stable releases.

## [1.2.2] - 2026-11-11

### Added

- Study set archiving with a dedicated Archive view, restore actions and permanent deletion of archived sets. Archived data keeps its cards, progress and learning history but stays out of active study queues and active library statistics.
- A persistent local-day learning ledger that tracks current and longest consecutive-day streaks.
- Application version and GitHub repository information at the bottom of Settings, using the existing runtime version metadata.

### Changed

- Redesigned the study set detail view around prominent, colour-accented learning-mode cards with clearer hierarchy and interaction feedback.
- Streaks now count one local calendar day per qualifying review or completed session, survive restarts and remain available after a set is archived or deleted.
- The statistics and dashboard views now keep global metrics visible when the active library contains zero sets.

### Fixed

- Global statistics no longer disappear after deleting the last study set.
- Added database migration and integration coverage for archive state, streak persistence, missed days, same-day sessions, restarts, date boundaries and upgrades from v1.2.1.

This release is published as a **pre-release** while interactive Windows and Linux QA is completed.

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
