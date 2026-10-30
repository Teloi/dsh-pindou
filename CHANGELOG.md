# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Moved to the next version

- **Daily pattern (每日一拼, spec §18.3, F1)** was taken out of 0.2.0 before release. Its code is kept on the `f1` branch (8f0bc97) and the 60 daily patterns stay with the spec; 0.2.0 has no daily strip, no streak and no `daily:` source.

### Planned for 0.1.1

These review suggestions were left out of 0.1.0 on purpose:

- **"Thinking" board while the model runs (design S4)**: a new idle state that needs its own design pass and copy; out of scope for a fix round.
- **Wrap the stylesheet in `@scope (.pd-root, .pd-portal)` (design S12)**: nothing leaks out today (a unit test rejects any selector without the `pd-` prefix), and host styles leaking in are now handled by the isolation layer. `@scope` would change cascade proximity for all ~260 rules, so it needs its own visual pass on every screen rather than a late fix.
- **Coach card placement (design N11)**: the card covers the bottom two rows of the board. Spec §4.2 places it exactly there ("卡片覆盖豆板下部，不遮挡调色盘"), so moving it above the board or before the first template needs the spec changed first; left as specified.
- **Replaced games survive a reload** (known limitation of 0.1.0, see below): persist the games kept for undo after switching patterns (N1), so that undo still reaches them after a reload. This changes the storage format.
- **Pin GitHub Actions to commit SHAs**: CI uses major-version tags (`actions/checkout@v4` and so on). Pinning needs a Renovate/Dependabot rule to keep the SHAs current; otherwise they go stale.

## [0.2.1] - 2026-10-30

### Fixed

- **Installs on DSH 0.2.1 release candidates, including the desktop app.** `engines.dsh` was `>=0.2.1`, and DSH compares pre-releases too, so 0.2.1-rc.3 (bundled with the desktop app) and 0.2.1-rc.5 (npm `latest`) refused the plugin with `is incompatible with dsh`. It is now `>=0.2.1-rc.3`; the full E2E suite passes on rc.3 and rc.5, and the host features the plugin uses, `require.async` included, are already there in rc.3. Versions before rc.3 are still refused.
- **在 DSH 0.2.1 的候选版（包括桌面客户端）上能装了。** 原来 `engines.dsh` 是 `>=0.2.1`，DSH 比较时也算预发布版，所以桌面客户端自带的 0.2.1-rc.3 和 npm `latest` 的 0.2.1-rc.5 都会以 `is incompatible with dsh` 拒装。现在改为 `>=0.2.1-rc.3`：完整 E2E 在 rc.3 和 rc.5 上都通过，插件用到的宿主功能（包括 `require.async`）在 rc.3 里都已经有了。rc.3 之前的版本仍会被拒绝。

## [0.2.0] - 2026-10-30

### Added

- **Picture to pattern (spec §18.2).** A third entry card, a picture dropped anywhere on the panel, or one pasted on the home page (only while focus is in the panel; the chat box is never touched) opens the picture page: crop to a square (drag, arrow keys, + / -), pick 12 / 16 / 24, 16 / 8 / 4 colours, dithering and background removal, preview, then "Start beading" as a template game titled 我的图纸 / My pattern. PNG, JPG, GIF, WebP and BMP; SVG is refused; files over 20 MB or with a side over 8000 px are refused from the size declared in the file header, wherever it sits in the file (for a GIF, the furthest any of its frames reaches, not just its screen size), before anything is decoded, and a file that declares no size is not decoded at all. Elsewhere than the picture page a dropped or pasted file that is not a picture is ignored.
- **Privacy of pictures.** Pictures are processed on this device only: no network request, no tokens, the original is never kept or written anywhere; only the quantised pattern is stored.
- **My works (spec §18.4).** Every ironed piece goes onto a wall (up to 60, oldest dropped first, under 1 KB each); un-ironing takes it off. A row of thumbnails on the home page and a wall page (3 / 4 / 6 columns, newest first, a heading per month) with a detail card: Export PNG, Copy image, Bead it again, and Delete, which asks nothing and can be undone for 5 s (the Delete key takes the same path).
- **New storage key `dsh-pindou:works`** for the wall, next to the game's `dsh-pindou:v1`. Before 0.2 there is none: an empty wall. A broken value is read as an empty wall.

### Changed

- **Home page:** three entry cards (Free play, AI pattern, Picture), with My works under the templates when there is at least one piece.
- **Async modules (spec §18.6):** the picture page and the wall page are separate chunks (`lib/client.picture.js`, `lib/client.works.js`), loaded the first time they are opened, with a skeleton after 150 ms. The first-screen bundle stays within its budget (`pnpm run check:bundle`). On a DSH without `require.async` the card reads 需要新版 DSH / Requires a newer DSH and is disabled; if a chunk fails to load, 加载失败，点此重试 / Couldn't load · Retry, with no toast. In both states a dropped or pasted picture is swallowed, so it never becomes a chat attachment.
- **E2E:** every run keeps its output, DSH home and workspace under its own TMPDIR (`E2E_OUT`, `E2E_DSH_HOME`, `E2E_WS`) on free ports (`E2E_DSH_PORT`, `E2E_LLM_PORT`), starts from a fresh home, and refuses to share them with a live run.

### Fixed

- **Guide dots on the light board are visible for every colour (spec §18.5, O3; was planned for 0.1.1).** The per-colour ring that the dark theme already draws (N10) now has a light-board table too: each colour is darkened toward ink until it stands out, then faded back to just 3.2:1 against the board, and drawn as a 1px inner ring, which stays under the selected-colour halo so selected guides keep ≥ 3:1 as well (R3-1: before, only Black passed when selected). White and Cream were the ones reported, but measured on the light board Yellow, Lime, Pink, Tan, Sky, Orange, Gray and Teal also fell short of 3:1 even at full strength, so all 16 get a ring. Unit tests recompute both tables and check all 16 colours × light/dark × normal/selected; the E2E run seeds a pattern with every colour and measures the computed ring against the real board in light and dark, normal and selected.
- **The toast no longer covers the palette or Iron/Export (design R3-2).** It was anchored just above the footer, and the play view stacks board, tools, palette and footer down to the bottom edge, so on short windows (and, as the new check found, at 1280×800 too) it sat on swatches. It now drops from the top, under the header, over the read-only status row. E2E checks at 1280×800, 1280×699, 1280×620 and 420×620 (light and dark) assert that no swatch, button or bead cell intersects the toast.

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

### Known limitations

- **Replaced games are kept in memory only.** When you switch to another pattern, the game it replaces stays one undo step away (up to 5 games), but only until the page reloads or the app restarts: after a reload those replaced games are gone for good and cannot be brought back. The current game is always saved and restored. Planned for 0.1.1.

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

### Fixed before release (design walkthrough round 2)

- **Picking a pattern never loses work (N1)**: the same template (or the same AI pattern, keyed by its size and content) resumes the board while it is not ironed, as spec §4.3 says; an ironed board starts a new game. A pattern click can never match a free or generated board. Replaced games stay one undo away (up to five), and replacing unfinished work shows a "Started a new board · Undo" toast.
- **Settings shortcut text (N2)**: host keycaps are read as the array the catalog gives (macOS `⌥⌘,`, elsewhere `Ctrl+Alt+,`) instead of being joined with commas.
- **Done / result card (N8)**: it now takes the place of the toolbar, palette and footer in the page flow instead of floating over them; buttons are at least 32 px and wrap at narrow widths.
- **Entry dot after closing the tab (N9)**: a generation that finishes while the tab is closed, hidden or the sidebar collapsed lights the entry dot; opening the panel clears it.
- **Dark-mode guide dots (N10)**: every ghost dot gets a per-colour ring at ≥ 3:1 against the dark board, checked for all 16 colours in tests and on the live page.
- Smaller items: undo in a toast returns focus to the board and a failed generation focuses Retry (N4); the busy pill budget survives a page reload (N5); continue, coach, toast and pill-close controls have 32 px hit areas (N6); the toast no longer wraps its button at 300 px and pauses while hovered or focused (N14); swatch badges shrink at ≤ 340 px (N12); ironed light beads keep a soft inner shade in the panel and the PNG (N13).

### Known limitations

- No board zoom (spec §3.4) and no row-by-row AI drop (spec §4.7); both moved to v2. See `docs/dsh-ui-constraints.md` §5.
- Credentials are checked without a model call, so a configured but invalid key is only found on the first generation.

[Unreleased]: https://github.com/Teloi/dsh-pindou/compare/v0.2.1...HEAD
[0.2.1]: https://github.com/Teloi/dsh-pindou/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/Teloi/dsh-pindou/compare/v0.1.0...feat/v0.2
[0.1.0]: https://github.com/Teloi/dsh-pindou/releases/tag/v0.1.0
