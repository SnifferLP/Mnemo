# Contributing to Mnemo

Thanks for helping improve Mnemo. This project is a local-first desktop application, so changes must preserve offline operation, existing user data and the separation between the React frontend and the Rust/Tauri backend.

## Before you start

- Search existing issues and pull requests before opening a new one.
- For substantial features or schema changes, open an issue first so the approach can be discussed.
- Do not include real API keys, personal study content, database files or machine-specific paths in issues, commits or fixtures.
- Security vulnerabilities must follow [`SECURITY.md`](SECURITY.md), not the public issue tracker.

## Development setup

Requirements:

- Rust stable (use the MSVC toolchain on Windows)
- Node.js 22 LTS or newer
- pnpm 12.18.0
- Linux: WebKitGTK 4.1, GTK 3, libsoup 3 and the Tauri build dependencies
- Windows: Visual Studio Build Tools with the **Desktop development with C++** workload and the WebView2 runtime

```bash
pnpm install --frozen-lockfile
pnpm tauri dev
```

Development builds use `<app data>/dev/` so they do not open the installed application's database.

### Windows notes

- Run the commands from a **Developer PowerShell** or another shell where the MSVC toolchain is available.
- Use the `stable-msvc` Rust toolchain (`rustup default stable-msvc`).
- `src-tauri/tauri.windows.conf.json` selects NSIS and the embedded WebView2 bootstrapper automatically on Windows.
- API keys are DPAPI-protected on Windows. Tests for the key vault run in Windows CI; do not add a raw key file to a fixture or commit.
- Paths with spaces and non-ASCII characters are supported. Please include them when manually checking import, export, media and backup flows.

## Checks before opening a pull request

Run all applicable checks from the repository root:

```bash
pnpm typecheck
pnpm test
pnpm build

cd src-tauri
cargo fmt --all --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test --all-targets
```

CI runs the frontend checks on Linux, the Rust checks on Linux and Windows, the NSIS build on Windows, the Linux package builds and Gitleaks. A pull request should not weaken or skip a failing check.

## Code conventions

- Keep business logic, validation, SQL and file access in Rust. The frontend should call typed command wrappers and render returned state.
- Do not move API keys into the browser, logs, localStorage or React state.
- Keep TypeScript strict and avoid introducing `any` where a model exists.
- Use the existing UI primitives and design tokens instead of one-off styling.
- Do not commit generated packages, build output, databases, `.env` files or local tool metadata.
- Update documentation when behavior, storage, packaging or configuration changes.
- Keep platform-specific code behind `cfg` attributes and preserve the shared code path wherever possible.

## Internationalization

English strings are the source keys. Add every new user-visible string to `src/i18n/messages/de.ts` as well as using `t(...)` in the component. Do not branch on language inside components. User-created sets, cards, notes and AI output must never be translated automatically.

## Database changes

- Migrations live in `src-tauri/migrations/` and are append-only.
- Never edit an already released migration.
- Preserve existing user data and avoid destructive changes without an explicit migration strategy and tests.
- Add or update integration tests in `src-tauri/tests/backend.rs`.

## AI features

- AI is optional. Every new AI path must fail gracefully when no provider or key is configured.
- Never ship a project API key or a default secret.
- Use the existing encrypted key vault and Rust HTTP client. Do not send provider keys to the frontend.
- Document any new provider-specific behavior and test error mapping without real credentials.

## Packaging

Source packages and binary packages are release artifacts and must stay out of Git. See [`docs/RELEASING.md`](docs/RELEASING.md) and [`packaging/arch/README.md`](packaging/arch/README.md). Do not change the version in only one manifest; keep `package.json`, Tauri, Cargo, PKGBUILD and documentation in sync.

## Pull requests

Use the pull request template. Keep changes focused, explain user-visible behavior, list the checks you ran, and note any platform you could not test. By contributing, you agree that your contribution is licensed under the project's MIT License.
