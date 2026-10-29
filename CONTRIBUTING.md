# 参与贡献

**中文** · [English](./CONTRIBUTING.en.md)

谢谢你愿意帮忙！

## 环境

- Node.js 24、pnpm 11（版本固定在 `package.json` 的 `packageManager`）。
- 跑 E2E 还需要：一份构建好的 DeepSeek Harness 源码（`DSH_SRC`，默认 `/home/box/src/deepseek-harness`）、Chrome/Chromium（`CHROME`，默认 `/usr/bin/google-chrome`）和 ffmpeg（生成 GIF）。

## 常用命令

```bash
pnpm install
pnpm run lint
pnpm run typecheck
pnpm test
pnpm run build          # 输出到 lib/
pnpm run check:bundle   # 检查 lib/client.js 的形状（ModuleLoader 包装、只依赖 react）
pnpm run check          # 以上全部
pnpm run e2e            # 端到端：从源码启动 DSH Web + 假模型服务，截图写进 docs/assets
```

## 约定

- **`lib/` 要提交。** 用户通过 `github:` 安装时不会构建，改了 `src/` 记得 `pnpm run build` 并把 `lib/` 一起提交。CI 会检查 `lib/` 是否和源码一致。
- **不加安装脚本**（`preinstall`/`install`/`postinstall`/`prepare`），否则用户安装时需要 `allowBuilds`。
- **分层**：`src/core` 不能依赖 DOM 或 DSH；`src/client` 只依赖 `react`；DSH 服务端相关的代码放在 `src/host`。
- **样式**：所有类名和 CSS 变量都用 `pd-` 前缀，选择器限定在 `.pd-root` 或 `.pd-portal` 之下，颜色优先用宿主变量。约束和已定的设计决定见 [docs/dsh-ui-constraints.md](docs/dsh-ui-constraints.md)。
- **文案**：新增文案在 `src/core/i18n.ts` 里中英文都要写。产品名只从 `APP_NAME_ZH` / `APP_NAME_EN` 取。
- **密钥**：不要把任何 API Key 写进代码、测试或截图。测试和 E2E 用 mock 或 `e2e/fake-llm.mjs`。
- **提交**：一个提交做一件事，信息用英文祈使句，例如 `fix(ui): keep the narrow toolbar on one row`。

## 提 PR 前

1. `pnpm run check` 全绿。
2. 改了界面的话，跑一次 `pnpm run e2e`，把有变化的截图一起提交。
3. 在 [CHANGELOG.md](CHANGELOG.md) 的「未发布」下写一行。
