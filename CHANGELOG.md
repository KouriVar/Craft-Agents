# 更新日志

## 2026-07-12 同步 upstream v0.11.1

- 同步 OpenAI GPT-5.6（Luna、Terra、Sol）连接支持
- 支持模型原生 Max thinking level
- Pi SDK 升级至 0.80.6，改进长上下文成本统计
- 修复 Electron renderer 的工具结果事件类型与输入框属性类型检查

## 2026-07-08 初始整理

基于 upstream v0.11.0 (`f4e172bf`) + 上游 Simplify session status navigation (`6eeb6d5f`)。

### 功能提交

- `feat(messaging)` 微信接入（ilink 协议适配器）
- `core` 微信接入的路由、类型、设置与应用壳集成
- `build` 打包脚本与配置
- `i18n` 多语言文案

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

## 2026-07-09 上游 issue 修复集合

基于 upstream v0.11.0 的 7 项 bug 修复，涉及 21 文件（+126 / -36）。详细记录见 [docs/CHANGELOG-2026-07-09.md](./docs/CHANGELOG-2026-07-09.md)。

### 快速修复

- **#837** macOS 聊天输入框首字母自动大写，干扰中文 IME → contentEditable 加 `autoCapitalize="off"` / `spellCheck={false}`
- **#868** Opus 4.8 与 4.7 共用 `model.opusDesc` 显示相同描述 → 拆分 `opus48Desc` / `opus47Desc`，同步 7 语言
- **#822** 编辑连接时遮罩 API Key 被当真实凭证回传 → `initialApiKeyRef` 记录初值，未改动则提交空串跳过更新

### 中等修复

- **#891** 生产环境 `mainLog` 的 file/console transport 被禁，auto-update 诊断日志全丢 → `auto-update.ts` 内 21 处 `mainLog` 调用替换为 `autoUpdateLog`（17 info + 3 warn + 1 error）
- **#876** Agent 输出的 `file:///...` 链接被 URL 安全分类器拦截 → `handleOpenUrl` 拦截 file:// 解析本地路径（含 Windows 驱动器号），路由到应用内预览
- **#789** `Dirent.isDirectory()` 对符号链接返回 false，`ln -s` 的 skill 目录被忽略 → 增加 `isSymbolicLink()` 判断 + `statSync` 跟随
- **#933** Write 工具覆写已有文件时 diff 只显示全量新增 → 全链路透传 `originalContent`（pi-agent-server → 事件适配器 → Message → ActivityItem → file-changes），使 ShikiDiffViewer 渲染完整 before/after

### 统计

- 修改文件：21
- 新增行数：126
- 删除行数：36
- 涉及上游 issue：7（#837, #868, #822, #891, #876, #789, #933）
