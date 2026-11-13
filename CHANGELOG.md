# Changelog

All notable changes to Mnemo are documented here. The project follows [Semantic Versioning](https://semver.org/).

## [1.2.6-rc.2] - 2026-11-13

Second release candidate for `1.2.6`. Study sets, progress, review history and settings are kept.

### Fixed

- **Resetting a set keeps its learning history.** The reset from `1.2.6-rc.1` stopped wiping global statistics, but it also hid the set's own recorded reviews, so its “Last 30 Days” chart went blank. Reviews and sessions are history and are now never hidden by a reset: the chart, review count, accuracy and study time of the set stay readable, while current progress, mastered cards, per-card counters and test results are reset as before. Nothing is reconstructed or approximated — the recorded events stay in place.
- **The dashboard's “Continue where you left off” section lists every set, ordered by when it was opened.** The section used to show only sets with cards due, ordered by how many cards were due, so a set dropped out of it as soon as nothing was due and came back later; with two sets that looked like a set randomly disappearing. It now lists all active sets, most recently opened first.
- **Opening a set is remembered.** Sets record when they were opened, persisted in the database instead of component state, so the order is the same after navigating away and after restarting the app. Creating, deleting, archiving and restoring a set is reflected immediately.
- **“Tutor” is now “KI” / “KI-Assistenz” throughout the interface, in German and English.** The dashboard button reads “KI fragen”, the assistant page and its settings refer to the “KI-Assistenz”, and the AI feedback badge on the study page says “KI-Assistenz:”. Only user-facing wording changed; the assistant, its modes and the AI integration behave exactly as before.

### Internal

- A reset now only marks test results as reset-scoped; the corresponding review and session flags were removed again by a migration that clears them and drops the columns, so existing databases keep their history. Sets gain a `last_opened_at` column, updated when a set is opened and used to order the dashboard lists with a deterministic tie-breaker.

## [1.2.6-rc.1] - 2026-11-12

First release candidate for `1.2.6`, fixing a data-loss bug in the per-set reset. Existing study sets, progress, review history and settings are kept.

### Fixed

- **Resetting one study set no longer wipes global learning statistics.** “Reset progress” deleted every review the set had recorded, and the dashboard's learned-cards-today number, the daily chart, the weekly accuracy and the streak are all calculated from those reviews. Resetting a single set therefore erased the day's global activity, including the activity of every other set. A reset now clears only the set's own progress, its mastered-card count, its “Last 30 Days” view and its test history; the learned-cards total, dashboard, streak, global statistics and all other sets stay exactly as they were.

### Internal

- A set reset marks its review, session and test rows as reset-scoped instead of deleting them, so the set's statistics start at zero while global aggregates keep counting the same history. A new migration adds the flag to existing databases; no data is rewritten.

## [1.2.5] - 2026-11-12

First stable release of the `1.2.5` line. It collects the four release candidates and adds two layout fixes found during the last one. Existing study sets, progress, review history and settings are kept.

### Highlights

- Motion follows **Settings → Animations** instead of the operating system, which fixes animations disappearing on Windows.
- The window opens maximized on Windows and Linux.
- **Settings → Updates → Check for updates automatically** (enabled by default) governs background update checks; manual checks always work.
- The flashcard preview on set pages is narrower and its heading is gone; the sidebar brand is the logo and “Mnemo” only.
- Page bottoms are no longer clipped: the shell uses one viewport-tall surface instead of `100vh` arithmetic per page.
- The card editor flags duplicates while typing, and now only when **both** the term and the definition match.
- German wording: “Fällig”, “Genauigkeit”, “Anstehende Lernsets:”, “Für heute erledigt!” and the new greeting sentence.

### Fixed

- **Long study set titles wrap instead of being cut off.** Titles in library cards, the dashboard and statistics lists, folder listings and the set header now use the full available width and continue on a second line when needed. Cards only grow when the title is actually that long, so short titles keep the compact layout.
- **Page headings are no longer truncated.** The shared page header allows a wider heading block and wraps long headings cleanly, which keeps long localized headings and wide typefaces fully readable. The heading size, weight and spacing are unchanged.

## [1.2.5-rc.4] - 2026-11-12

Fourth release candidate for `1.2.5`. Study sets, progress and review history are untouched.

### Fixed

- **Duplicate detection compares both sides of a card now.** Before, a card was flagged as soon as its term matched another card's term, so “Apple → A fruit” and “Apple → A company” were reported as duplicates. A card is only flagged when its term **and** its definition match an earlier card; a shared term or a shared definition alone is a legitimate pair. Casing and extra whitespace are still normalised first, the amber outline, warning and jump-to-original arrow are unchanged, and unfinished cards (one side still empty) are never flagged.

### Internal

- Duplicate detection now keys on the normalised term/definition pair, with tests covering the full matching matrix (term only, definition only, identical and near-identical cards).

## [1.2.5-rc.3] - 2026-11-12

Third release candidate for `1.2.5`: nothing is clipped at the bottom of the window any more, the card editor flags duplicate terms while you type, and the German interface uses the wording you asked for. Study sets, progress and review history are untouched.

### Fixed

- **Content no longer disappears below the bottom edge of the window.** The shell was pinned to `100vh`, which on WebKitGTK (Linux) can describe a taller area than the user actually sees, so the last rows of a page sat below the window edge where no scroll could reach them. The shell now uses a single `.app-viewport` height (`100vh`, upgraded to `100dvh` where the engine supports the visible viewport) for the app, the study views and the splash screen, and the page content wrapper fills that height instead of guessing it.
- **The assistant page no longer hides its composer.** It derived its height from `100vh − 4rem` while the shell pads `2rem` at small widths and `2.5rem` at desktop widths, so its input row landed 16px past the fold on any window wider than 1024px. It now fills the space the shell gives it.
- Scroll containers carry scroll padding, so a card that is jumped to or focused is never flush against the edge, and the dashboard's highlighted "ready to review" tile no longer hides its own overflow (which could clip its button at narrow widths).

### Added

- **Duplicate detection in the card editor.** Sides are compared after Unicode normalisation, lowercasing and whitespace collapsing, so ` Haus `, `haus` and `HAUS` count as the same term while `a/b` and `ab` stay different. A duplicate card gets an amber outline with "Duplicate detected!" / "Duplikat erkannt!" and an arrow that scrolls to, focuses and briefly highlights the original card. The warning is derived from the live draft, so it disappears the moment the term is corrected, several duplicates are all traced back to the first card, and saving is never blocked. The dashed row that creates the next card checks its term the same way.

### Changed

- The separate "Add another card" / "Weitere Karte hinzufügen" button is gone: the dashed row below the list already creates the next card as soon as both sides have text.
- German wording, applied everywhere the strings appear: "Bereit zur Wiederholung" → **"Fällig"**, "Trefferquote" → **"Genauigkeit"**, "Lernsets mit Karten, die auf Wiederholung warten" → **"Anstehende Lernsets:"**, "Heute zählt." → **"Für heute erledigt!"**, and the greeting now reads "{count} Karten warten auf dich. Bereit für eine kurze Runde?" ("1 Karte wartet auf dich…" for a single card).

### Internal

- `src/lib/duplicates.ts` holds the pure normalisation and lookup helpers with unit tests for casing, whitespace, punctuation, umlauts and repeated duplicates.
- German wording is covered by the translation tests, so the old terms cannot creep back in.

## [1.2.5-rc.2] - 2026-11-12

Cross-platform polish on top of `1.2.5-rc.1`. No study set, progress or review history is affected.

### Fixed

- Animations now work on Windows. WebView2 reports `prefers-reduced-motion: reduce` as soon as the Windows "Animation effects" accessibility setting is off — which is the default on many virtual and remote sessions — and a stylesheet rule honoured that media query, so every keyframe animation and transition was reduced to nothing on Windows while the Linux build animated normally. Motion now follows **Settings → Animations** only, that preference is applied before the first frame, and the Linux behaviour is unchanged.
- The window opens maximized on Windows and Linux. `app.windows[0].maximized` is set, so the window is created maximized instead of growing after launch. Minimizing, restoring, resizing and closing keep working, and 1440 × 920 remains the size used when restoring down.

### Added

- **Settings → Updates → Check for updates automatically.** Enabled by default for new and existing installations, it governs the start-up check and the automatic check that follows a channel switch. Manual checks stay available and unaffected. Settings stored by older versions do not contain the key and load as enabled.

### Changed

- The flashcard preview on the learning set page is narrower and centred, and its "See the cards before you start" heading is removed. Start learning moved next to the paging controls. Flipping, paging and starring are unchanged.
- The sidebar brand is now the logo and the name "Mnemo" only; the "A quiet archive" / "Ein stilles Archiv" subtitle is gone in both languages, and logo and wordmark are aligned as one lockup.
- The Updates section description no longer promises background checks unconditionally, because they are now a preference.

### Internal

- `mnemo.animations` joins the appearance cache, so `index.html` applies the motion preference before React mounts.
- Frontend tests cover the automatic-update default and merge behaviour, and a stylesheet guard keeps the OS reduced-motion override from returning.

## [1.2.5-rc.1] - 2026-11-12

A feature and correctness release for learning sessions. Existing study sets, progress and review history are unchanged; starring is additive and every older card starts unstarred.

### Added

- Starred terms. Individual cards can be starred and unstarred from a learning session, from the set's card list and from the new flashcard preview. Star state is per card, is stored in the database and survives leaving the set, restarting the application and exporting a backup.
- Flashcard options before a session: front side first (default) or back side first, combined with all terms or starred terms only. Both choices are carried through the whole session in the session URL and never modify the stored cards.
- A flashcard preview on the learning set page. It shows a real card from the set, flips on click or with the Flip button, pages through every card and starts a learning session directly. The rest of the page is unchanged.
- Starred term counts on the set page and a starred-only badge during a session.

### Changed

- Flashcards are significantly larger in the flashcards and spaced repetition modes: the card grows with the window height, padding and type scale are larger and the session uses more of the available width. Nothing else about those modes changed.
- The "Continue where you left off" section is now the first block of the dashboard, above the metrics, so an in-progress set is one click away. Its content and behaviour are unchanged.

### Fixed

- Learning activity dates no longer drift away from their bars on the dashboard, the statistics page and the set page. Bars were left-aligned inside their flexible column while the date label was centred, so every label sat to the right of its own bar. Bars and labels now share one column grid, labels are evenly spaced across the whole range including the newest day, and the gutters narrow for long ranges so a year of bars still fits.
- Activity ranges are built from local calendar days only. The review cutoff was previously a UTC timestamp while the rows were grouped by local day, which could cut the first day of a range short and made empty weeks shift the axis. Ranges now always contain one entry per day, including days without activity.

### Internal

- New migration `0004_card_stars.sql` adds `flashcards.is_starred` and an index; older databases upgrade in place.
- `select_queue` takes a starred-only flag, so every study mode filters the same way, and `activity_date_range` is covered by unit tests across 7, 14, 30, 90 and 365 day ranges.
- Frontend tests cover the activity axis helpers and the flashcard option helpers; the Rust suite covers starring persistence and starred queue filtering.

## [1.2.4] - 2026-11-11

Final polish for the redesigned interface. All existing navigation, learning modes and stored data are unchanged.

### Added

- A language dropdown in Settings → General. English and German are selectable, the choice applies immediately and is kept across restarts; strings without a translation fall back to English.
- Archive access from the Folders page. The folder rail now lists the archive next to folders and shows archived sets in place, with restore and permanent deletion available from the same card menu as before.
- The real Mnemo application icon in the sidebar, in both expanded and collapsed states.

### Changed

- Modern Sans is now the default display font and the first option in Settings → General → Display font. Editorial Serif remains available; previously saved font preferences are preserved.
- The sidebar is a full-height navigation rail with no rounded outer corners, instead of a floating card. Individual items keep their rounded shape.
- Collapsed navigation is rebuilt around fixed 36 px items centred on one axis, so every icon — including Create, Settings and the collapse control — shares the same position. Tooltips appear only while collapsed.
- Startup paints the window background before styles are parsed and replays the cached theme, accent, display font and language, then waits for the persisted settings before rendering the interface.

### Fixed

- Collapsed sidebar icons, the new-set button and the footer controls were offset instead of centred.
- Starting Mnemo briefly flashed a white page and could render default settings before the persisted ones were loaded.

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
