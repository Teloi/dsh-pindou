# Contributing

[中文](./CONTRIBUTING.md) · **English**

Thanks for helping out!

## Setup

- Node.js 24 and pnpm 11 for development (pinned in `packageManager` in `package.json`; pnpm 11 itself needs Node ≥ 22.13). The plugin runs on Node ≥ 20.3; CI runs the unit tests, the bundle check and the Host import on Node 20 and 24.
- For E2E you also need a built DeepSeek Harness checkout (`DSH_SRC`, default `/home/box/src/deepseek-harness`), Chrome/Chromium (`CHROME`, default `/usr/bin/google-chrome`) and ffmpeg (for the GIF).

## Commands

```bash
pnpm install
pnpm run lint
pnpm run typecheck
pnpm test
pnpm run build          # writes lib/
pnpm run check:bundle   # checks the shape of lib/ (ModuleLoader wrapper, react-only requires, lazy chunks loaded only via require.async) and gzip sizes: first-screen lib/client.js ≤ 40 KB, lazy lib/client.<name>.js chunks ≤ 20 KB together, each at most 90% of its budget
pnpm run check          # all of the above
pnpm run e2e            # end-to-end: DSH Web from source + a fake model server; screenshots and logs go to e2e/.out (ignored)
pnpm run e2e -- --update-assets   # same, and refresh the README images in docs/assets (or E2E_UPDATE_ASSETS=1)
E2E_SELFCHECK_DIR=/some/dir pnpm run e2e   # also copy screenshots, checks.json and style-leaks.json there
node e2e/compare-shots.mjs <runA> <runB>  # compare the plugin crops (plugin/: settled, host left out) of two E2E runs; a change that must not alter the look keeps them all identical
```

## Conventions

- **`lib/` is committed.** `github:` installs don't build, so run `pnpm run build` after changing `src/` and commit `lib/` with it. CI fails when `lib/` is stale.
- **No install scripts** (`preinstall`/`install`/`postinstall`/`prepare`); they would force users to set `allowBuilds`.
- **Layers**: `src/core` has no DOM or DSH dependencies; `src/client` depends only on `react`; DSH server code lives in `src/host`.
- **Styles**: every class name and CSS custom property uses the `pd-` prefix, selectors are scoped under `.pd-root` or `.pd-portal`, and colors come from host variables where possible. Constraints and locked decisions are in [docs/dsh-ui-constraints.md](docs/dsh-ui-constraints.md).
- **Copy**: add every new string to `COPY` in `src/core/i18n.ts` as a `key: [中文, English]` pair. The wording is pinned by `tests/__snapshots__/i18n.test.ts.snap`; for an intended change run `pnpm exec vitest run -u tests/i18n.test.ts` and say so in the commit. The product name only comes from `APP_NAME_ZH` / `APP_NAME_EN`.
- **E2E audits**: every screenshot also runs `e2e/audit.mjs` in the page: icons carry `.pd-i` and stay 8–24 px, round things keep `corner-shape: round`, no label wraps one character per line, and text contrast is ≥ 4.5:1 (3:1 for large text). Host rules that reach plugin elements fail the run unless listed, with a reason, in `ACCEPTED_LEAKS` in `e2e/run.mjs`. Results are in `e2e/.out/audit/`.
- **Lazy loading**: large, self-contained features go behind `import()` and ship as `lib/client.<name>.js`, which the host loads on demand. A lazy module must not share local modules with the entry (the host can't load a common chunk, so the build fails); pass shared values in as arguments or `import type` them. Commit new chunks with the rest of `lib/`.
- **Focus**: new popovers, cards or menus use `useFocusReturn` from `src/client/focus.ts`; don't move focus by hand.
- **Secrets**: never put an API key in code, tests or screenshots. Tests and E2E use the mock or `e2e/fake-llm.mjs`.
- **Commits**: one change per commit, imperative English subject, e.g. `fix(ui): keep the narrow toolbar on one row`.

## Before opening a PR

1. `pnpm run check` passes.
2. If you changed the UI, run `pnpm run e2e` and make sure it passes; when the README images need refreshing, run `pnpm run e2e -- --update-assets` and commit what changed in docs/assets.
3. Add a line under "Unreleased" in [CHANGELOG.md](CHANGELOG.md).
