# Craft Agents

本地优先的 Agent 桌面工作台。  
基于 [craft-ai-agents/craft-agents-oss](https://github.com/craft-ai-agents/craft-agents-oss) 二开，重点补强桌面端审阅、侧栏、消息接入、来源/技能管理和本地打包体验。

<p>
  <a href="./CHANGELOG.md"><img alt="Changelog" src="https://img.shields.io/badge/changelog-查看更新-7c3aed?style=flat-square"></a>
  <a href="../../releases"><img alt="Releases" src="https://img.shields.io/badge/releases-下载构建-2563eb?style=flat-square"></a>
  <img alt="Version" src="https://img.shields.io/badge/version-0.11.3-111827?style=flat-square">
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
| 🪟 右侧审阅 | 信息、文件、终端、浏览器、来源页、Cowart 画布入口 |
| 📎 来源与资源 | Sources、Skills、会话文件、输出文件、上下文资源面板 |
| 💬 消息接入 | Telegram、WhatsApp、飞书 / Lark、微信 ilink 适配器 |
| 🧰 桌面工具 | 内嵌终端、工作区文件浏览、浏览器工具栏、会话定位器 |
| 🏗️ 本地打包 | macOS / Windows / Linux Electron 构建与运行时资源补齐 |

## 特色

### 审阅工作区

右侧审阅栏用于把辅助信息放在会话旁边：浏览器、终端、文件夹、来源列表和 Cowart 画布都可以作为标签页打开，减少来回切窗口。

### 对话内可视化

内置 Visualize 技能与安全的交互组件运行环境。Agent 可以在回答中生成可操作的图表、数据探索器、计算器和演示工具，无需额外安装技能。

### 来源和输出

会话资源面板把上下文、会话文件、输出和来源收在一个入口里。详细新增和修复记录见 [CHANGELOG.md](./CHANGELOG.md)。

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
