# Mnemo

**A quieter way to remember.**

Mnemo is a local-first desktop study application for flashcards, spaced repetition and deliberate practice. It combines a fast native shell with a focused interface, keeps the library in a local SQLite database, and treats AI assistance as an optional feature rather than a requirement.

Mnemo is built with **Tauri 2**, **React**, **TypeScript** and **Rust**. There is no account system, no telemetry and no vendor-hosted service.

## Status

The current release is **1.1.0**. Linux x86_64 is the primary, tested platform. Windows is a secondary source target and is not covered by the release CI yet. macOS is not currently supported or tested.

## Screenshots

Clean product screenshots are intentionally not committed yet. Before the first public release, add sanitized captures to `docs/screenshots/` and link them here:

| View | Suggested file |
| --- | --- |
| Dashboard | `docs/screenshots/dashboard.png` |
| Study set overview | `docs/screenshots/set-overview.png` |
| Flashcards / writing mode | `docs/screenshots/study.png` |
| Statistics | `docs/screenshots/statistics.png` |
| Settings and typography | `docs/screenshots/settings.png` |

See [`docs/screenshots/README.md`](docs/screenshots/README.md) for capture requirements. Do not include real study content, names, provider keys or machine paths.

## Features

### Library and organization
- Study sets with descriptions, language pairs, tags, folders and favourites
- Nested folders, search, sorting, duplication and progress reset
- Rich cards with front/back text, explanation, hint, card type, image and audio attachments
- CSV, TSV, JSON and Quizlet-style text import; CSV, TSV, JSON, Markdown and PDF export

### Learning modes
- **Flashcards** with keyboard controls and a 3D flip animation
- **Adaptive learning** with a weighted queue for weak, overdue and new cards
- **Writing** with normalized answers, configurable typo tolerance and optional AI grading
- **Spaced repetition** using SM-2 scheduling
- **Practice tests** with multiple choice, true/false, free text, fill-in-the-blank and matching questions
- **Matching game** with a per-set best time

### Insights
- Due counts, daily goal, streak and recent activity
- 7/30/90/365-day statistics, a 30-week heatmap, mastery distribution and per-set progress
- Review accuracy and study time derived from local history

### Optional AI
- OpenAI, OpenRouter, Mistral, Gemini, Ollama and custom OpenAI-compatible endpoints
- Card generation from text and TXT/MD/PDF/DOCX/PPTX/ODT/EPUB documents
- Magic Notes summaries, definitions, cards, quizzes and study guides
- Tutor chat with configurable set, gap and history context
- API keys are encrypted at rest and never sent to the frontend

### Interface
- English and German UI with locale-aware dates and plurals
- Editorial Serif and Modern Sans display-font options
- Light/dark/system themes, accent colours and reduced-motion support
- All required fonts are bundled and work offline

## Supported platforms

| Platform | Status | Distribution |
| --- | --- | --- |
| Linux x86_64 | Primary, tested | Arch package, `.deb`, AppImage |
| Windows x86_64 | Secondary source target; not release-tested | Build locally with Tauri |
| Linux aarch64 | Not currently released | Source build may work; no package is published |
| macOS | Not supported or tested | — |

Prebuilt artifacts are produced for Linux x86_64 only. Do not assume that an untested platform build is supported just because Tauri can target it.

## Installation

Download release assets from the repository's **Releases** page. Generated packages are not committed to this repository.

### Arch Linux

```bash
sudo pacman -U mnemo-<version>-1-x86_64.pkg.tar.zst
```

### Debian / Ubuntu

```bash
sudo apt install ./Mnemo_<version>_amd64.deb
```

### AppImage

```bash
chmod +x Mnemo_<version>_amd64.AppImage
./Mnemo_<version>_amd64.AppImage
```

The AppImage requires FUSE 2. Without FUSE, run it with `--appimage-extract-and-run`.

## Build from source

### Requirements

- Rust stable (`rustup` recommended)
- Node.js 22 LTS or newer
- pnpm 12.18.0 (also declared in `package.json`)
- Linux: WebKitGTK 4.1, GTK 3, libsoup 3 and the usual Tauri build dependencies

```bash
# Debian / Ubuntu
sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libsoup-3.0-dev \
  libayatana-appindicator3-dev librsvg2-dev patchelf build-essential \
  curl file pkg-config

# Fedora
sudo dnf install webkit2gtk4.1-devel gtk3-devel libsoup3-devel \
  librsvg2-devel openssl-devel patchelf

# Arch Linux
sudo pacman -S webkit2gtk-4.1 gtk3 libsoup3 librsvg patchelf base-devel
```

Windows needs WebView2, the MSVC build tools and the Rust MSVC toolchain. Windows builds are a secondary target and are not verified by the project CI.

### Development

```bash
git clone <repository-url>
cd mnemo
pnpm install --frozen-lockfile
pnpm tauri dev
```

Vite serves the UI on `http://127.0.0.1:1420`; Tauri opens the native window. Development builds use a separate `dev` data directory so they cannot modify an installed library.

### Production build

```bash
pnpm tauri build
```

On Linux this produces `.deb` and `.AppImage` bundles under `src-tauri/target/release/bundle/`. On Windows, pass the desired Tauri bundle target explicitly; no Windows artifacts are published by this repository yet.

### Arch Linux packaging

Build the release binary without Tauri's own Linux bundles, then create the Arch package:

```bash
pnpm tauri build --no-bundle
./packaging/arch/build-binary-package.sh
```

`packaging/arch/PKGBUILD` is the source-package recipe. It expects the release source archive next to the PKGBUILD; maintainers generate and attach that archive to a release. See [`packaging/arch/README.md`](packaging/arch/README.md) and [`docs/RELEASING.md`](docs/RELEASING.md).

## AI provider configuration

AI is optional. Without a provider, the library, study modes, statistics, import/export and backups all work normally.

1. Open **Settings → AI providers → Add provider**.
2. Select a preset or **Custom**.
3. Enter the base URL and model.
4. Paste your own API key. For local Ollama, leave the key empty and use `http://localhost:11434/v1`.
5. Test the connection and mark the provider as default.

Mnemo sends a request only when you trigger generation, grading, model listing or chat. AI-generated material is requested in the language you specify and is independent of the interface language.

## Privacy and local data

Mnemo has no accounts, telemetry, analytics, cloud sync or bundled API keys. The application creates its own data directory on first launch and inserts no demo data.

| Data | Default location |
| --- | --- |
| Linux data directory | `$XDG_DATA_HOME/com.mnemo.study/` or `~/.local/share/com.mnemo.study/` |
| Windows data directory | `%APPDATA%\com.mnemo.study\` |
| Database | `<data dir>/mnemo.db` (SQLite, WAL mode) |
| Media attachments | `<data dir>/media/` |
| API-key vault | `<data dir>/secure.key` (mode `0600` on Unix) |
| Development builds | `<data dir>/dev/` |

The exact active paths are shown in **Settings → Data**.

Provider API keys are encrypted with AES-256-GCM before being written to SQLite. The master key is stored in `secure.key`; it never enters the frontend and is not logged. Backups created from Settings are ordinary SQLite copies and are **not** encrypted, so store them accordingly.

When you use an AI provider, the selected prompt and context are sent directly to that provider under its own privacy terms. Mnemo does not proxy requests through a project-operated server.

To remove all local data, quit Mnemo and delete its data directory.

## Architecture

```text
src-tauri/
  src/
    lib.rs              Tauri setup, app-data directory, command registration
    db.rs               SQLite pool, WAL, migrations
    crypto.rs           AES-256-GCM key vault for provider keys
    settings.rs         persisted preferences and sanitization
    learning.rs         queue selection, answer checking, test generation
    spaced_repetition.rs SM-2 scheduling and mastery
    import.rs           CSV/TSV/JSON/Quizlet and document extraction
    export.rs           CSV/TSV/JSON/Markdown and PDF generation
    statistics.rs       dashboard, ranges and aggregates
    ai/                 provider client, prompts and response parsing
    services/           sets, cards, folders, media, documents, providers
    commands/           thin Tauri command boundary

  migrations/           append-only SQL migrations

src/
  lib/api.ts            typed Tauri invoke wrappers
  lib/types.ts          TypeScript mirrors of Rust models
  i18n/                 centralized English-key / German catalog runtime
  components/           UI primitives, charts, layout and editors
  pages/                library, authoring, AI, statistics, settings, study modes
  context/              settings, theme, font and language application
```

All mutations are validated in Rust. The frontend only renders state returned by Tauri commands. SQLite foreign keys cascade deletes, and every card receives a progress row so scheduling state is always defined.

## Testing

```bash
pnpm typecheck
pnpm test
pnpm build

cd src-tauri
cargo fmt --all --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test --all-targets
```

The frontend suite covers learning-round state, settings merging and translation catalogues. Rust tests cover SM-2 transitions, answer normalization, import/export, AI request construction, settings sanitization, migrations, CRUD, statistics, persistence across database reopen and database upgrade behavior.

## Troubleshooting

**The Linux build cannot find WebKitGTK.** Install the development packages listed above; the runtime package alone is not enough.

**The AppImage does not start.** Install FUSE 2, or run `./Mnemo_<version>_amd64.AppImage --appimage-extract-and-run`.

**AI requests fail with 401/403.** Check the provider key, base URL and model. Keys are not shown again after saving; replace the key if necessary.

**AI requests fail with a connection error.** Confirm that a local Ollama server is running, or that the provider endpoint is reachable from this machine.

**PDF export loses non-Latin characters.** The built-in PDF writer uses Helvetica/WinAnsi. Use JSON or Markdown for full Unicode, or print from a browser.

**A scanned PDF has no text.** OCR is not bundled. Paste the text or use a searchable PDF.

**The window is empty after a database restore.** Restore only a Mnemo SQLite backup, keep the app closed during replacement, and relaunch. The original database is retained as a timestamped backup.

## Known limitations

- No cloud sync, sharing links, mobile app or multi-user accounts.
- AI quality and availability depend on the configured provider.
- AI grading costs provider tokens and is off by default.
- Scanned documents require external OCR.
- PDF export uses a limited built-in font encoding.
- Test papers are stored locally without a separate answer-key permission model; Mnemo is a single-user desktop app.
- Windows is a secondary target without published artifacts or CI coverage.
- macOS is not currently supported.

## Contributing

Contributions are welcome. Read [`CONTRIBUTING.md`](CONTRIBUTING.md) before opening a pull request. By participating, you agree to follow the [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).

For security issues, use the private reporting process in [`SECURITY.md`](SECURITY.md), not a public issue.

## License

Mnemo's source code is released under the **MIT License**; see [`LICENSE`](LICENSE).

Bundled fonts are licensed separately under the **SIL Open Font License 1.1**. Third-party components and their licenses are documented in [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md). The MIT license does not replace those terms.
