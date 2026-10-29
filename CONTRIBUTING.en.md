# Contributing

[中文](./CONTRIBUTING.md) · **English**

Thanks for helping out!

## Setup

- Node.js 24 and pnpm 11 (pinned in `packageManager` in `package.json`).
- For E2E you also need a built DeepSeek Harness checkout (`DSH_SRC`, default `/home/box/src/deepseek-harness`), Chrome/Chromium (`CHROME`, default `/usr/bin/google-chrome`) and ffmpeg (for the GIF).

## Commands

```bash
pnpm install
pnpm run lint
pnpm run typecheck
pnpm test
pnpm run build          # writes lib/
pnpm run check:bundle   # checks the shape of lib/client.js (ModuleLoader wrapper, react-only requires)
pnpm run check          # all of the above
pnpm run e2e            # end-to-end: DSH Web from source + a fake model server; screenshots go to docs/assets
```

## Conventions

- **`lib/` is committed.** `github:` installs don't build, so run `pnpm run build` after changing `src/` and commit `lib/` with it. CI fails when `lib/` is stale.
- **No install scripts** (`preinstall`/`install`/`postinstall`/`prepare`); they would force users to set `allowBuilds`.
- **Layers**: `src/core` has no DOM or DSH dependencies; `src/client` depends only on `react`; DSH server code lives in `src/host`.
- **Styles**: every class name and CSS custom property uses the `pd-` prefix, selectors are scoped under `.pd-root` or `.pd-portal`, and colors come from host variables where possible. Constraints and locked decisions are in [docs/dsh-ui-constraints.md](docs/dsh-ui-constraints.md).
- **Copy**: add every new string in both Chinese and English in `src/core/i18n.ts`. The product name only comes from `APP_NAME_ZH` / `APP_NAME_EN`.
- **Secrets**: never put an API key in code, tests or screenshots. Tests and E2E use the mock or `e2e/fake-llm.mjs`.
- **Commits**: one change per commit, imperative English subject, e.g. `fix(ui): keep the narrow toolbar on one row`.

## Before opening a PR

1. `pnpm run check` passes.
2. If you changed the UI, run `pnpm run e2e` and commit the screenshots that changed.
3. Add a line under "Unreleased" in [CHANGELOG.md](CHANGELOG.md).
