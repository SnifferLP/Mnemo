# Security policy

## Supported versions

| Version | Supported |
| --- | --- |
| 1.2.x | Yes |
| Earlier versions | No |

## Reporting a vulnerability

Do **not** open a public issue for a suspected vulnerability. Use the repository's **Security** tab and choose **Report a vulnerability** to open a private GitHub Security Advisory. Include:

- A short description of the issue and its impact
- Affected version and platform
- Reproduction steps or a minimal proof of concept
- Relevant logs or screenshots with secrets, study content and personal paths removed

Never include a live API key, `secure.key`, database file, access token or private study material. If a credential was exposed, revoke it with the provider first.

Maintainers will acknowledge reports as capacity allows and will coordinate disclosure after a fix is available. This is a volunteer project; no response-time guarantee is made.

## Areas of interest

- Exposure of provider API keys or the local encryption key
- SQL injection, unsafe path handling or arbitrary file access through imports, media or backups
- Tauri command or capability boundary issues
- XSS or unsafe rendering of imported content
- Data loss during migration, restore or database replacement
- Supply-chain or CI credential issues

## Out of scope

- Compromise of the operating-system account that already has access to the local data directory
- Vulnerabilities in a third-party AI provider or its service
- Provider bills or account misuse caused by a key the user intentionally configured
- Social engineering or physical access
- Issues that require a modified build with removed security controls

## Local security model

Mnemo is a single-user desktop application. It does not provide multi-user isolation.

Provider API keys are encrypted at rest with AES-256-GCM using a local master key in `secure.key`. The key itself is protected according to the platform:

- **Linux:** `secure.key` is written with mode `0600`. Only the operating-system account running Mnemo can read it.
- **Windows:** `secure.key` is wrapped with **Windows DPAPI** using the current user's credentials before it is written. Windows cannot decrypt it for another user profile or another machine. The file is replaced atomically so an interrupted write does not destroy an existing key.

On Windows, the raw key format used by development builds before 1.2.0 is detected and migrated to DPAPI on first load. The original file is left in place if protection or atomic replacement fails, so a failed migration does not silently lose keys.

The master key is readable by the operating-system account that runs Mnemo. Disk encryption, OS account security and protection against malware running as that user remain the user's responsibility. Backups made from Mnemo are ordinary SQLite copies and are not encrypted.

## Windows installer signing

Windows installers are currently **unsigned**. Do not treat an unsigned artifact as verified solely because it was downloaded from a release page; compare it with the published SHA-256 checksums on the GitHub Release and confirm the source commit. If signing is introduced later, it will be documented explicitly and unsigned artifacts will not be described as signed.

No secret is required to build or run the application. AI is optional and every request is initiated by the user.
