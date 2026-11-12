# Third-party notices

Mnemo's original source code is licensed under the MIT License in [`LICENSE`](LICENSE). The following components keep their own licenses. The MIT License does not relicense them.

## Bundled fonts

The font files are bundled with the application and work offline.

| Font | Copyright | License |
| --- | --- | --- |
| Instrument Serif | Copyright 2022 The Instrument Serif Project Authors | SIL Open Font License 1.1 |
| Instrument Sans | Copyright 2022 The Instrument Sans Project Authors | SIL Open Font License 1.1 |
| Source Sans 3 | Copyright Google Inc. | SIL Open Font License 1.1 |
| JetBrains Mono | Copyright 2020 The JetBrains Mono Project Authors | SIL Open Font License 1.1 |
| Monocraft | Copyright (c) 2022 Idrees Hassan ([IdreesInc/Monocraft](https://github.com/IdreesInc/Monocraft)) | SIL Open Font License 1.1 |

The complete SIL Open Font License 1.1 text is in [`licenses/OFL-1.1.txt`](licenses/OFL-1.1.txt). Monocraft is redistributed unmodified as published in its upstream release, and its own license file — including the copyright notice — is included verbatim in [`licenses/Monocraft-OFL-1.1.txt`](licenses/Monocraft-OFL-1.1.txt). No Reserved Font Name is declared by the upstream project. Font projects and their source repositories are listed in the corresponding `@fontsource` package metadata in the dependency tree.

## Runtime dependencies

| Component | License |
| --- | --- |
| Tauri and Tauri plugins | MIT OR Apache-2.0 |
| React, React DOM, React Router | MIT |
| Radix UI primitives | MIT |
| Lucide icons (`lucide-react`) | ISC |
| Sonner | MIT |
| react-markdown, remark-gfm | MIT |
| class-variance-authority | Apache-2.0 |
| clsx, tailwind-merge | MIT |
| Tailwind CSS and Vite tooling | MIT |
| SQLx, Tokio, Serde, Reqwest, uuid, chrono and other Rust crates | MIT and/or Apache-2.0, as declared by each crate |
| windows-sys (Windows build) | MIT OR Apache-2.0 |
| Microsoft WebView2 Runtime | Microsoft proprietary; installed by the Windows bootstrapper when missing, not redistributed by Mnemo |
| AES-GCM, base64, getrandom and related cryptography crates | MIT OR Apache-2.0 |
| PDF extraction, ZIP, XML and document parsing crates | MIT and/or Apache-2.0, as declared by each crate |

Some build-time and transitive components use MPL-2.0: `lightningcss` (CSS processing) and the Rust crates `cssparser`, `cssparser-macros`, `dtoa-short`, `option-ext` and `selectors`. They are used unmodified; their source is available from their upstream projects under MPL-2.0. Other transitive licenses include Unicode-3.0, Zlib, BSD, ISC, CC0 and bzip2-1.0.6. There is no GPL-only dependency in the resolved graph.

`pnpm-lock.yaml` and `src-tauri/Cargo.lock` contain the complete resolved dependency sets. License texts for npm packages are included in their published packages; Rust crate license metadata is available through `cargo metadata` and the crate sources. Distributors of binary builds should include this notice, the project license, the OFL text and the MPL-2.0 notices for the components listed above.

## Application artwork

The Mnemo wordmark and application icon are original project artwork. The interface uses Lucide icon components under the ISC license; those components are not claimed as Mnemo artwork.
