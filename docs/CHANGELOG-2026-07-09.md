# 更新日志 — 2026-07-09

基于上游 `craft-ai-agents/craft-agents-oss` v0.11.0 的修复集合。

## 快速修复

### #837 中文输入法自动大写干扰修复

**问题：** macOS 上聊天输入框会自动将首字母大写，干扰中文 IME 输入。

**修复：** 在 rich-text-input.tsx 的 contentEditable div 上添加 `autoCapitalize="off"`、`autoComplete="off"` 和 `spellCheck={false}`，彻底禁用浏览器层的自动大写和拼写检查。

影响文件：
- `apps/electron/src/renderer/components/ui/rich-text-input.tsx`

### #868 Opus 4.8 模型描述与 4.7 重复

**问题：** Opus 4.8 和 Opus 4.7 共享同一个 i18n key（`model.opusDesc`），导致两者显示完全相同的描述文案。

**修复：** 为 Opus 4.8 分配独立的 i18n key `model.opus48Desc`，描述为"最强 Claude，擅长复杂推理与编程"；为 Opus 4.7 分配 `model.opus47Desc`，描述为"上一代 Opus"。同步更新全部 7 种语言的 locale 文件。

影响文件：
- `packages/shared/src/config/models.ts`
- `packages/shared/src/i18n/locales/{en,zh-Hans,ja,de,es,pl,hu}.json`

### #822 编辑连接时遮罩 API Key 被回传后端

**问题：** 用户编辑 LLM 连接时，前端先通过 `GET_API_KEY` 获取遮罩值（如 `sk-ant-••••••••xyz`）并预填到表单。如果用户没有修改 key 直接保存，遮罩值会作为真实 key 提交，覆盖原始凭证。

**修复：** 在 ApiKeyInput.tsx 中记录初始遮罩值（`initialApiKeyRef`），提交时对比当前值与初始值——若未修改则发送空字符串，后端收到空字符串时跳过凭证更新。

影响文件：
- `apps/electron/src/renderer/components/apisetup/ApiKeyInput.tsx`

## 中等修复

### #891 Auto-update 日志在生产环境丢失

**问题：** 打包后的 Electron 应用中，`mainLog` 的 file 和 console transport 均被设为 false，导致自动更新的所有诊断日志（检查更新、缓存扫描、下载状态等）在生产环境完全丢失。更新下载成功但从未安装时，没有任何日志可供排查。

**修复：** 将 auto-update.ts 中所有 `mainLog.info/warn/error` 调用替换为 `autoUpdateLog`（写入 `~/.craft-agent/logs/auto-update.log`，带 2MB 轮转，不受 debug 开关影响）。移除未使用的 `mainLog` import。

影响文件：
- `apps/electron/src/main/auto-update.ts`（17 处 info + 3 处 warn + 1 处 error 替换）

> 注：`autoUpdateLog` 的定义位于 `apps/electron/src/main/logger.ts`，为既有设施（更早提交引入），本次修复仅替换 auto-update.ts 内的调用方，未改动 logger.ts。

### #876 本地文件链接报 "URL is malformed"

**问题：** Agent 输出的 `file:///path/to/file` 链接在渲染器中被 URL 安全分类器拦截（`file:` scheme 被列入 `DANGEROUS_SCHEMES`），无法打开文件预览。

**修复：** 在 useLinkInterceptor.ts 的 `handleOpenUrl` 中拦截 `file://` 开头的 URL，解析出本地路径（处理 URL 编码和 Windows 驱动器号），路由到 `handleOpenFile` 走应用内预览流程。解析失败时 fallback 到 `openUrl`。

影响文件：
- `apps/electron/src/renderer/hooks/useLinkInterceptor.ts`

### #789 Skill 目录不支持符号链接

**问题：** `loadSkillsFromDir()` 和 `listSkillSlugs()` 使用 `Dirent.isDirectory()` 过滤目录，但该方法对符号链接返回 false，导致通过 `ln -s` 创建的 skill 目录被静默忽略。

**修复：** 在两处过滤逻辑中增加 `entry.isSymbolicLink()` 判断，对符号链接使用 `statSync` 跟随链接并验证目标确实是目录（broken symlink 被安全跳过）。

影响文件：
- `packages/shared/src/skills/storage.ts`

### #933 Write 工具 diff 视图显示全量新增

**问题：** Write 工具覆写已有文件时，diff 视图将整个文件内容显示为新增行（绿色），不显示被删除的旧内容，用户无法看清实际改了什么。

**修复（全链路）：**

1. **pi-agent-server**：Write 工具执行前，读取文件当前内容存入 `inputObj.originalContent`。SDK 工具忽略未知字段，原内容随 toolInput 流经事件管线。
2. **AgentEvent 类型**：tool_result 事件新增可选字段 `resultDetails`。
3. **Pi 事件适配器**：`tool_execution_end` 处理时，从 SDK result 的 `details.originalContent` 提取并通过 `resultDetails` 传递。
4. **Message 类型**：Message 和 StoredMessage 均新增 `toolResultDetails` 字段。
5. **事件处理器**：tool_result handler 将 `event.resultDetails` 存入 message。
6. **ActivityItem**：新增 `resultDetails` 字段，`messageToActivity` 映射传递。
7. **file-changes.ts**：Write 工具的 `original` 字段从 `resultDetails.originalContent` 取值（而非硬编码 `''`），使 ShikiDiffViewer 能渲染完整的 before/after diff。

影响文件：
- `packages/pi-agent-server/src/index.ts`
- `packages/core/src/types/message.ts`
- `packages/shared/src/agent/backend/base-event-adapter.ts`
- `packages/shared/src/agent/backend/pi/event-adapter.ts`
- `apps/electron/src/renderer/event-processor/handlers/tool.ts`
- `packages/ui/src/components/chat/TurnCard.tsx`
- `packages/ui/src/components/chat/turn-utils.ts`
- `apps/electron/src/renderer/lib/file-changes.ts`

## 统计

- 修改文件：21
- 新增行数：126
- 删除行数：36
- 涉及上游 issue：7（#837, #868, #822, #891, #876, #789, #933）
