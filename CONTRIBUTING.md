# 参与贡献

**中文** · [English](./CONTRIBUTING.en.md)

谢谢你愿意帮忙！

## 环境

- 开发用 Node.js 24、pnpm 11（版本固定在 `package.json` 的 `packageManager`；pnpm 11 本身需要 Node ≥ 22.13）。插件运行时支持 Node ≥ 20.3，CI 会在 Node 20 和 24 上跑单测、bundle 检查和 Host 导入。
- 跑 E2E 还需要：一份构建好的 DeepSeek Harness 源码（`DSH_SRC`，默认 `/home/box/src/deepseek-harness`）、Chrome/Chromium（`CHROME`，默认 `/usr/bin/google-chrome`）和 ffmpeg（生成 GIF）。

## 常用命令

```bash
pnpm install
pnpm run lint
pnpm run typecheck
pnpm test
pnpm run build          # 输出到 lib/
pnpm run check:bundle   # 检查 lib/ 的形状（ModuleLoader 包装、只依赖 react、异步块只经 require.async 加载）和 gzip 体积：首屏 lib/client.js ≤ 40 KB，异步块 lib/client.<名>.js 合计 ≤ 20 KB，都不超过 90%
pnpm run check          # 以上全部
pnpm run e2e            # 端到端：从源码启动 DSH Web + 假模型服务；截图和日志写进 $TMPDIR/pindou-e2e-out（可用 E2E_OUT 改；并行跑时每轮给自己的 TMPDIR）
pnpm run e2e -- --update-assets   # 同上，并刷新 README 用的 docs/assets（或 E2E_UPDATE_ASSETS=1）
E2E_SELFCHECK_DIR=/some/dir pnpm run e2e   # 另外把截图、checks.json 和 style-leaks.json 复制到这个目录
node e2e/compare-shots.mjs <runA> <runB>  # 比较两次 E2E 的插件截图（plugin/，等动画结束、不含宿主），不该改外观的改动要全部相同
```

## 约定

- **`lib/` 要提交。** 用户通过 `github:` 安装时不会构建，改了 `src/` 记得 `pnpm run build` 并把 `lib/` 一起提交。CI 会检查 `lib/` 是否和源码一致。
- **不加安装脚本**（`preinstall`/`install`/`postinstall`/`prepare`），否则用户安装时需要 `allowBuilds`。
- **分层**：`src/core` 不能依赖 DOM 或 DSH；`src/client` 只依赖 `react`；DSH 服务端相关的代码放在 `src/host`。
- **样式**：所有类名和 CSS 变量都用 `pd-` 前缀，选择器限定在 `.pd-root` 或 `.pd-portal` 之下，颜色优先用宿主变量。约束和已定的设计决定见 [docs/dsh-ui-constraints.md](docs/dsh-ui-constraints.md)。
- **文案**：新增文案在 `src/core/i18n.ts` 的 `COPY` 里按 `键: [中文, English]` 成对写。文案快照在 `tests/__snapshots__/i18n.test.ts.snap`，改了措辞要跑 `pnpm exec vitest run -u tests/i18n.test.ts`，并在提交里说明。产品名只从 `APP_NAME_ZH` / `APP_NAME_EN` 取。
- **E2E 审计**：每张截图都会在页面里跑一遍 `e2e/audit.mjs`：图标带 `.pd-i` 且在 8–24px 之间；圆形元素保持 `corner-shape: round`；文字不会被挤成一字一行，按钮文字不换行；文字对比度 ≥ 4.5:1（大字 3:1）。宿主规则作用到插件元素上会让 E2E 失败，除非写进 `e2e/run.mjs` 的 `ACCEPTED_LEAKS` 并注明原因。结果在输出目录的 `audit/` 里。
- **异步加载**：大而独立的功能用 `import()` 拆成 `lib/client.<名>.js`，由宿主按需加载。异步模块不能和入口共用本地模块（宿主加载不了公共块，构建会直接报错）；共用的值由入口作为参数传进去，或者只 `import type`。新生成的块要和 `lib/` 一起提交。
- **焦点**：新的弹层、卡片和菜单用 `src/client/focus.ts` 的 `useFocusReturn`，不要手动挪焦点。
- **密钥**：不要把任何 API Key 写进代码、测试或截图。测试和 E2E 用 mock 或 `e2e/fake-llm.mjs`。
- **提交**：一个提交做一件事，信息用英文祈使句，例如 `fix(ui): keep the narrow toolbar on one row`。

## 提 PR 前

1. `pnpm run check` 全绿。
2. 改了界面的话，先跑 `pnpm run e2e` 确认全绿；README 截图需要更新时再跑一次 `pnpm run e2e -- --update-assets`，把 docs/assets 里有变化的文件一起提交。
3. 在 [CHANGELOG.md](CHANGELOG.md) 的「未发布」下写一行。
