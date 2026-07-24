# Craft Agents

本地优先的 Agent 桌面工作台。  
基于 [craft-ai-agents/craft-agents-oss](https://github.com/craft-ai-agents/craft-agents-oss) 二开，重点补强桌面端审阅、侧栏、消息接入、来源/技能/插件管理和本地打包体验。

<p>
  <a href="./CHANGELOG.md"><img alt="Changelog" src="https://img.shields.io/badge/changelog-查看更新-7c3aed?style=flat-square"></a>
  <a href="../../releases"><img alt="Releases" src="https://img.shields.io/badge/releases-下载构建-2563eb?style=flat-square"></a>
  <img alt="Version" src="https://img.shields.io/badge/version-0.16.0-111827?style=flat-square">
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
| 🧠 Agent 会话 | 多会话、本地空间、项目、标签、状态、历史滚动位置、智能意图识别 |
| 🏠 探索工作台 | 会话 / 网页双模式入口、近期工作概览、可继续执行的建议、分析开关 |
| 📊 对话内可视化 | 交互式图表、模拟器、数据探索器，内联渲染，无需额外安装技能 |
| 🎨 Cowart 画布 | 无限画布 Widget，Agent 可打开、读写画布页面，支持 AI 图片生成与编辑 |
| 🧩 MCP Apps Widget | 通用 Widget 宿主，可在消息或右侧栏渲染插件交互界面 |
| 🌐 浏览器工作区 | 持久标签页与 Profile、Cookie/登录态、历史、收藏、下载、Google 搜索 |
| 🔌 浏览器扩展 | Chrome / Microsoft 商店安装、CRX/ZIP/解压目录导入、启停与权限管理 |
| 🔑 密码管理 | macOS 钥匙串 + Touch ID 自动填充，跨会话持久保存 |
| 🪟 右侧审阅 | 信息、文件、终端、来源、Cowart 画布、快捷键面板，标签页模式切换 |
| 📎 会话信息 | 来源、Skills、会话文件、附件（文件/文件夹拖入）、对话定位器、hover 摘要卡 |
| 💰 用量统计 | 上下文占用、输入/输出 Token、缓存读写、费用估算、多服务商计价 |
| 🗂️ Git 工作流 | 变更差异、暂存/取消暂存、提交、分支切换/新建、拉取推送、GitHub PR |
| 🧠 项目长期记忆 | MEMORY.md 编辑入口，项目级 Agent 上下文可见可控 |
| 🔌 插件市场 | Git/本地安装、公开市场浏览、Agent 插件与浏览器扩展分类管理 |
| 🔐 账号与认证 | 外部 OAuth、插件连接器→原生数据源映射、重连断开 |
| 🤖 模型运行时 | Pi 0.80.10、统一 ModelRuntime、热更新凭据、Kimi/Grok 等最新模型 |
| 💬 消息接入 | 飞书/Lark、微信 ilink 适配器 |
| 🧰 桌面工具 | 内嵌终端、工作区文件浏览、专注模式、诊断导出、中文原生菜单 |
| 🏗️ 本地打包 | macOS / Windows / Linux Electron 构建与运行时资源补齐 |

桌面端按平台使用原生或内置 UI 字体：macOS 保持系统字体与苹方，Windows 内置并默认使用 OFL 许可的思源黑体 CN 可变字体，无需用户额外安装中文字体。

## 特色

### 探索工作台

左侧「探索」入口统一为会话 / 网页双模式，中间列表随模式切换。首页展示近期工作概览和可继续执行的建议，输入框自动识别意图：网址直接导航、短文本搜索、自然语言发起智能问答。

### 对话内可视化

内置 Visualize 技能与安全的交互组件运行环境。Agent 可以在回答中生成可操作的图表、数据探索器、计算器和演示工具，无需额外安装技能。Cowart 画布 Widget 和 MCP Apps 通用 Widget 宿主进一步扩展了可交互内容的范围。

### 主浏览器工作区

左侧「浏览器」入口复用桌面端三栏布局：中间管理标签、收藏、历史和下载，右侧运行真实 Chromium 页面。浏览标签、Cookie、Session、localStorage 和站点权限使用独立持久 Profile，关闭应用后可恢复页面和登录状态。

浏览器支持 OAuth 弹窗、下载管理、书签导入导出，以及从 Google / Microsoft 扩展商店、CRX / ZIP 包或解压目录安装兼容的 Chromium 扩展。商店详情页可直接「添加至 Craft Agents」；扩展管理页展示图标、版本、权限和来源。

新标签页只保留居中的输入框：网址直接访问，普通文字使用 Google 搜索。空白页输入由 Craft Agents 主界面托管，提交导航后再切换到原生 Chromium 页面，避免 Windows 与 macOS 嵌入式网页层争夺输入焦点。

macOS 密码保存接入系统钥匙串，读取和自动填充前可使用 Touch ID。正式签名构建会优先使用 Data Protection Keychain / iCloud Keychain；开发或无对应 entitlement 的构建回退到本机安全存储。

### 审阅工作区

右侧审阅栏用于把辅助信息放在会话旁边：信息面板、文件浏览、终端、来源列表、快捷键、Cowart 画布和插件 Widget 都可以作为标签页打开，减少来回切窗口。

### 会话信息与用量

会话右上角「信息」面板把上下文、任务上下文、会话文件、输出、来源与 API 用量收在一个入口里。用量区展示当前模型、上下文占用、输入 / 输出 Token、缓存读取 / 写入 Token 和预估费用，并标注官方 API、DeepSeek、订阅账号或自定义端点的计价类型。面板会随窗口和输入框自动调整高度。

输入框支持拖入文件和文件夹作为附件；文件夹以引用语法传入会话。附件预览按类型展示对应图标和元信息，支持去重、删除和草稿恢复。对话定位器在聊天区左侧显示轻量刻度，悬停时展示当前片段摘要。会话列表 hover 展示标题、摘要、空间和工作目录。

### Git 工作流

输入框旁「Git」入口提供完整的版本控制操作：变更与差异查看、暂存/取消暂存、提交、切换与新建分支、拉取、推送、同步、分支比较和 GitHub PR 状态与创建。结合项目文件、代码工具和开发意图智能显示与排序，普通对话和非 Git 目录自动隐藏。

### 插件与市场

支持从 Git、本地目录和插件市场安装扩展，统一加载插件技能、MCP 工具、交互式 Widget 与品牌图标。公开市场默认接入 `openai/plugins`，支持搜索、浏览和添加其他 Git marketplace。插件详情展示兼容性、认证状态和启停控制；Agent 插件与浏览器扩展分类管理。

### 账号与认证

设置「账号」页面用于外部账号绑定认证。Google OAuth 应用凭据进入本地 AES-256-GCM 加密仓库。Gmail、Google Calendar、Google Drive 等插件连接器可映射到原生数据源，复用统一 OAuth、刷新与权限链路。

### 专注模式

左上角布局菜单和 macOS「视图」菜单都可进入专注模式。启用后侧栏、会话列表、顶部栏和 macOS 窗口按钮自动隐藏；鼠标移到窗口顶部可临时唤醒顶部区域。进入时会通过右上角通知提示当前平台快捷键（macOS `⌘ + .`，Windows / Linux `Ctrl + .`）；退出并重新打开应用也会恢复普通布局，专注状态不会跨重启保存。

### 模型运行时

Pi 运行时升级至 `0.80.10`，主会话、临时查询、自定义兼容端点和会话内模型切换统一使用官方 `ModelRuntime`。凭据在进程内热更新，不写入 Pi 默认 `auth.json`；模型目录包含 Kimi K3、Kimi Coding HighSpeed 和 Grok 4.5 Responses 等新增模型元数据。

### 消息平台

保留上游消息能力，并加入微信 ilink 适配器，面向个人本地自动化和多渠道会话同步。

## 下载

见 [Releases](../../releases)：

- macOS（Apple Silicon）：`Craft-Agents-arm64.dmg`
- Windows（Intel/AMD x64）：`Craft-Agents-x64.exe`
- Linux（Intel/AMD x64）：`Craft-Agents-x64.AppImage`

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

macOS 本地发行建议直接运行桌面的 `打包CraftAgent.command`。菜单支持 macOS arm64、Windows x64、Linux x64 AppImage、macOS + Windows 和三平台全量打包，成品统一复制到 `~/Downloads/Craft Pack/`，中间解包目录保留在仓库的 `apps/electron/release/`。

打包脚本会复用 `~/Library/Caches/CraftAgent/build-downloads/` 中经过校验的 Bun 与 ripgrep，以及 Bun/npm/electron-builder 自身缓存。`bun install` 会在每个平台构建前校验工作区，但依赖未变化时不会完整重装。网络中断的运行时下载支持重试与断点续传。

```bash
# 三平台交互式菜单
bash apps/electron/scripts/package-menu.sh

# 只检查环境、版本、输出与缓存目录
bash apps/electron/scripts/package-menu.sh --check

# 也可直接调用单平台脚本
bash apps/electron/scripts/build-dmg.sh arm64
bash apps/electron/scripts/build-win.sh
bash apps/electron/scripts/build-linux.sh x64
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
