# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

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

[Unreleased]: https://github.com/Teloi/dsh-pindou/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Teloi/dsh-pindou/releases/tag/v0.1.0
