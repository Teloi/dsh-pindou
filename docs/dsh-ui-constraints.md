# DSH 宿主 UI 约束（给设计）

> 来源：deepseek-harness 源码（`main`，2026-10 检出），仅陈述已在源码中确认的事实。路径均相对于 harness 仓库根目录。
> 结论先行：**拼豆小憩以「右侧边栏标签页」的形式运行**，入口是会话标题栏右侧的一个小图标按钮；内容直接渲染在宿主 React 树里（没有 iframe），宽度随用户拖拽变化，最窄 300px，手机上全屏。

## 1. 可用的扩展点（插件能放 UI 的地方）

| 位置 | slot / 服务 | 适合放什么 | 备注 |
|---|---|---|---|
| **右侧边栏标签页**（主面板） | `ctx.sidebarRightTabs.register({ kind, title, guide… })` + `sidebar.right.pane.tab`（按 key 渲染正文） | 游戏本体 | 与「文件预览」等内置标签同一套机制；可停靠、可拖成浮窗、可切换；`keepMounted` 可让隐藏后状态不丢 |
| 右栏「引导页」入口卡片 | 上面 `guide: [{ title, description, icon }]` | 「拼豆小憩」入口胶囊 | 引导页条目多时只显示标题，描述会被省略 |
| 会话标题栏动作 | `conversation.session.header.actions`（list，session 作用域） | **收起态小入口**（图标按钮 + 忙碌小圆点） | 标题栏空间有限，溢出会被裁剪并淡出；浮层必须 portal 出去 |
| 输入框活动位 | `conversation.input.activity` | 一个小动作，位于模型选择器和发送键之间 | 很挤，本插件未使用 |
| 左侧边栏底部动作 | `sidebar.footer.action` | 图标按钮 | 左栏收起成 56px 竖条时仍显示；本插件未使用 |
| 浮窗（自绘） | `document.body` 上自建 React root | 不推荐 | 不跟随宿主布局，需自己处理层级/拖拽 |

右栏标签页由 `ctx.sidebarRight.openTab('pindou')` 打开，会自动展开右栏；**必须有一个会话界面挂载**才能打开（在设置页等非会话页面会失败），所以入口放在会话标题栏。

## 2. 真实尺寸（px）

常量出自 `packages/client/ui-layout/src/client/columns.ts` 与 `packages/client/ui-sidebar-right/src/client/shell/SidebarRight.tsx`。

| 项 | 数值 |
|---|---|
| 中间对话区最小宽度 | 400 |
| 左侧栏宽度 | 默认 280，可拖 264–420；收起为 56 的图标竖条 |
| 左侧栏自动收起 | 视口宽 < 1024 |
| **右侧栏宽度** | **最小 300**；默认 = 框架宽 × 0.45；最大 = 框架宽 × 0.7；用户可拖拽 |
| 右侧栏能否并排显示 | 需满足 视口宽 − 左栏宽 − 400 ≥ 300；不满足且未全屏时，宿主会**自动收起右栏**（768–约 1000px 之间常见），用户可改用全屏模式 |
| **窄屏 / 手机** | 视口宽 < 768 时右栏自动**全屏**（宽 100vw） |
| 高度 | 右栏占满视口高度，减去右栏自身的标签条（约 36–40px）；标签正文区域高度 = 可用高度，需自行滚动 |

设计建议（本插件已按此实现）：
- 以 **300px 宽** 为最小设计稿，同时保证在 300–900px 之间自适应；豆板按容器宽度等比缩放（正方形，最大约 480px）。
- 高度不可假定：在 1366×768 的笔记本上正文区约 640–680px，需要内容可滚动；工具栏/色板放在豆板下方。
- 手机全屏时注意 `safe-area-inset`，触控目标 ≥ 32px（色块 28px + 间距即可满足 WCAG 2.2 目标尺寸最低要求 24px）。
- 宿主会在右栏面板元素上写 CSS 变量 `--dsh-sidebar-width`（当前右栏宽度，全屏时为 `100vw`）；更推荐对插件根节点用 `container-type: inline-size` 做容器查询。

## 3. 宿主主题变量

- 暗色判定：`body[data-ds-dark-theme]`（属性存在即暗色），切换时宿主同时改写下列变量，**插件只要引用变量就会自动跟随**，无需监听。
- 颜色别名（`--dsw-alias-*`，节选）：
  - 背景：`bg-base`、`bg-layer-1/2/3`、`bg-module-platform`
  - 文字：`label-primary`、`label-secondary`、`label-tertiary`、`label-caption`、`label-primary-inverted`
  - 描边：`border-l1` … `border-l4`
  - 交互：`interactive-bg-hover`、`interactive-bg-active`
  - 品牌/按钮：`brand-primary`、`button-primary-fill`、`button-primary-hover`
  - 状态：`state-success-primary`、`state-error-primary`、`state-warn-primary`、`state-business-primary/tertiary`
  - 其他：`link`、`toast-bg`、`toast-label`
- 阴影：`--dsw-elevation-soft`、`--dsw-elevation-panel`、`--dsw-elevation-prominent`
- 字体：`--dsw-font-family`、字号组 `--dsw-font-base-16-*` 等；圆角 `--dsw-radius-xs/sm/md/lg/xl`（4/8/12/16/20）
- 动效：`--ds-ease-in-out`（`cubic-bezier(.4,0,.2,1)`）
- 宿主约定（`docs/web-styling.md`）：hover 样式放在 `@media (hover: hover)` 内；分割线用 0.5px 发丝线；宿主原生组件不写字面颜色。**豆子颜色属于“实物色”，允许写死**，不随主题反相（与设计稿 tokens.css 一致）。
- 所有变量引用都应带兜底值（`var(--dsw-alias-label-primary, #0F1115)`），保证脱离宿主（单测、导出）时也能显示。

## 4. 限制

- **没有 iframe，也没有 Shadow DOM**：插件组件直接渲染在宿主 React 树中，与宿主共享同一个 `document`、同一个 React 实例。
- **CSS 不隔离**：插件样式通过 `<style>` 注入到全局。所有选择器必须加前缀并限定在插件根节点下（本插件统一使用 `.bb-root` / `bb-` 前缀），禁止写 `button {}`、`:root {}` 之类的全局规则，也不要用 `!important` 覆盖宿主。
- 宿主的字体、`box-sizing`、表单控件重置会“漏”进插件；反之插件不应改变宿主元素。
- 组件拿不到 `ctx`，只能通过 slot 注入的回调与标准 props 交互（如 `useSession(s => s.running)` 判断模型是否在忙）。
- 只能直接 `import` 宿主共享的平台模块（react、react-dom、zod、`@deepseek-ai/dsh-client-ui-primitives` 等）；其他宿主包只能类型引用。
- 弹层/菜单若放在标题栏动作里，会被标题栏的 overflow 裁剪，必须 portal 到 `document.body`。
- 右栏标签页在**没有会话界面**时无法打开；右栏宽度会被用户随时拖动，正文必须流式布局。
- 静态资源（图片）可放在插件包 `src/client/assets/`，由宿主以 `/plugins/<包名>/assets/` 提供；本插件全部用 CSS/Canvas 绘制，无图片资源。
