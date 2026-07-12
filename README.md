# Craft Agents（个人二开版）

基于 [craft-ai-agents/craft-agents-oss](https://github.com/craft-ai-agents/craft-agents-oss) 的个人本地化分支，自用为主。

## 相比原版的改动

### 微信接入

在 messaging-gateway 包里新增 ilink 协议适配器（`packages/messaging-gateway/src/adapters/wechat/`），支持：

- 扫码登录 + 多账号管理
- 消息收发（文本/图片/语音/视频）
- 媒体上传下载 + CDN
- 会话同步

前端通过 `WeChatConnectDialog` 连接，消息集成进主会话流。

### app 图标改回经典

上游用 macOS 26 的 `Assets.car`（Liquid Glass 图标），但渲染不一致。改 `afterPack.cjs` 移除 Assets.car 引用，用经典 `icon.icns`。

### 打包脚本

`scripts/electron-build-subprocess.ts`：构建 session-mcp-server + pi-agent-server 子进程并复制到 resources，让 OSS 的 `electron:dist` 命令也能正确打包子进程（上游只在他的内部构建脚本里做这步）。

## 更新日志

详细修复记录见 [CHANGELOG.md](./CHANGELOG.md)。

### 2026-07-09 上游 issue 修复（7 项）

基于 upstream v0.11.0 的 bug 修复集合，涉及 21 文件（+126 / -36）：

- #837 macOS 中文输入法自动大写干扰
- #868 Opus 4.8 / 4.7 模型描述重复
- #822 编辑连接时遮罩 API Key 被回传后端
- #891 Auto-update 日志在生产环境丢失
- #876 本地 `file://` 链接报 "URL is malformed"
- #789 Skill 目录不支持符号链接
- #933 Write 工具 diff 视图显示全量新增

完整说明见 [docs/CHANGELOG-2026-07-09.md](./docs/CHANGELOG-2026-07-09.md)。

## 致谢

感谢原项目 [craft-ai-agents/craft-agents-oss](https://github.com/craft-ai-agents/craft-agents-oss)。

## 下载

见 [Releases](../../releases)：

- **macOS（Apple Silicon）**：Craft-Agents-arm64.dmg
- **Windows（Intel/AMD x64）**：Craft-Agents-x64.exe

## 自用备注

- 打包（mac，不签名）：`bun run electron:dist:dev:mac`
- 同步上游：`git fetch upstream && git merge upstream/main`
- 主分支：`my-changes`
