# Release checklist · 发布清单（v0.1.0）

本地已完成 / Done locally:

- [x] `pnpm run check` 全绿（lint、typecheck、测试、构建、`lib/` 一致、bundle 形状）
- [x] `pnpm run e2e` 全部检查通过，截图和 GIF 在 `docs/assets/`（v0.1.0 当时如此；现在 README 截图在 `docs/assets/screens/`，横幅和动图由设计师手工制作，见 CONTRIBUTING）
- [x] 真实安装验证：`dsh plugin --profile web add git+file://…#feat/pindou-break-v0.1.0` 退出码 0，无需 `allowBuilds`
- [x] `package.json` version `0.1.0`、`displayName` "Bead Break"、`keywords` 含 `dsh-plugin`、`dsh.bundle.patch` 存在、无安装脚本
- [x] README（中/英）、CONTRIBUTING（中/英）、CHANGELOG、LICENSE（MIT）

推送之后（由仓库所有者操作）/ After pushing (repo owner):

- [ ] **经主人明确确认后**，合并 PR，把 `feat/pindou-break-v0.1.0` 合进 `main`（`github:Teloi/dsh-pindou` 安装的是默认分支；未确认前不得合并）
- [ ] 在 GitHub 上用 README 里的命令装一次：`npx @deepseek-ai/dsh plugin --profile web add github:Teloi/dsh-pindou`
- [ ] 仓库 About → Topics 加上：`dsh-plugin`（awesome-dsh-hub 靠它收录）、`game`、`perler-beads`、`pixel-art`、`deepseek-harness`
- [ ] 仓库 About → Description 填：
      `拼豆小憩 Bead Break — 等模型思考时拼一会儿的像素拼豆小游戏 · a tiny perler-bead pixel game for DeepSeek Harness (DSH) while the model is busy`
- [ ] 仓库 About → Website 可留空或填 README 链接
- [ ] awesome-dsh-hub 每小时刷新一次；约 1 小时后确认插件出现在列表里（应归入 fun/游戏类）
- [ ] 发布后向 awesome 列表投稿（提 PR 前须经主人确认）

这次不做 / Not in this release:

- 不发布到 npm
- 不打 tag、不建 GitHub Release
