# Changelog

All notable changes to Mnemo are documented here. The project follows [Semantic Versioning](https://semver.org/).

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
