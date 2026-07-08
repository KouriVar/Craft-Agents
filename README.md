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

### agent 记忆 + 腾讯DB网关

长期记忆功能：

- 腾讯DB网关子进程（`tdai-gateway/gateway-server.cjs`）做向量检索后端
- bm25 中文分词数据（81MB）走 Git LFS，仓库不膨胀
- 记忆卡片侧栏（`MemoryCardsSidebar`）展示历史记忆
- 设置页配置记忆开关

### app 图标改回经典

上游用 macOS 26 的 `Assets.car`（Liquid Glass 图标），但渲染不一致。改 `afterPack.cjs` 移除 Assets.car 引用，用经典 `icon.icns`。

### 打包脚本

`scripts/electron-build-subprocess.ts`：构建 session-mcp-server + pi-agent-server 子进程并复制到 resources，让 OSS 的 `electron:dist` 命令也能正确打包子进程（上游只在他的内部构建脚本里做这步）。

## 致谢

感谢原项目 [craft-ai-agents/craft-agents-oss](https://github.com/craft-ai-agents/craft-agents-oss)。

## 下载

mac 安装包见 [Releases](../../releases)，arm64（Apple Silicon）和 x64（Intel）都有。

## 自用备注

- 打包（mac，不签名）：`bun run electron:dist:dev:mac`
- 同步上游：`git fetch upstream && git merge upstream/main`
- 主分支：`my-changes`
