# 贡献指南

感谢你关注 Craft Agents。本仓库是基于 `craft-agents-oss` 的个人本地化维护分支，主要用于桌面端体验、消息平台接入、打包和本地工作流改进。

## 开始之前

### 环境要求

- [Bun](https://bun.sh/)
- Node.js 18+
- macOS、Linux 或 Windows

### 本地开发

```bash
git clone https://github.com/KouriVar/Craft-Agents.git
cd Craft-Agents
bun install
bun run electron:dev
```

### 常用检查

```bash
bun run typecheck:electron
bun run typecheck:all
```

## 开发流程

1. 从 `my-changes` 创建你的工作分支。
2. 保持改动聚焦，尽量避免混入无关格式化。
3. UI 改动请附截图或说明关键交互。
4. 提交前至少运行相关 typecheck。
5. 提交信息尽量说明“做了什么”和“为什么”。

### 分支命名建议

- `feature/add-review-panel`
- `fix/history-scroll-position`
- `refactor/settings-layout`
- `docs/update-release-notes`

## 代码风格

- 项目主要使用 TypeScript。
- 优先沿用现有组件、hooks、状态和样式模式。
- 避免为小改动引入过重抽象。
- 注释只写必要上下文，不重复代码本身。
- 前端改动需要注意窄屏、宽屏、滚动、hover、focus 等状态。

## Pull Request 建议

请在 PR 中说明：

- 改动摘要
- 影响范围
- 测试方式
- UI 改动截图（如果有）

可以使用下面的格式：

```markdown
## 摘要

## 改动

## 测试

## 截图
```

## 项目结构

```text
Craft-Agents/
├── apps/
│   └── electron/      # 桌面端应用
└── packages/
    ├── shared/        # 共享业务逻辑、协议和配置
    ├── server-core/   # RPC、会话和服务端核心逻辑
    └── ui/            # React UI 组件
```

## 许可证

提交贡献即表示你同意你的贡献按 Apache License 2.0 授权。

---

# Contributing

Thank you for your interest in Craft Agents. This repository is a personally maintained localization and customization branch based on `craft-agents-oss`, focused on desktop UX, messaging integrations, packaging, and local workflow improvements.

## Before You Start

### Requirements

- [Bun](https://bun.sh/)
- Node.js 18+
- macOS, Linux, or Windows

### Local Development

```bash
git clone https://github.com/KouriVar/Craft-Agents.git
cd Craft-Agents
bun install
bun run electron:dev
```

### Common Checks

```bash
bun run typecheck:electron
bun run typecheck:all
```

## Development Workflow

1. Create your working branch from `my-changes`.
2. Keep changes focused and avoid unrelated formatting churn.
3. For UI changes, include screenshots or describe the key interaction.
4. Run the relevant typecheck before submitting.
5. Use commit messages that explain what changed and why.

### Branch Naming Suggestions

- `feature/add-review-panel`
- `fix/history-scroll-position`
- `refactor/settings-layout`
- `docs/update-release-notes`

## Code Style

- The project is primarily written in TypeScript.
- Prefer existing components, hooks, state patterns, and styling conventions.
- Avoid adding heavy abstractions for small changes.
- Use comments only when they add useful context.
- For frontend changes, consider narrow screens, wide screens, scrolling, hover, and focus states.

## Pull Request Suggestions

Please include:

- Summary
- Scope / impact
- Testing notes
- Screenshots for UI changes, if applicable

Suggested format:

```markdown
## Summary

## Changes

## Testing

## Screenshots
```

## Project Structure

```text
Craft-Agents/
├── apps/
│   └── electron/      # Desktop application
└── packages/
    ├── shared/        # Shared business logic, protocols, and config
    ├── server-core/   # RPC, sessions, and server-core logic
    └── ui/            # React UI components
```

## License

By contributing, you agree that your contributions will be licensed under the Apache License 2.0.
