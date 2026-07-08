# 更新日志

## 2026-07-08 初始整理

基于 upstream v0.11.0 (`f4e172bf`) + 上游 Simplify session status navigation (`6eeb6d5f`)。

### 功能提交

- `feat(messaging)` 微信接入（ilink 协议适配器）
- `feat(memory)` agent 记忆 + 腾讯DB网关（bm25 走 Git LFS）
- `core` 核心集成（路由/类型/设置/壳 接入 memory/wechat）
- `build` 打包脚本与配置
- `i18n` 多语言文案

### 大文件处理

`bm25_zh_default.json`（81MB）转 Git LFS，仓库不再膨胀。

### 仓库形态

从 fork 改为独立仓库（GitHub fork 不能上传新 LFS 对象，报 `can not upload new objects to public fork`）。

### 同步上游的方法

```bash
git fetch upstream
git merge upstream/main   # 在 my-changes 上合并
# 解冲突 → 测试 → 打包
bun run electron:dist:dev:mac
```

不用 GitHub 网页的 Sync fork，本地 git 更可控。

## 2026-07-09 优化版

### 修复

- **删多面板/双栏窗口**：聊天区只剩单主面板，不再出现第二个会话窗口（之前为浏览器模块加的"新面板"入口，没收干净）
- **修打包后启动崩溃**：打包缺 `@anthropic-ai/claude-agent-sdk`，根因是打包命令绕过了会复制 SDK 的 `build-dmg.sh`。mac 打包命令改走 `build-dmg.sh`，并修了 arm64/x64 混打
- **修 dock 图标深色模式变浅**（十几个版本的老 bug）：`notifications.ts` 启动时调 `updateBadgeCount(0)` → `dock.setIcon(originalIcon)` 用固定图片覆盖系统图标，深色模式不跟随。改为 count=0 时不覆盖，让 macOS 自己管理图标
- **Win 打包补 SDK**：Win 打包同样缺 SDK（`electron:dist:dev:win` 也不走 build-dmg.sh），手动复制 SDK core + npm 拉 win32-x64 binary + alias

### 打包备注

- mac：`bun run electron:dist:dev:mac`（已走 build-dmg.sh，自动复制 SDK）
- win：需先复制 SDK（core + win32-x64 binary alias 到 claude-agent-sdk-binary），再 `bun run electron:dist:dev:win`。建议后续写 `build-win.sh` 一劳永逸
- mac 交叉打包 win 需要 Rosetta 2（`softwareupdate --install-rosetta --agree-to-license`），否则 wine64 跑不了

### release

`v0.11.0-local` 更新：mac `Craft-Agents-arm64.dmg` + win `Craft-Agents-x64.exe`，均含上述修复。
