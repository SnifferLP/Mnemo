# Screenshots

Product screenshots live in this directory and are linked from the [README preview gallery](../../README.md#preview). They are project documentation, not generated build artifacts, so they are committed once sanitized.

Captures taken locally for review belong in `/.screenshots/` at the repository root, which is git-ignored. Never commit from there directly; copy the sanitized, final images here.

## Requirements

- Use a fresh **development** profile, not your personal production database.
- Create neutral sample sets and cards; do not use real personal study content.
- Do not show names, email addresses, API keys, provider keys, local paths, file names or notifications.
- Capture in both light and dark mode where useful, at native interface scale.
- Use PNG and optimize file size.
- Do not include debug overlays, browser devtools or terminal windows.

## Files

The README gallery links exactly these images:

| File | Theme | View |
| --- | --- | --- |
| `lightmode-dashboard.png` | Light | Dashboard with sample activity, daily goal and streak |
| `lightmode-set-overview.png` | Light | Study set library with search and filters |
| `darkmode-ai-overview.png` | Dark | AI study assistant with per-set context controls |
| `darkmode-settings-overview.png` | Dark | Appearance settings with font, language, theme and accent |

Adding, renaming or removing a file means updating the gallery in `README.md` in the same commit, so the repository never renders a broken image. When a screen is missing, add a sanitized capture rather than dropping its slot from the README.
