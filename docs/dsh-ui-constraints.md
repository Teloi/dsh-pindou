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
- 宿主页面的 `<meta name="viewport">` 没有 `viewport-fit=cover`（DSH 源码 `apps/web/index.html`：`width=device-width, initial-scale=1`），所以 iOS 上 `env(safe-area-inset-*)` 恒为 0，插件里的 safe-area 规则不生效。无害：页面本身不铺进刘海和底部横条区域，插件不需要也不应该自己改 viewport。宿主将来加上 `viewport-fit=cover` 时这些规则会自动起作用（设计走查 N7）。
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
- **CSS 不隔离**：插件样式通过 `<style>` 注入到全局。所有类名和自定义属性统一使用 `pd-` 前缀：面板内规则限定在 `.pd-root` 下，渲染到 `document.body` 或宿主插槽里的元素（忙碌胶囊、入口按钮、弹层、toast）一律带 `.pd-portal`。禁止写 `button {}`、`:root {}` 之类的无前缀全局规则，也不用 `!important` 覆盖宿主（唯一例外是减少动态效果的媒体查询）。
- 宿主的全局样式会“漏”进插件；反之插件不应改变宿主元素。下面是在真实 DSH Web 里逐条测出来的（E2E 的 `e2e/audit.mjs` 每次都会重新扫描，结果写在 `e2e/.out/audit/leaks.json`），以及插件的处理方式：

  | 宿主规则（来源） | 影响 | 处理 |
  |---|---|---|
  | `*, ::before, ::after { corner-shape: superellipse(1.5) }`（ui-theme `corner-shape.css`） | 圆豆、色块、圆点变成“方圆” | `.pd-root *`、`.pd-portal *` 及其伪元素统一 `corner-shape: round` |
  | `body` 的 `font-family`、`line-height`、`text-autospace: normal`（web `base.css`） | 字体沿用宿主（这是想要的）；中英文之间自动加空隙会把 `0/118`、色号、计数撑开 | 字体继承；数字和色号元素设 `text-autospace: no-autospace` |
  | `button, input, select, textarea { font-family: inherit }` 和浏览器默认的控件字号、外边距、`appearance` | 按钮字号、行高不一致 | `:where(.pd-root, .pd-portal) :where(button, input, textarea, select)` 统一 `font/color/letter-spacing: inherit; margin: 0; appearance: none` |
  | 盒模型 | 宿主没有全局 `box-sizing`，浏览器默认是 `content-box` | `.pd-root *`、`.pd-portal *` 统一 `border-box` |
  | `svg` 没有默认尺寸（浏览器按 300×150 撑开） | 设计走查 B1：警告图标撑坏卡片 | 所有图标走 `icons.tsx`，带 `width/height=16` 属性和 `.pd-i` 类；尺寸只由 `--pd-i` 决定，测试断言每处 ≤ 24px |
  | `:focus-visible` 的 outline 颜色和宽度（ui-theme `focus.css`）；`[data-dsh-automatic-focus]:focus { outline: none }` | 焦点环跟随宿主（想要的） | 保留，不覆盖 |
  | 桌面端 macOS 的 `-webkit-app-region`（窗口拖拽区） | 控件需要 `no-drag` 才能点 | 保留宿主的值 |
  | 宿主滚动条样式 | 与宿主一致（想要的） | 保留 |

  E2E 里只有上表“保留”的几项是允许的（`e2e/run.mjs` 的 `ACCEPTED_LEAKS`，每项写了原因）；扫到其他宿主规则作用到插件元素上就会失败。
- **焦点归还只有一个机制**（`src/client/focus.ts`）：弹层、菜单、卡片和预览用 `useFocusReturn` 打开时把焦点放进来，关闭时还给打开它的元素（菜单是 `⋯` 按钮）；那个元素不在了，就给豆板（或当前页面的第一个控件）。清空、撤销熨烫、undo toast 这类会让当前焦点元素消失或被禁用的操作，由根节点上的 `useFocusGuard` 兜底：焦点掉到 `body` 时还给豆板。用户自己点到面板外，不会被拉回来。
- 组件拿不到 `ctx`，只能通过 slot 注入的回调与标准 props 交互（如 `useSession(s => s.running)` 判断模型是否在忙）。
- 只能直接 `import` 宿主共享的平台模块（react、react-dom、zod、`@deepseek-ai/dsh-client-ui-primitives` 等）；其他宿主包只能类型引用。
- 弹层/菜单若放在标题栏动作里，会被标题栏的 overflow 裁剪，必须 portal 到 `document.body`。
- 右栏标签页在**没有会话界面**时无法打开；右栏宽度会被用户随时拖动，正文必须流式布局。
- 静态资源（图片）可放在插件包 `src/client/assets/`，由宿主以 `/plugins/<包名>/assets/` 提供；本插件全部用 CSS/Canvas 绘制，无图片资源。

## 5. 决定（Decisions，已锁定，对应 spec v1.5 §15.1）

1. **入口**：放在 `conversation.session.header.actions`（会话头部右侧），32px 幽灵按钮，id `dsh-pindou-entry`。不弹气泡，只用一个 6px 圆点表示状态：模型运行中是强调色呼吸点；面板关着时，如果有未完成的作品，或生成期间关掉面板后 AI 结果已到，就是暖色静止点。`aria-expanded` 跟随面板是否可见。
2. **面板**：右侧栏标签页，kind `pindou`，`keepMounted`。宽度由宿主决定（最小 300，默认框架宽度的 45%，最大 70%）；豆板边长上限 480。
3. **窄屏**：< 768px 时直接用宿主的全屏右栏，插件不做自己的抽屉或浮层；只调整正文（safe-area、色块 32px、熨烫和导出收进工具栏）。
4. **正文头部**：宿主标签条已经有标题和关闭按钮，正文里只放「‹ 返回」和「⋯」，高 36px。正文根节点 `.pd-root` 带 `role="region"` 和应用名 `aria-label`。
5. **命名与作用域**：只用 `pd-` 前缀（类名、自定义属性、keyframes）。面板内规则挂在 `.pd-root` 下，面板外渲染的元素（入口按钮、忙碌胶囊、下载用的临时链接）都带 `.pd-portal`，token 同时定义在这两个作用域上。没有无前缀的全局选择器，测试会逐条检查。
6. **容器查询**：`.pd-root{container: pd/inline-size}`。≤ 340 收紧间距；≥ 560 模板 4 列、主页最大宽 640；玩法列最大宽 `480px + 2×--pd-pad`，所以面板 640 时豆板正好 480（12/16/24 格分别是 39/29/19 px）。豆板边长 A = min(内容宽, 滚动区高度 − 其他块, 480)，最小 140，格子 = ⌊(A − 12)/N⌋；矮窗口先缩豆板，保证色板和「熨烫」不用滚动就能看到。
7. **忙碌胶囊（spec §2.2）**：28px 高，放在 `conversation.input.overlay`，浮在输入框上沿右侧，带关闭按钮。模型运行满 3 秒后才出现，每个会话最多 2 次、每轮最多 1 次，停留 8 秒（悬停时暂停计时）。轮次结束、开始输入、点 ×、打开面板时立即隐藏；面板已开、偏好关闭、草稿非空、视口 < 480 时不出现。`role="status"`，按钮 `tabIndex=-1` 且按下时 `preventDefault`，不会抢输入框焦点。
8. **快捷键**：`pindou.toggle`，通过宿主的 `shortcuts` 服务注册，用户可以在设置里改绑。面板正在显示时按下会收起，否则打开。注册失败不会影响入口按钮和胶囊。
   - 只在桌面端给默认键 ⌘⌥K / Ctrl+Alt+K。
   - **Web 端不给默认键**：Web 里 ⌘⌥K 已经是宿主「搜索会话」的默认键（`packages/client/ui-workspace/src/client/shortcuts.ts:83`，Web 用 primary+alt），而注册表遇到重叠默认键会直接抛错（`packages/client/shortcuts/src/client/registry.ts` 的 `register`，"Conflicting shortcut defaults"），后注册的一方整个激活失败。实测：带 Web 默认键时 `dsh-client-ui-workspace` 激活失败，页面停在 "Failed to load plugins"。另外 web:linux 不允许 Ctrl+Alt（`shortcuts/src/binding.ts` 的 `isWebBindingAllowed`）。
9. **状态色**：danger 和 success 引用宿主状态色 `--dsw-alias-state-error-primary` 和 `--dsw-alias-state-success-primary`，带兜底值，明暗主题由宿主切换。
10. **与 spec 的两处偏差（移到 v2，spec v1.5 §15.3 已接受）**：
    - **不做缩放**（spec §3.4 的双指/滚轮缩放豆板）。豆板按面板尺寸自动取格子大小（见第 6 条），24×24 在 300px 面板下格子 11px，仍可点按；缩放和平移会和拖动画豆抢手势，留到 v2 一起设计。
    - **AI 不逐行落豆**（spec §4.7 的流式逐行出现）。Host 一次拿到完整回复，校验、修复之后才下发给前端，前端只显示“生成中”文案。逐行落豆需要流式协议和“半张图纸”的校验规则，留到 v2。
11. **凭据检测的限制（I3）**：`/api/pindou.status` 不调用模型，只看凭据是否“配了”：
    - 对选中的 provider 用 `ctx.get('credentials').describe(ref)` 查 key（ref 取 provider 配置里的 `apiKeyEnv`，官方 provider 默认 `DEEPSEEK_API_KEY`）。没有 credentials 服务时退回检查启动环境变量。查不到 → `configured:false`。
    - 账号登录（`deepseek-account`）、OAuth 和目录里没有的 provider 无法在不调用模型的情况下确认，返回 `configured:true, verified:false`，前端在输入框下提示“首次生成会检测模型配置”。
    - key 配了但无效（过期、被撤销）也只能靠真正调用发现：第一次生成返回 401 / not-configured 后，前端把状态缓存成“未配置”，再进 AI 页也直接显示未配置卡片，直到用户点「重新检测」。
12. **「打开 DSH 设置」是尽力而为（I4）**：DSH 没有给插件开放“执行命令”或“打开某个设置分区”的 API。插件从 `shortcuts.catalog` 读 `settings.open` 的实际绑定，在 `document.body` 上派发同样的 keydown，由宿主的 Web 键盘适配器处理：
    - 只在 Web（macOS/Windows 默认 ⌘⌥, / Ctrl+Alt+,）和 Linux 桌面端（DOM 适配器）生效；打开的是设置首页，不是「模型」分区，卡片里会写明。
    - macOS/Windows 桌面端由原生键盘桥处理绑定，DOM 事件无效；Web Linux 默认没有绑定；用户也可能解绑。这些情况下不显示按钮，只给文字步骤（有绑定时写出按键），「重新检测」作为主按钮。
13. **英文名**：Bead Break（中文名 拼豆小憩）。仓库名和包名仍是 `dsh-pindou`，标签页 kind 仍是 `pindou`。UI 文案只从 `src/core/i18n.ts` 的 `APP_NAME_ZH` 和 `APP_NAME_EN` 取名字；`package.json` 的 `displayName` 和 `description` 与它们保持一致。

### 5.1 `conversation.input.overlay` 定位核查

- 源码：`packages/client/ui-conversation/src/client/input/InputBar.tsx` 把这个插槽渲染在输入卡片 `.card` 里面：`<div className={css.overlayAnchor} data-composer-overlay>`。`.card` 是 `position: relative`，没有 `overflow: hidden`。
- `.overlayAnchor` 是 `position:absolute; inset:0 0 auto; height:0`，也就是贴着卡片上沿、和卡片一样宽的零高度条。宿主自己的斜杠菜单（`ui-input-trigger`）也挂在这里，用 `bottom: calc(100% + 4px)` 向上弹出，不会被裁切。
- 所以胶囊不需要 portal 到 `document.body`。它用 `position:absolute; bottom:8px; right:12px` 浮在卡片右上角的外面，不遮挡已输入的文字和发送按钮。

### 5.2 导出和复制图片在桌面端的核查（spec §15.2 第 2 项）

- **下载**：桌面端是 Electron。主窗口用默认 session（`apps/desktop/src/main.ts:258` 的 `createWindow`，没有设置 `partition`），默认 session 上没有注册 `will-download`。只有内置浏览器标签（`apps/desktop/src/browser-guests.ts:146`）和策略测试 session（`policy-test-auth.ts:40`）会 `preventDefault` 掉下载。所以 `<a download href="blob:…">` 会走 Electron 默认行为，也就是弹出系统“另存为”对话框。宿主没有提供保存文件的 API；preload 暴露的只有目录选择、路径、平台页面等（`apps/desktop/src/preload-app.ts`）。
- **实测**：在 Electron 44.7.0（DSH 桌面端依赖 `electron ^44.7.0`）里复现了 DSH 的配置：特权且 secure 的 `dsh-app:` 协议、除 media 以外一律放行的权限处理器、默认 session。点击 blob 下载链接会触发 `will-download`，文件名是 `bead-break-test.png`，类型是 `image/png`，下载状态为 `completed`。
- **兜底**：`window.open` 不可用，因为 `setWindowOpenHandler` 会拒绝所有非 http(s) 链接（`main.ts`）。所以当环境不支持 `download` 属性，或者点击下载时抛错，插件会在面板里显示导出的图片，提示用户右键或长按另存为（`src/client/render.ts` 的 `saveRoute`，`src/client/ui/App.tsx` 的 `Preview`）。
- **复制图片**：`dsh-app:` 是 secure context，`microphone-permissions.ts` 只拦截 media，其他权限全部放行。实测 `navigator.clipboard.write([new ClipboardItem({'image/png': blob})])` 返回成功，`ClipboardItem.supports('image/png')` 为 `true`。插件按 `isSecureContext`、`ClipboardItem`、`clipboard.write` 和 `supports('image/png')` 做特性检测，任何一项不满足就不显示「复制图片」按钮。
