# 本地版发布与跨平台维护清单

本项目使用 GitHub Release 作为个人分发渠道，不承诺 Apple 公证、Developer ID、Windows Authenticode 或原生 Windows ARM64 包。每次发布记录应用版本、tag、提交、平台、步骤、预期、实际和日志/诊断包位置。

## 更新资产与迁移规则

- electron-builder 必须保持 `generic` provider，feed 为 `https://github.com/KouriVar/Craft-Agents/releases/latest/download`。
- Release tag 可使用 `vX.Y.Z-local`；更新判断只使用 YAML 顶层 `version`，其值必须是递增的标准 SemVer。
- Release 必须是非 draft、非 prerelease，并在仓库 Release 页面标记为 Latest。
- Windows 上传 `Craft-Agents-x64.exe`、`Craft-Agents-x64.exe.blockmap`、`latest.yml`。
- macOS arm64 上传 `Craft-Agents-arm64.dmg`、DMG blockmap、用于 updater 元数据的 ZIP、ZIP blockmap 和 `latest-mac.yml`。无正式签名时应用只引导用户手动下载 DMG。
- Linux 上传 `Craft-Agents-x64.AppImage`、`Craft-Agents-x64.AppImage.blockmap`、`latest-linux.yml`。
- 发布前从 `releases/latest/download` 请求三个 YAML，再逐一请求 YAML `files[].url` 和相应 blockmap；任何 404、重定向到错误 tag 或 hash/size 不一致都阻止发布。
- 不用相同版本覆盖安装包测试升级。0.11.6 用户手动安装 0.11.7；从 0.11.8 起用递增版本验证 Windows/Linux 自动升级。

## macOS arm64

- 冷启动。
- 标签创建、恢复、切换、关闭、最后标签替换和崩溃恢复。
- 中英文输入与组合态回车。
- 外接显示器拔插后的窗口恢复。
- OAuth、普通新窗口链接与 Option 点击独立窗口。
- “关于”页和更新通知的“打开 GitHub Release”手动更新入口。

## Windows x64

- 中文/英文输入法与组合态回车。
- 100%、125%、150%、200% 缩放。
- 系统代理和 PAC；切换后无需重启即可使用新路由。
- 快速重复启动只保留一个实例并正确聚焦。
- 正常退出后无 Electron、Pi、MCP 或消息子进程残留。
- 从较低版本自动下载、退出安装并重新启动到较高版本；失败通知可打开 GitHub Release。

## Windows ARM 虚拟机

- 只验证 Windows x64 安装包经兼容层运行。
- 执行启动、输入、缩放、窗口恢复和退出残留冒烟。
- 发布说明不得声称提供原生 ARM64 Windows 安装包。

## Linux x64

- AppImage 具备执行权限并能冷启动。
- 窗口、菜单和输入法可用。
- 从真实 AppImage 启动，确认 `APPIMAGE` 指向当前可访问文件，再验证自动替换和重启。
- 清除 `APPIMAGE` 或模拟替换失败，确认应用停止自动安装并提供 GitHub Release 手动下载恢复入口。

## 自动化门槛

- 与修改对应的 Bun 单元/集成测试通过。
- `bun run typecheck:electron` 和需要时的 `bun run typecheck:all` 通过。
- `bun run check-version`、i18n parity/sort/coverage、IPC 与工具命名检查通过。
- `bun run electron:build` 通过；只有涉及打包或准备发布时才要求生成三平台安装包。
- 文档工具 smoke 最多运行 10 分钟；超时不得记为通过，应记录卡住的用例、uv/Python 缓存和最后输出。
- 发布前复查 `git diff` 和工作区状态，不覆盖无关用户修改。只有用户明确确认后才能创建或更新 GitHub Release。
