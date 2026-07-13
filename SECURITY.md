# 安全政策

## 报告安全问题

如果你发现 Craft Agents 或本分支中的安全问题，请负责任地报告。

请不要在公开 GitHub issue 中披露可被利用的漏洞细节。你可以优先通过 GitHub 私下联系维护者，或在 issue 中只说明“希望私下报告安全问题”，不要附复现细节、密钥、token 或攻击载荷。

报告时建议包含：

- 问题描述
- 影响范围
- 复现步骤
- 可能的修复建议（可选）
- 你的联系方式（如果希望后续沟通）

## 适用范围

本安全政策适用于：

- Craft Agents 桌面应用
- 本仓库内的 `apps/*` 与 `packages/*`
- 本分支新增或修改的消息平台、终端、审阅栏、来源和打包相关逻辑

## 不适用范围

- 第三方依赖自身的漏洞，请优先报告给对应维护者。
- 社会工程攻击。
- 对公共服务的拒绝服务攻击。
- 已经公开且没有本仓库特定影响的通用漏洞。

## 使用建议

- 不要提交 `.env`、API key、token、cookie 或私钥。
- 谨慎使用可执行命令、终端、脚本和高权限模式。
- 从 release 下载应用时，优先使用最新版本。
- 如果你修改了打包脚本或 preload / IPC 逻辑，请额外检查权限边界。

## 支持版本

| 版本 | 安全更新 |
| --- | --- |
| 最新版本 | 支持 |
| 旧版本 | 尽力而为 |

---

# Security Policy

## Reporting a Vulnerability

If you discover a security issue in Craft Agents or in this branch, please report it responsibly.

Please do not disclose exploitable vulnerability details in a public GitHub issue. Prefer contacting the maintainer privately through GitHub, or open an issue that only says you would like to report a security issue privately. Do not include reproduction details, secrets, tokens, or attack payloads in public.

Useful information to include:

- Description of the issue
- Potential impact
- Steps to reproduce
- Suggested fix, if any
- Your contact information, if you want follow-up

## Scope

This policy applies to:

- The Craft Agents desktop application
- `apps/*` and `packages/*` in this repository
- Messaging, terminal, review panel, source, and packaging logic added or modified in this branch

## Out of Scope

- Vulnerabilities in third-party dependencies should be reported to their maintainers first.
- Social engineering attacks.
- Denial-of-service attacks against public services.
- Publicly known generic vulnerabilities without repository-specific impact.

## Best Practices

- Do not commit `.env` files, API keys, tokens, cookies, or private keys.
- Be careful with executable commands, terminals, scripts, and high-permission modes.
- Prefer the latest release when downloading the application.
- If you change packaging scripts or preload / IPC logic, review permission boundaries carefully.

## Supported Versions

| Version | Security Updates |
| --- | --- |
| Latest | Supported |
| Older versions | Best effort |
