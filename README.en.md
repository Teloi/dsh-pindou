# Bead Break · 拼豆小憩

[中文](./README.md) · **English**

Place a few beads while the model is thinking.

Bead Break is a plugin for the Web shell of [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness). It opens a pixel perler-bead board in the right sidebar: follow a template, draw freely, or describe a picture in one sentence and let the model draw the pattern. Iron it when you're done and save it as a PNG.

<p align="center">
  <img src="docs/assets/demo.gif" alt="Following the heart template, then ironing it" width="420">
</p>

| While the model is busy | Templates | Ironed |
| --- | --- | --- |
| ![The small pill above the composer](docs/assets/pill-light.png) | ![Template home with 12 templates](docs/assets/home-light.png) | ![The ironed heart](docs/assets/ironed-light.png) |
| **AI pattern** | **Dark** | **Phone width (390px)** |
| ![A cat pattern generated from one sentence](docs/assets/ai-light.png) | ![Dark theme home](docs/assets/home-dark.png) | ![The board at phone width](docs/assets/play-narrow.png) |

The screenshots show the Chinese UI; the plugin follows DSH's language and also ships English.

## Install

Requires DSH **0.2.1-rc.3 or later** (`engines.dsh` in `package.json` is `>=0.2.1-rc.3`). The 0.2.1-rc.3 bundled with the desktop app, 0.2.1-rc.5 on npm, and anything newer all qualify. On an older DSH the install is refused with `is incompatible with dsh …` and nothing is installed.

The plugin has a Web UI only, so it installs into DSH's Web shell and the desktop app. Profiles without the Web UI, such as TUI and ACP, are not supported.

No `allowBuilds` is needed: the built `lib/` is committed and the package has no install scripts.

### Web

```bash
npx @deepseek-ai/dsh plugin --profile web add github:Teloi/dsh-pindou
```

Then restart `dsh --profile web`. To check it worked:

- `npx @deepseek-ai/dsh plugin --profile web list` lists `dsh-pindou`.
- In the Web page, the bead button appears on the right of the session header.

Without the command line: open **Plugins** in the Web sidebar, choose **Add plugin** → **Install a third-party plugin**, and enter `github:Teloi/dsh-pindou` (UI names as of DSH 0.2.2, here and below).

### Desktop app

The desktop app (macOS, Windows) has its own profile (`$DSH_HOME/profiles/desktop`; by default `~/.dsh/profiles/desktop` on macOS and `%USERPROFILE%\.dsh\profiles\desktop` on Windows), separate from the Web one, so install the plugin there too. The npm-installed `dsh` cannot change it: `npx @deepseek-ai/dsh plugin --profile desktop …` stops with `profile "desktop" is managed exclusively by the Electron application`. Use one of these instead:

- **In the app**: open **Plugins** in the sidebar, choose **Add plugin** → **Install a third-party plugin**, and enter `github:Teloi/dsh-pindou`. Restart the app if the page asks you to.
- **With the app's own `dsh` command**: install the command from **Manage dsh Command…** in the application menu. Open the app at least once, quit it fully, then run:

  ```bash
  dsh plugin --profile desktop add github:Teloi/dsh-pindou
  ```

  The change applies when you reopen the app. If the `dsh` in your terminal is the npm one, this command fails with the same error; run the app's command by the full path shown in **Manage dsh Command…** instead.

To check it worked: the plugin shows under **Installed plugins** on the **Plugins** page, and the bead button appears on the right of the session header. Optional configuration goes in `cordis.patch.yml` in the desktop profile directory, with the same keys as on the Web (see "Optional configuration" below).

### Install by package name

Once the plugin is published to npm, you can use the package name `dsh-pindou` in place of `github:Teloi/dsh-pindou` anywhere above:

- **Command line**: on the Web, run `npx @deepseek-ai/dsh plugin --profile web add dsh-pindou`. For the desktop app, quit it and run `dsh plugin --profile desktop add dsh-pindou` (with the app's own `dsh`, as above).
- **In the UI**: on the **Plugins** page, choose **Add plugin** → **Install a third-party plugin** and enter `dsh-pindou` under **Package name or address**.

This needs the package to be on npm already. Mirrors, such as the **Mainland China mirror** under **Registry** in the dialog, can lag behind npm. Right after a release, if the install fails or does not pick up the newest version, switch to the **Official npm registry** or try again later.

## Uninstall

Web:

```bash
npx @deepseek-ai/dsh plugin --profile web remove dsh-pindou
```

Desktop app: uninstall it on the **Plugins** page, or quit the app fully and run the app's own `dsh` command:

```bash
dsh plugin --profile desktop remove dsh-pindou
```

## How to play

- **Entry points**: the bead button on the right of the session header, or the small pill that appears above the composer after the model has been running for 3 seconds. The pill shows at most twice per session and stays away while you type, while the panel is open, or when the window is too narrow. You can turn it off in the ⋯ menu.
- **Templates**: 12 templates with faint guide beads and a completion meter; when you finish, it offers to iron the piece, and ironing ends with a small confetti burst.
- **Tools**: paint, picker, eraser, fill, undo/redo, clear (undoable for 5 seconds). Boards come in 12 / 16 / 24 with 16 colors.
- **Export**: save as PNG, or copy the image to the clipboard (the Copy button is hidden where the browser can't do it).
- **Picture to pattern** (v0.2): the "Picture" card on the home page, or drop a picture onto the panel, or paste one with ⌘V / Ctrl+V on the home page (only while focus is in the panel, never in the chat box; a file that is not a picture is ignored on the home page). Crop to a square, pick the size (12 / 16 / 24), the number of colors (16 / 8 / 4), dithering and background removal, then "Start beading". PNG, JPG, GIF, WebP and BMP are supported, SVG is not; files up to 20 MB and 8000 px a side (judged from the size declared in the file header, for a GIF the largest of its screen and every frame, so a larger one is refused before it is decoded).
- **My works** (v0.2): every ironed piece goes onto the wall, up to 60 (the oldest goes first); un-ironing takes it off again. The home page shows one row of thumbnails, "All ›" opens the wall. Each piece can be exported as PNG, copied, or beaded again; Delete (button or key) removes it without asking and can be undone for 5 seconds.
- **Autosave**: progress is kept in the browser's localStorage (key `dsh-pindou:v1`). The wall has its own key, `dsh-pindou:works`, under 1 KB per piece.
- **Privacy**: pictures are processed on this device only and never uploaded: no network request, no tokens. The original picture is not kept or written anywhere; only the quantised pattern is stored.
- **Loaded on demand** (v0.2): Picture to pattern and the wall page are async modules, loaded the first time you open them, so the first-screen bundle does not grow. On a DSH too old to load them the card reads "Requires a newer DSH" and is disabled; if loading fails it reads "Couldn't load · Retry". In both cases a picture dropped on the panel is swallowed and never becomes a chat attachment.
- **Shortcut**: in the desktop app ⌘⌥K / Ctrl+Alt+K toggles the panel and can be rebound in Settings → Shortcuts. The Web shell has no default because DSH already uses that combination for "Search sessions"; bind one in Settings if you want it.
- **Keyboard and screen readers**: arrow keys move, Space/Enter places, Delete erases. The board is a labelled grid and each cell announces its position, color and guide color.
- **Language and theme**: follows DSH's language (Chinese first, English included) and light/dark theme.
- **Not yet** (planned for v2): zooming the board (cells already size themselves to the panel), and AI patterns appearing row by row (the whole pattern lands at once).

## AI patterns

One sentence (e.g. "an orange cat") → one model call → the pattern is validated and repaired → it lands on the board along with the tokens it used. Identical requests hit a local cache (up to 24 entries) and cost nothing.

Model selection, in order:

1. **DSH's current default model** (the one you chat with; no extra setup).
2. If DSH has no usable model route and `DEEPSEEK_API_KEY` is set, the DeepSeek API is called directly (`deepseek-chat`).
3. Otherwise the AI page says no model is available; templates and free drawing keep working.

The check only looks at whether credentials are configured and never calls the model for it; where that can't be known up front (account sign-in, for example) the page says the first generation will check the setup. If a key turns out to be invalid, the page keeps showing "not configured" after the first failed generation until you press "Check again". DSH gives plugins no way to open its Models settings, so "Open DSH Settings" only appears where the Settings shortcut can open Settings (on its home page); otherwise you get written steps.

The key is only read in the DSH server process and never reaches the browser.

<details>
<summary>Optional configuration</summary>

Override the config in the Web profile's `$DSH_HOME/profiles/web/cordis.patch.yml` using the same id, `pindou`:

```yaml
- id: pindou
  config:
    provider: deepseek-official
    model: deepseek-v4-flash
    maxTokens: 1024
```

All keys are optional. Unknown keys or invalid values make the plugin fail to load with a clear message.

| Key | Default | Meaning |
| --- | --- | --- |
| `provider` + `model` | — | Pin one DSH model route; give both together |
| `apiKeyEnv` | `DEEPSEEK_API_KEY` | Environment variable read by the direct fallback |
| `baseUrl` | `https://api.deepseek.com` | Direct fallback endpoint (https only; http://localhost for testing) |
| `fallbackModel` | `deepseek-chat` | Model used by the direct fallback |
| `maxTokens` | `1024` | Output cap per generation |
| `timeoutMs` | `30000` | Timeout per generation |
| `minIntervalMs` | `1500` | Minimum gap between two generations |

</details>

## Development

```bash
pnpm install
pnpm run check      # lint + typecheck + tests + build + bundle-shape check
pnpm run e2e        # start DSH Web from source and drive it with Playwright; screenshots go to $TMPDIR/pindou-e2e-out (add -- --update-assets to refresh docs/assets)
```

Three layers: `src/core` (pure logic: board, templates, pattern validation and repair, cache; no DOM), `src/client` (React UI and DSH client glue), `src/host` (DSH server side: the model call). DSH UI constraints and design decisions are in [docs/dsh-ui-constraints.md](docs/dsh-ui-constraints.md) (Chinese).

See [CONTRIBUTING.en.md](CONTRIBUTING.en.md) to contribute and [CHANGELOG.md](CHANGELOG.md) for changes.

## License

[MIT](LICENSE) © 2026 Teloi
