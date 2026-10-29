# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Planned for 0.1.1

These review suggestions were left out of 0.1.0 on purpose:

- **"Thinking" board while the model runs (design S4)**: a new idle state that needs its own design pass and copy; out of scope for a fix round.
- **Wrap the stylesheet in `@scope (.pd-root, .pd-portal)` (design S12)**: nothing leaks out today (a unit test rejects any selector without the `pd-` prefix), and host styles leaking in are now handled by the isolation layer. `@scope` would change cascade proximity for all ~260 rules, so it needs its own visual pass on every screen rather than a late fix.
- **Pin GitHub Actions to commit SHAs**: CI uses major-version tags (`actions/checkout@v4` and so on). Pinning needs a Renovate/Dependabot rule to keep the SHAs current; otherwise they go stale.

## [0.1.0] - 2026-10-29

First release of 拼豆小憩 · Bead Break.

### Added

- Right-sidebar tab (`pindou`) with a bead button in the session header and a quiet "busy" dot while the model runs.
- A small pill above the composer after the model has been running for 3 s (at most twice per session; hidden while typing, when the panel is open or the window is narrow; can be turned off).
- Boards of 12 / 16 / 24 with 16 colors; paint, picker, eraser, fill, undo/redo, and clear with a 5-second undo.
- 12 templates with guide beads, a completion meter, a celebration and ironing.
- AI patterns from one sentence: one model call through DSH's default model, then `DEEPSEEK_API_KEY`, with validation, repair, a local cache and token display.
- PNG export with a fallback preview where downloads don't work, and Copy image where the clipboard supports PNG.
- Autosave in localStorage; keyboard play and a labelled grid for screen readers; touch targets of at least 32 px.
- Chinese and English UI; follows the host's light/dark theme; full-width pane below 768 px.
- Shortcut `pindou.toggle` (⌘⌥K / Ctrl+Alt+K in the desktop app; no Web default because DSH uses it for session search).
- CI (lint, typecheck, tests, build, `lib/` freshness, bundle shape) and an E2E run against DSH Web from source.

### Fixed before release (review round 1)

- AI page: "not configured" now shows on entry with the input, sizes and examples disabled; steps name the real Settings shortcut, an "Open DSH Settings" button appears where the shortcut can open Settings, and "Check again" re-probes. After the first 401 the page stays "not configured" until rechecked. Unverifiable routes show "the first generation will check the setup".
- Completion waits 260 ms before the result card; confetti plays after ironing; the coach card sits inside the board area; focus never falls back to the page body after closing the coach, clearing, undoing, un-ironing or pressing Esc in the menu.
- Board size fits short windows (palette and Iron stay visible) and reaches 480 px in a 640 px panel; matching swatch pulses the target cells; erased beads fade out.
- Contrast of muted text and the warm button meets WCAG AA in light and dark; dark-theme bead and template shadows; hover styles only on hover-capable pointers; toast clears the footer.
- E2E writes to `e2e/.out` by default; `--update-assets` refreshes `docs/assets`. New checks cover a hostile model reply, HTTP 429, undo after clear, the not-configured page and the English UI.

### Fixed before release (review round 2)

- **Style isolation**: `.pd-root` and `.pd-portal` reset what DSH's global styles leak in (superellipse `corner-shape`, box model, control fonts, margins and `appearance`, CJK auto-spacing on numbers). Every icon has one size class (`.pd-i`, 16 px by default, at most 24 px). The E2E run scans the live page for host rules that reach plugin elements and fails on any that isn't on the documented allow-list.
- **Focus**: one mechanism (`src/client/focus.ts`) for every card, menu, preview and destructive action. Focus goes back to whatever opened the surface, or to the board when that is gone, and is never left on the page body.
- **Contrast**: links use a darker blue in light mode (the host link blue is 4.2:1 on white). Disabled AI example chips look disabled.
- **Bundle**: comments and whitespace in the stylesheet are stripped at build time; `check:bundle` also fails above 90% of the 40 KB gzip budget.
- **E2E**: every screenshot is audited for icon size, round beads, squeezed or wrapped labels and text contrast in light and dark. New keyboard-only and English not-configured flows; `E2E_SELFCHECK_DIR` copies screenshots and reports to a folder outside the repo.

### Known limitations

- No board zoom (spec §3.4) and no row-by-row AI drop (spec §4.7); both moved to v2. See `docs/dsh-ui-constraints.md` §5.
- Credentials are checked without a model call, so a configured but invalid key is only found on the first generation.

[Unreleased]: https://github.com/Teloi/dsh-pindou/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Teloi/dsh-pindou/releases/tag/v0.1.0
