# Craft Agents（个人二开版）

基于 [craft-ai-agents/craft-agents-oss](https://github.com/craft-ai-agents/craft-agents-oss) 的个人本地化分支。这个版本以本地桌面体验为主，在原版 Agent、会话、来源、技能、消息平台能力之上，补了一批更适合日常使用的审阅、侧栏、输入和打包能力。

当前分支：`my-changes`

当前版本：`0.11.1-beta10`

## 近期重点

### 2026-07-14 审阅栏与 Cowart 体验完善

- 右侧审阅栏改为标签页式工作区，浏览器、终端、文件夹、Cowart 画布和来源页都作为标签打开。
- 新增 Cowart 画布入口，可启动本地 Cowart 服务并在审阅栏中打开画布页面。
- 浏览器地址栏改为 Codex 风格：默认无内层边框、显示简化域名，聚焦时显示完整 URL 输入框。
- 浏览器工具栏支持悬浮 / 固定，未固定时自动收起以扩大网页内容区。
- 会话资源面板的来源超过 3 项时显示「查看全部」，并可在右侧审阅栏打开完整来源列表。
- 对话内容定位器移动到输入区右侧，悬停时显示片段摘要、相关文件和来源信息。
- 优化主对话区与右侧审阅栏 resize 行为，小窗口下也能灵活调整宽度。

### 2026-07-13 界面与工作流改版

- 新增 Codex 风格右侧审阅栏，支持信息、文件、终端、浏览器等工作区辅助视图。
- 新增会话资源悬浮面板，把标题、上下文、会话文件、输出、来源统一收纳到顶部按钮中。
- 新增对话内容定位器，在聊天区左侧用轻量刻度显示当前滚动位置，悬停时显示对应片段摘要。
- 新增内嵌终端能力，可在审阅栏内直接打开当前工作区终端。
- 优化主聊天区与悬浮面板的宽度适配，避免面板覆盖消息、滚动条和输入区。
- 优化消息列表 hover 预览，改为简洁的会话摘要，不再展示完整消息和文件清单。
- 优化设置页布局与中文文案：`Workspace` 改为「空间」，`Messaging` 改为「消息」，`AI` 改为「模型」。

### 2026-07-12 历史对话滚动设置

- 新增「设置 → 输入 → 历史对话」配置。
- 支持打开历史对话时定位到底部、顶部或上次阅读位置。
- 修复历史会话内容尚未完全布局时误停在顶部的问题。

### 微信与消息平台接入

在 `packages/messaging-gateway/src/adapters/wechat/` 新增 ilink 协议适配器，支持：

- 微信扫码登录与多账号管理
- 文本、图片、语音、视频收发
- 媒体上传下载与 CDN 处理
- 会话同步与消息平台绑定

前端通过消息设置页连接微信，同时保留 Telegram、WhatsApp、飞书 / Lark 等平台入口。

### 打包与运行时补齐

- Electron 打包流程会复制子进程、终端页面、preload 与运行时资源。
- macOS 打包继续使用经典 `icon.icns`，避免 Liquid Glass 图标在不同环境下渲染不一致。
- `electron:dist:dev:mac` 走 `build-dmg.sh`，更稳定地包含 SDK 与子进程资源。

### 上游同步

已同步 upstream `v0.11.1` 相关能力：

- OpenAI GPT-5.6（Luna、Terra、Sol）连接支持
- 模型原生 Max thinking level
- Pi SDK 0.80.6 及长上下文成本统计改进

## 功能概览

- 多会话 Agent 桌面应用
- 本地 Workspace / 空间管理
- Sources、Skills、Labels、Projects、Views
- 右侧审阅栏：信息、文件浏览、内嵌终端、浏览器控制
- 会话资源悬浮面板：上下文、会话文件、输出、来源
- 对话滚动定位器与历史滚动位置设置
- Telegram、WhatsApp、飞书 / Lark、微信消息接入
- macOS / Windows / Linux Electron 打包

## 下载

见 [Releases](../../releases)：

- macOS（Apple Silicon）：`Craft-Agents-arm64.dmg`
- Windows（Intel/AMD x64）：`Craft-Agents-x64.exe`

## 开发

```bash
bun install
bun run electron:dev
```

常用检查：

```bash
bun run typecheck:electron
bun run typecheck:all
```

## 打包

macOS 本地开发包：

```bash
bun run electron:dist:dev:mac
```

Windows 本地开发包：

```bash
bun run electron:dist:dev:win
```

Linux 本地开发包：

```bash
bun run electron:dist:dev:linux
```

## 同步上游

如果本地还没有 `upstream` remote：

```bash
git remote add upstream https://github.com/craft-ai-agents/craft-agents-oss.git
```

```bash
git fetch upstream
git merge upstream/main
bun run typecheck:electron
```

同步到个人仓库：

```bash
git push origin my-changes
```

## 更新日志

详细记录见 [CHANGELOG.md](./CHANGELOG.md)。

## 致谢

感谢原项目 [craft-ai-agents/craft-agents-oss](https://github.com/craft-ai-agents/craft-agents-oss)。
