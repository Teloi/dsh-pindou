<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/readme-banner-dark.png">
    <img src="docs/assets/readme-banner-light.png" width="100%" alt="拼豆小憩 · Bead Break：在 AI 思考的空档，拼一颗豆">
  </picture>
</h1>

<div align="center">

<p>DSH 侧栏里的拼豆小游戏：12 个模板、AI 生成图纸、图片转图纸，拼完熨烫存进作品墙。</p>

<p>
  <a href="https://github.com/Teloi/dsh-pindou/actions/workflows/ci.yml"><img alt="CI 状态" src="https://img.shields.io/github/actions/workflow/status/Teloi/dsh-pindou/ci.yml?branch=main&style=flat-square&label=CI"></a>
  <a href="./CHANGELOG.md"><img alt="当前版本（读取 package.json）" src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2FTeloi%2Fdsh-pindou%2Fmain%2Fpackage.json&query=%24.version&prefix=v&label=version&color=blue&style=flat-square"></a>
  <a href="https://github.com/deepseek-ai/deepseek-harness"><img alt="需要的 DSH 版本（读取 package.json 的 engines.dsh）" src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2FTeloi%2Fdsh-pindou%2Fmain%2Fpackage.json&query=%24.engines.dsh&label=DSH&color=blue&style=flat-square"></a>
  <a href="./LICENSE"><img alt="许可证 MIT" src="https://img.shields.io/badge/license-MIT-blue?style=flat-square"></a>
  <a href="https://github.com/ukinch605/awesome-dsh-hub"><img alt="收录于 awesome-dsh-hub" src="https://img.shields.io/badge/awesome--dsh--hub-listed-blue?style=flat-square"></a>
</p>

<p><strong>中文</strong> · <a href="./README.en.md">English</a></p>

</div>

<br>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/readme-demo-dark.gif">
    <source media="(prefers-color-scheme: light)" srcset="docs/assets/readme-demo-light.gif">
    <img src="docs/assets/readme-demo-light.gif" width="800" alt="演示：在 DSH 等模型思考时打开拼豆小憩，选「爱心」模板逐颗拼满，点熨烫后得到定型完成的成品卡">
  </picture>
</p>

<br>

拼豆小憩是 [DeepSeek Harness（DSH）](https://github.com/deepseek-ai/deepseek-harness) Web 端的插件：在右侧边栏打开一块像素拼豆板，照着模板拼、自由拼，或者用一句话让模型生成图纸，拼完「熨烫」定型，导出 PNG。

## 特性

- **模型忙时的入口**：会话标题栏的豆子按钮，或模型运行 3 秒后输入框上方的小胶囊「趁现在拼一个？」。
- **12 个模板**：淡色引导豆和完成度，拼完「熨烫」定型，撒彩豆庆祝。
- **AI 生成图纸**：一句话 → 一次模型调用 → 图纸落到豆板上，显示消耗的 tokens。
- **图片转图纸**：拖入或粘贴图片，裁剪、选尺寸和颜色数，在本机转成图纸。
- **我的作品**：熨烫过的作品自动收进作品墙，可导出 PNG、复制图片、再拼一次。
- **跟随 DSH**：中英文界面、浅色/深色主题，键盘和读屏可用。

## 截图

<table>
  <tr>
    <td width="50%" align="center">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/assets/screens/screen-home-dark.png">
        <img src="docs/assets/screens/screen-home-light.png" width="100%" alt="主页：自由拼、AI 生成、图片转图纸、我的作品四张卡片，下面是模板列表">
      </picture>
      <br><sub>主页与 12 个模板</sub>
    </td>
    <td width="50%" align="center">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/assets/screens/screen-ai-dark.png">
        <img src="docs/assets/screens/screen-ai-light.png" width="100%" alt="AI 生成：输入「一只橘猫」后得到的 16×16 橘猫图纸，标题旁显示消耗的 tokens">
      </picture>
      <br><sub>一句话生成图纸</sub>
    </td>
  </tr>
  <tr>
    <td width="50%" align="center">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/assets/screens/screen-picture-dark.png">
        <img src="docs/assets/screens/screen-picture-light.png" width="100%" alt="图片转图纸：一张草莓图片转成 16×16 图纸预览，下方是尺寸、颜色数、抖动、去掉背景的选项">
      </picture>
      <br><sub>图片转图纸，全程在本机</sub>
    </td>
    <td width="50%" align="center">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/assets/screens/screen-works-dark.png">
        <img src="docs/assets/screens/screen-works-light.png" width="100%" alt="我的作品：按月份排列的作品墙，有幽灵、小花、樱桃、星星、鲸鱼、蘑菇、橘猫、爱心">
      </picture>
      <br><sub>作品墙</sub>
    </td>
  </tr>
</table>

<sub>截图跟随你的 GitHub 主题显示浅色或深色版本。</sub>

## 安装

需要 DSH **0.2.1-rc.3 或更高版本**（`package.json` 的 `engines.dsh` 为 `>=0.2.1-rc.3`）。桌面客户端自带的 0.2.1-rc.3、npm 上的 0.2.1-rc.5 和之后的版本都满足。版本更低时 DSH 会拒绝安装，提示 `is incompatible with dsh …`，不会装任何东西。

插件只有 Web 界面，可以装进 DSH 的 Web 端和桌面客户端。TUI、ACP 这类没有 Web 界面的 profile 不支持。不需要 `allowBuilds`：仓库里已经提交了构建好的 `lib/`，也没有任何安装脚本。

### Web

```bash
npx @deepseek-ai/dsh plugin --profile web add github:Teloi/dsh-pindou
```

然后重启 `dsh --profile web`。确认生效：

- `npx @deepseek-ai/dsh plugin --profile web list` 的列表里有 `dsh-pindou`。
- 打开 Web 页面，会话标题栏右侧出现豆子按钮。

也可以不用命令行，在 Web 侧栏的**插件**页里点**添加插件** → **安装第三方插件**，填 `github:Teloi/dsh-pindou`（界面名称以 DSH 0.2.1-rc.3 为准，0.2.2 相同，下同）。

### 桌面客户端

桌面客户端（macOS、Windows）有自己的 profile，和 Web 端分开，要单独安装：

- **在客户端里装**：在侧栏打开**插件**，点**添加插件** → **安装第三方插件**，填 `github:Teloi/dsh-pindou`。页面提示需要重启时，重启客户端。
- **用客户端自带的 `dsh` 命令装**：先在应用菜单的**管理 dsh 命令…**里安装命令。客户端至少要打开过一次，然后完全退出，再运行：

  ```bash
  dsh plugin --profile desktop add github:Teloi/dsh-pindou
  ```

确认生效：**插件**页的**已安装插件**里出现本插件，会话标题栏右侧出现豆子按钮。

<details>
<summary>桌面 profile 的位置、npm 版 <code>dsh</code> 报错怎么办</summary>

桌面 profile 在 `$DSH_HOME/profiles/desktop`；默认 macOS 是 `~/.dsh/profiles/desktop`，Windows 是 `%USERPROFILE%\.dsh\profiles\desktop`。用 npm 装的 `dsh` 不能改它：`npx @deepseek-ai/dsh plugin --profile desktop …` 会直接报错 `profile "desktop" is managed exclusively by the Electron application`。如果终端里的 `dsh` 是 npm 装的那个，用**管理 dsh 命令…**里显示的完整路径运行。重新打开客户端后生效。

可选配置写在桌面 profile 目录下的 `cordis.patch.yml` 里，键和 Web 端一样（见下文「可选配置」）。

</details>

<details>
<summary>按包名安装（发布到 npm 之后）</summary>

本插件发布到 npm 之后，上面的 `github:Teloi/dsh-pindou` 都可以换成包名 `dsh-pindou`：

- **命令行**：Web 端运行 `npx @deepseek-ai/dsh plugin --profile web add dsh-pindou`；桌面客户端退出后运行 `dsh plugin --profile desktop add dsh-pindou`（用客户端自带的 `dsh`，同上）。
- **客户端界面**：在**插件**页点**添加插件** → **安装第三方插件**，在**包名或地址**里填 `dsh-pindou`。

这需要包已经发布到 npm。镜像源（比如界面**安装源**里的**中国大陆镜像源**）的同步可能有延迟。刚发布时如果装不上或者没装到最新版，可以改用 **npm 官方源**，或者稍后再试。

</details>

### 卸载

```bash
# Web
npx @deepseek-ai/dsh plugin --profile web remove dsh-pindou
# 桌面客户端：先完全退出，再用客户端自带的 dsh；也可以直接在「插件」页里卸载
dsh plugin --profile desktop remove dsh-pindou
```

## 使用

- **打开**：点会话标题栏右侧的豆子按钮，或者模型运行 3 秒后出现的小胶囊「趁现在拼一个？」。胶囊每个会话最多出现两次，你开始打字、面板已打开或窗口太窄时不出现，可以在 ⋯ 菜单里关掉。
- **模板**：豆板上有淡色的引导豆，顶部显示完成度；拼完先问要不要「熨烫」。
- **工具**：画笔、取色、橡皮、填充、撤销/重做、清空（5 秒内可以撤回）。豆板 12 / 16 / 24 三种尺寸，16 种颜色。
- **导出**：导出 PNG，或者「复制图片」到剪贴板（浏览器不支持时这个按钮不显示）。
- **快捷键**：桌面端默认 ⌘⌥K / Ctrl+Alt+K 打开或收起面板，可以在设置的快捷键里改绑。Web 端没有默认键（这组键已经是 DSH 的「搜索会话」），需要的话在设置里自己绑。
- **键盘与读屏**：方向键移动光标，空格/回车放豆，Delete 擦除；豆板是带标签的 grid，每格会读出位置、颜色和引导色。

<details>
<summary>图片转图纸、我的作品、自动保存、按需加载的细节</summary>

- **图片转图纸**：主页的「图片转图纸」卡，或者把图片拖进面板、在主页按 ⌘V / Ctrl+V 粘贴（只在焦点在面板里时拦截，不碰聊天输入框；不是图片的文件在主页会被忽略）。裁成正方形，选尺寸 12 / 16 / 24、颜色数（16 / 8 / 4）、抖动和去背景，预览满意后「开始拼」。支持 PNG、JPG、GIF、WebP、BMP；不支持 SVG；文件不超过 20 MB、边长不超过 8000 px（按文件头里声明的尺寸判断，GIF 取画布和每一帧里最大的那个，超出的在解码前就拒绝）。
- **我的作品**：每次熨烫完成自动收进作品墙，最多 60 件，超出时删掉最旧的；取消熨烫会同时撤出。主页显示一行缩略图，「全部 ›」进入作品墙；单件可以导出 PNG、复制图片、「再拼一次」，删除不弹确认，5 秒内可以撤销（Delete 键同样）。
- **自动保存**：进度存在浏览器的 localStorage 里（键 `dsh-pindou:v1`），关掉面板再打开还在。作品墙单独存在键 `dsh-pindou:works` 里，每件不到 1 KB。
- **按需加载**：图片转图纸和作品墙页是异步模块，第一次打开时才加载，首屏包不变大。DSH 太旧、不支持动态加载时，卡片显示「需要新版 DSH」并不可用；加载失败时显示「加载失败，点此重试」。这两种情况下拖进面板的图片都会被吞掉，不会变成聊天附件。
- **语言与主题**：跟随 DSH 的语言（中文优先，另有英文）和浅色/深色主题。
- **暂不支持**（计划在 v2）：豆板缩放（豆板会按面板大小自动调整格子）；AI 生成时逐行落豆（现在是整张图纸一次出现）。

</details>

## AI 生成图纸

一句话（例如「一只橘猫」）→ 一次模型调用 → 校验并修复图纸 → 落到豆板上，同时显示消耗的 tokens。相同的请求会命中本地缓存（最多 24 条），不再花 tokens。

模型按下面的顺序选：

1. **DSH 当前的默认模型**（和你聊天用的是同一个，无需额外配置）。
2. 如果 DSH 没有可用的模型路由，而环境变量里有 `DEEPSEEK_API_KEY`，直接调用 DeepSeek API（`deepseek-chat`）。
3. 都没有时，AI 页会提示「还没有可用的模型」，模板和自由拼不受影响。

检测只看凭据有没有配置，不会为此调用模型；账号登录等无法提前确认的情况会提示「首次生成会检测模型配置」。Key 失效时，第一次生成失败后会一直显示未配置，直到你点「重新检测」。DSH 没有给插件开放跳到「模型」设置的接口，「打开 DSH 设置」按钮只在能用设置快捷键打开时出现（打开的是设置首页），其他情况只给文字步骤。

<details>
<summary>可选配置</summary>

在 Web profile 的 `$DSH_HOME/profiles/web/cordis.patch.yml` 里，用同一个 id `pindou` 覆盖配置：

```yaml
- id: pindou
  config:
    provider: deepseek-official
    model: deepseek-v4-flash
    maxTokens: 1024
```

可用的键如下，全部可选；未知键或非法值会让插件加载失败并给出原因：

| 键 | 默认值 | 说明 |
| --- | --- | --- |
| `provider` + `model` | — | 固定使用某个 DSH 模型路由，两个必须一起给 |
| `apiKeyEnv` | `DEEPSEEK_API_KEY` | 直连兜底读取的环境变量名 |
| `baseUrl` | `https://api.deepseek.com` | 直连兜底的地址（只允许 https，测试时可用 http://localhost） |
| `fallbackModel` | `deepseek-chat` | 直连兜底用的模型 |
| `maxTokens` | `1024` | 每次生成的输出上限 |
| `timeoutMs` | `30000` | 单次生成超时 |
| `minIntervalMs` | `1500` | 两次生成的最短间隔 |

</details>

## 隐私与权限

- **图片**：图片只在本机处理，不会上传，不发网络请求，也不花 tokens；原图不保存、不落盘，只保存量化后的图纸编码。
- **密钥**：只在 DSH 的服务端进程里读取，不会发到浏览器。
- **存储**：只在浏览器里，localStorage 的 `dsh-pindou:v1`（进度）、`dsh-pindou:works`（作品墙）、`dsh-pindou:ai-cache:v1`（AI 图纸缓存），以及 sessionStorage 的 `dsh-pindou:hints`（小胶囊本会话出现的次数）。
- **网络**：浏览器里的插件只向 DSH 自己的服务发请求（同源：生成和检测两个接口，以及按需加载的两个模块）。唯一发往外部的请求是「AI 生成图纸」的那次模型调用，由 DSH 服务端发出：走 DSH 的模型路由，或你配置的 DeepSeek API 直连兜底（只允许 https，本机测试除外）。检测模型配置时不调用模型；没有任何统计或上报。

## 开发

```bash
pnpm install
pnpm run check      # lint + typecheck + 测试 + 构建 + bundle 形状检查
pnpm run e2e        # 从源码启动 DSH Web，用 Playwright 跑一遍，截图写进 $TMPDIR/pindou-e2e-out（加 -- --update-assets 会刷新 docs/assets/screens 里的面板截图）
```

代码分三层：`src/core`（纯逻辑：豆板、模板、图纸校验修复、缓存，无 DOM）、`src/client`（React 界面与 DSH 客户端胶水）、`src/host`（DSH 服务端：模型调用）。DSH 的界面约束和设计决定记在 [docs/dsh-ui-constraints.md](docs/dsh-ui-constraints.md)。

参与贡献请看 [CONTRIBUTING.md](CONTRIBUTING.md)，变更记录见 [CHANGELOG.md](CHANGELOG.md)。

## 许可证

[MIT](LICENSE) © 2026 Teloi
