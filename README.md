# Craft Agents

本地优先的 Agent 桌面工作台。  
基于 [craft-ai-agents/craft-agents-oss](https://github.com/craft-ai-agents/craft-agents-oss) 二开，重点补强桌面端审阅、侧栏、消息接入、来源/技能/插件管理和本地打包体验。

<p>
  <a href="./CHANGELOG.md"><img alt="Changelog" src="https://img.shields.io/badge/changelog-查看更新-7c3aed?style=flat-square"></a>
  <a href="../../releases"><img alt="Releases" src="https://img.shields.io/badge/releases-下载构建-2563eb?style=flat-square"></a>
  <img alt="Version" src="https://img.shields.io/badge/version-0.11.4-111827?style=flat-square">
  <img alt="Branch" src="https://img.shields.io/badge/branch-my--changes-64748b?style=flat-square">
</p>

## 快速入口

- 📦 [下载 Releases](../../releases)
- 📝 [查看更新日志](./CHANGELOG.md)
- 🌱 [原始上游项目](https://github.com/craft-ai-agents/craft-agents-oss)
- 🧭 当前开发分支：`my-changes`

## 能力概览

| 模块 | 内容 |
| --- | --- |
| 🧠 Agent 会话 | 多会话、本地空间、项目、标签、状态、历史滚动位置 |
| 📊 对话内可视化 | 交互式图表、模拟器、对比工具和动态控件，可直接在回答中运行 |
| 🌐 主浏览器工作区 | 三栏浏览界面、持久标签页、登录态、历史、收藏、下载、扩展与 Agent 共用 Runtime |
| 🪟 右侧审阅 | 信息、文件、终端、来源页、Cowart 画布入口 |
| 📎 来源与资源 | Sources、Skills、会话文件、输出文件、上下文资源面板 |
| 🔌 插件与扩展 | Codex / Claude / Craft 插件包、Git 市场、MCP Apps、兼容性诊断与热更新 |
| 🔐 账号与认证 | 外部账号 OAuth 应用配置、插件连接状态、重连与断开 |
| 💬 消息接入 | Telegram、WhatsApp、飞书 / Lark、微信 ilink 适配器 |
| 🧰 桌面工具 | 内嵌终端、工作区文件浏览、浏览器工具栏、会话定位器 |
| 🏗️ 本地打包 | macOS / Windows / Linux Electron 构建与运行时资源补齐 |

## 特色

### 审阅工作区

右侧审阅栏用于把辅助信息放在会话旁边：浏览器、终端、文件夹、来源列表和 Cowart 画布都可以作为标签页打开，减少来回切窗口。

### 对话内可视化

内置 Visualize 技能与安全的交互组件运行环境。Agent 可以在回答中生成可操作的图表、数据探索器、计算器和演示工具，无需额外安装技能。

### 主浏览器工作区

左侧「浏览器」入口复用桌面端三栏布局：中间管理标签、收藏、历史和下载，右侧运行真实 Chromium 页面。浏览标签、Cookie、Session、localStorage 和站点权限使用独立持久 Profile，关闭应用后可恢复页面和登录状态。

浏览器支持 OAuth 弹窗、下载管理、书签导入导出，以及从 Chrome Web Store 链接 / 扩展 ID、CRX / ZIP 或解压目录安装兼容的 Chromium 扩展。地址栏可固定，也可悬浮隐藏；网页、扩展弹层和 Agent 操作共享同一组原生浏览标签。

macOS 密码保存接入系统钥匙串，读取和自动填充前可使用 Touch ID。正式签名构建会优先使用 Data Protection Keychain / iCloud Keychain；开发或无对应 entitlement 的构建回退到本机安全存储。Electron 只实现 Chromium 扩展 API 的兼容子集，依赖 Chrome 专有 API 的扩展可能无法完整运行。

### 来源和输出

会话资源面板把上下文、会话文件、输出和来源收在一个入口里。详细新增和修复记录见 [CHANGELOG.md](./CHANGELOG.md)。

### 插件与账号

支持从 Git、本地目录和插件市场安装扩展，并统一加载插件技能、MCP 工具、交互式 Widget 与品牌图标。插件详情会展示兼容性和认证状态；Google 外部账号应用凭据保存在本地加密凭据仓库中。

### 消息平台

保留上游消息能力，并加入微信 ilink 适配器，面向个人本地自动化和多渠道会话同步。

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

```bash
# macOS
bun run electron:dist:dev:mac

# Windows
bun run electron:dist:dev:win

# Linux
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

推送到个人仓库：

```bash
git push origin my-changes
```

## 致谢

感谢原项目 [craft-ai-agents/craft-agents-oss](https://github.com/craft-ai-agents/craft-agents-oss)。
