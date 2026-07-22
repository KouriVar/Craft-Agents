# Craft Agents

本地优先的 Agent 桌面工作台。  
基于 [craft-ai-agents/craft-agents-oss](https://github.com/craft-ai-agents/craft-agents-oss) 二开，重点补强桌面端审阅、侧栏、消息接入、来源/技能/插件管理和本地打包体验。

<p>
  <a href="./CHANGELOG.md"><img alt="Changelog" src="https://img.shields.io/badge/changelog-查看更新-7c3aed?style=flat-square"></a>
  <a href="../../releases"><img alt="Releases" src="https://img.shields.io/badge/releases-下载构建-2563eb?style=flat-square"></a>
  <img alt="Version" src="https://img.shields.io/badge/version-0.12.0-111827?style=flat-square">
  <img alt="Branch" src="https://img.shields.io/badge/branch-my--changes-64748b?style=flat-square">
</p>

## 快速入口

- 📦 [下载 Releases](../../releases)
- 📝 [查看更新日志](./CHANGELOG.md)
- 🌱 [原始上游项目](https://github.com/craft-ai-agents/craft-agents-oss)
- 🧭 当前开发分支：`my-changes`

## v0.11.8 更新防回退修复

- 自动清理 0.11.6 遗留的 updater pending 缓存，用户无需手动删除隐藏目录。
- 显式禁止版本降级，关闭普通退出自动安装，并在下载完成与安装前双重校验版本。
- Windows/Linux 仍保留用户确认后的自动安装与重新启动；未签名 macOS 继续提供 GitHub Release 手动下载。

## v0.11.7 更新渠道与维护基础设施

- 本地版自动更新改用个人仓库 GitHub Latest Release 的 generic feed；Windows x64 和 Linux AppImage 保留自动安装，未签名 macOS 构建提供手动下载入口。
- `BrowserPaneManager` 保持 Facade，对实例注册、关闭顺序、迟到事件和连续崩溃恢复提取可测试的 `BrowserTabLifecycle`。
- `my-changes` push/PR 接入 Ubuntu 快速检查和 Windows/macOS 关键矩阵，恢复版本、i18n、IPC 与工具命名检查，并为文档工具 smoke 设置超时。

升级说明：0.11.7 已完成新更新地址迁移，但可能误装旧的 0.11.6 缓存。受影响用户直接手动安装 0.11.8 即可自动清理，无需自行删除缓存；后续升级继续使用递增版本验证。

## v0.11.6 稳定性优化

- 内置浏览器补强标签创建、恢复、切换、关闭与崩溃恢复的状态边界，避免重复新标签、迟到事件回插和工作区异步串线。
- 原生网页与 React 菜单、弹窗、通知、最新动态统一使用语义层级和暂停原因协议，减少网页遮挡浮层或关闭浮层后无法恢复。
- 历史、收藏和下载改为事件驱动刷新；窗口恢复、重复启动、退出清理和隐私安全诊断导出覆盖 macOS、Windows x64 与 Linux 的关键差异。
- Button、输入框、菜单、Tooltip、Dialog 等开始复用全局控件、圆角、间距与 z-index token，小窗口和系统缩放下保留安全边距。

## 能力概览

| 模块 | 内容 |
| --- | --- |
| 🧠 Agent 会话 | 多会话、本地空间、项目、标签、状态、历史滚动位置 |
| 📊 对话内可视化 | 交互式图表、模拟器、对比工具和动态控件，可直接在回答中运行 |
| 🌐 主浏览器工作区 | 三栏浏览界面、持久标签页、Google 搜索、登录态、历史、收藏、下载、扩展与 Agent 共用 Runtime |
| 🪟 右侧审阅 | 信息、文件、终端、来源页、Cowart 画布入口 |
| 📎 会话信息与用量 | Sources、Skills、会话文件、输出、上下文 Token、缓存 Token 与费用估算 |
| 🔌 插件与扩展 | Codex / Claude / Craft 插件包、Git 市场、MCP Apps、兼容性诊断与热更新 |
| 🔐 账号与认证 | 外部账号 OAuth 应用配置、插件连接状态、重连与断开 |
| 🤖 模型运行时 | Pi 0.80.10、统一 ModelRuntime、热更新凭据与最新模型目录 |
| 💬 消息接入 | Telegram、WhatsApp、飞书 / Lark、微信 ilink 适配器 |
| 🧰 桌面工具 | 内嵌终端、工作区文件浏览、专注模式、会话定位器与中文原生菜单 |
| 🏗️ 本地打包 | macOS / Windows / Linux Electron 构建与运行时资源补齐 |

桌面端按平台使用原生或内置 UI 字体：macOS 保持系统字体与苹方，Windows 内置并默认使用 OFL 许可的思源黑体 CN 可变字体，无需用户额外安装中文字体。

## 特色

### 审阅工作区

右侧审阅栏用于把辅助信息放在会话旁边：浏览器、终端、文件夹、来源列表和 Cowart 画布都可以作为标签页打开，减少来回切窗口。

### 对话内可视化

内置 Visualize 技能与安全的交互组件运行环境。Agent 可以在回答中生成可操作的图表、数据探索器、计算器和演示工具，无需额外安装技能。

### 主浏览器工作区

左侧「浏览器」入口复用桌面端三栏布局：中间管理标签、收藏、历史和下载，右侧运行真实 Chromium 页面。浏览标签、Cookie、Session、localStorage 和站点权限使用独立持久 Profile，关闭应用后可恢复页面和登录状态。

浏览器支持 OAuth 弹窗、下载管理、书签导入导出，以及从 Google / Microsoft 扩展商店、CRX / ZIP 包或解压目录安装兼容的 Chromium 扩展。商店详情页可直接「添加至 Craft Agents」，扩展管理页展示图标、版本、权限和来源。

新标签页只保留居中的输入框：网址直接访问，普通文字使用 Google 搜索。空白页输入由 Craft Agents 主界面托管，提交导航后再切换到原生 Chromium 页面，避免 Windows 与 macOS 嵌入式网页层争夺输入焦点。导航、刷新、复制链接、收藏、密码、站点权限和扩展入口跟随当前标签显示；「更多」在标签卡内展开，固定扩展在折叠状态下仍可直接打开。

macOS 密码保存接入系统钥匙串，读取和自动填充前可使用 Touch ID。正式签名构建会优先使用 Data Protection Keychain / iCloud Keychain；开发或无对应 entitlement 的构建回退到本机安全存储。Electron 只实现 Chromium 扩展 API 的兼容子集，依赖 Chrome 专有 API 的扩展可能无法完整运行。

### 会话信息与用量

会话右上角「信息」面板把上下文、会话文件、输出、来源与 API 用量收在一个入口里。用量区展示当前模型、上下文占用、输入 / 输出 Token、缓存读取 / 写入 Token 和预估费用，并标注官方 API、DeepSeek、订阅账号或自定义端点的计价类型。面板会随窗口和输入框自动调整高度。

### 插件与账号

支持从 Git、本地目录和插件市场安装扩展，并统一加载插件技能、MCP 工具、交互式 Widget 与品牌图标。插件详情会展示兼容性和认证状态；Google 外部账号应用凭据保存在本地加密凭据仓库中。

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
