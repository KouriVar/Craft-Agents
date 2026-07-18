# 0.11.6 稳定性、跨平台回归与视觉规范治理

本文档记录 v0.11.5-local-fix 之后的架构审计、风险优先级和可复用回归矩阵。未经实机验收，不据此直接发布 Release。

## 已确认基线

- Git 基线：`my-changes` 分支，`v0.11.5-local-fix`（`8ed7217`）。审计开始时工作区无未提交改动。
- 已完成且不重复：Renderer 自绘新标签输入框；当前原生标签重复路由防护；同一工作区并发空白标签合并；普通 `window.open`/`target=_blank` 转标签；Option/Alt 独立弹窗；系统代理/PAC 继承及切换后关闭连接池；通知顶部空间避让；Renderer 浮层打开时暂停原生视图；Windows 思源黑体。
- 标签实体、网页状态、崩溃计数、弹窗和原生 View 由主进程 `BrowserPaneManager` 持有；标签顺序、当前路由、恢复编排和浮层暂停状态仍由 Renderer `AppShell` 协调。Browser Profile 是恢复快照的持久化来源，但运行时尚未收敛成单一状态机。
- `index.css` 已有颜色、字体、阴影和断点；共享层级与控件几何入口现分别为 `z-index.css`、`control-tokens.css`，`panel-constants.ts` 保留原生面板 bounds、最小宽度和拖拽缝常量。后续迁移这些入口，不再建立平行 token 体系。

## 问题与优先级

### P0

- 暂无仅凭静态证据可定性的 P0。Windows x64/ARM 虚拟机 IME、系统缩放、代理和退出残留仍必须实机验证；在验证前不能降级为“已解决”。

### P1

- **跨工作区异步创建竞态（本批修复）**：空白标签去重 Promise 原先是整个 `AppShell` 共用的单值引用，且创建完成后无工作区代际检查。A 工作区创建未完成时切到 B，B 可能复用 A 的 Promise；A 的 `list()` 结果也可能覆盖 B 的标签列表并导航到 A 的标签。
- **运行时双重协调（部分收口）**：主进程实例表仍是标签实体真相，Renderer 仍维护投影与路由；本阶段已为工作区 scope、关闭回退、最后标签替换和关闭期间迟到事件加入纯状态转换/guard。恢复 revision 和完整 reducer 仍待后续收口。
- **原生视图暂停协议（本阶段完成基础迁移）**：由单一布尔值改成语义 reason 集合，Dialog、Drawer、菜单、Popover、Select、inline menu、island dialog 与最新动态独立 acquire/release；通知仍使用局部 bounds 避让，Tooltip 明确不暂停。
- **崩溃恢复（本阶段补齐用户操作）**：主进程自动 reload 两次后输出结构化 `crashed`、reason 和 attempts，Renderer 隐藏失效原生表面并提供重新加载。诊断包与“重开标签”仍属于诊断中心阶段。
- **退出清理边界（本阶段修复）**：清理协调器不再依赖 `sessionManager`；所有独立资源按阶段执行并记录耗时/错误，单阶段失败仍继续至服务锁释放。Windows 后台残留仍需安装包实机确认。
- **窗口恢复与重复启动（本阶段修复）**：持久化窗口状态先过滤非有限坐标、空 workspace 和非法尺寸；恢复时按当前显示器 work area 拟合，处理拔掉外接屏、VM 分辨率变化与超大旧窗口。首实例尚未完成初始化时收到的第二实例激活/deeplink 会排队，准备完成后单次 restore/show/focus，不使用定时抢焦点。
- **构建类型基线（本阶段修复）**：`session-tools-core`、`session-mcp-server` 与 Pi server 原先继承从未存在的 `tsconfig.base.json`，令 CI typecheck 回退到错误 target。现统一继承实际根 `tsconfig.json`，并修正严格检查揭示的 runtime 空值、数组捕获组和 Content-Type 分段边界；Main 构建不再输出缺失基准配置警告。

### P2

- **视觉硬编码逐步收口**：跨组件层级已迁移到共享 `z-index.css`；控件高度、圆角、紧凑字号和窗口安全边距已建立 `control-tokens.css` 单一来源，并迁移 Button/Input/Select/Textarea、菜单、Tooltip 和设置卡片等高复用入口。当前不做全仓机械替换，侧栏、标签、空状态和滚动条仍待按功能批次迁移。
- **集合页轮询（本批修复）**：历史/收藏每 3 秒、下载每 1 秒刷新已替换为主进程 `profile-changed(kind)` 广播；事件不携带 URL、文件名或路径，下载进度按 250ms 合并。Renderer 用请求 revision 拒绝切换集合后迟到的旧结果。
- **资源基线已建立，优化暂缓**：启动过程现记录 main module、Electron ready、WindowManager、初始窗口和应用初始化里程碑；诊断包聚合 Electron 进程类型/工作集、主进程 RSS/Heap、活跃 Node 资源类型和关键 app listener 数量。当前没有足够跨平台样本证明需要闲置标签冻结，因此不在稳定性版本中盲目启用。
- **诊断深度待扩展**：首版诊断导出已覆盖应用/平台/架构/Electron/Chromium、代理模式、浏览器崩溃计数、插件/MCP 与消息服务聚合状态，并默认排除原始日志、URL、路径和错误正文。后续若增加最近错误，必须先建立结构化错误码，不能直接打包现有日志。

## 分阶段计划

1. **生命周期护栏**：为 create/restore/select/close/remove/crash transitions 建纯函数或协调器；所有异步结果携带 workspace scope/revision；补竞态、关闭回退、恢复 ID 冲突和崩溃测试。
2. **原生视图协调层**：用带 reason/owner 的 acquire/release 协议替换全局布尔值，统一 Dialog、菜单、Popover、Tooltip（通常不暂停）、通知避让、最新动态、账号菜单、专注顶部触发区和扩展弹层。
3. **跨平台窗口与退出**：为 Windows/Linux/macOS 的标题栏、菜单、专注模式、重复启动和退出失败路径补测试；对 Pi/MCP/消息/浏览器子进程记录退出阶段与超时，不用高频 focus/setBounds/setVisible 循环。
4. **诊断中心**：先定义脱敏 schema 和 redaction 测试，再实现一键导出。URL 默认只保留 origin，Header、Cookie、Token、Key、密码和正文不进入诊断包。
5. **视觉治理**：扩充现有 `index.css`/`panel-constants.ts`；先迁移浏览器、菜单和通知的跨组件层级与基础控件，再逐步覆盖侧栏、标签、卡片、空状态和滚动条。
6. **资源优化**：建立指标后评估后台标签降载/冻结；验证 Cookie、登录态、扩展和下载不受影响后再启用。

## 当前实现进度

- 生命周期护栏：完成 workspace scope、并发空白标签、关闭回退、最后标签替换、迟到状态事件和关闭失败权威列表回滚。
- 原生视图协调：完成首版 reason/owner 集合与 DOM 语义检测；后续新增浮层必须登记 reason，不允许直接写布尔暂停。
- 崩溃恢复：完成主进程结构化状态和 Renderer 重新加载入口。
- 退出清理：完成无 SessionManager、单阶段失败和固定顺序故障注入测试；实机残留进程检查待回归矩阵执行。
- 跨平台窗口：完成保存状态校验、负坐标多显示器保留、移除显示器回主屏、低分辨率 VM 缩放，以及启动早期第二实例/deeplink 排队；Windows/Linux 重复启动和显示器切换仍需安装包实机确认。
- 诊断中心：完成 v1 脱敏 schema、递归 redactor、聚合收集、IPC 保存链路和“应用设置 → 诊断”导出入口；新增启动里程碑、Electron 进程类型/工作集、主进程内存、活跃资源类和关键 listener 计数。文件以用户选择的位置保存，Unix 权限收紧为 `0600`，不包含原始日志、URL、工作区路径、插件名称、代理地址、错误原文、PID 或命令行。
- 视觉层级：将 Electron 与共享 UI 原先重复的 z-index 注册表收敛为 `packages/ui/src/styles/z-index.css` 单一来源，新增 dropdown/modal backdrop 与 notification 语义层；迁移浏览器窗口菜单、SimpleDropdown、PreviewOverlay、EditPopover、Dialog、Drawer 和崩溃恢复表面，并在 `docs/VISUAL-TOKENS.md` 记录 CSS 与原生 WebContentsView 的职责边界。
- 控件几何：新增共享 `control-tokens.css`，命名既有 28/32/36/40/44px 高度和 4/6/8/12/16px 圆角，不改变 CA 视觉尺寸；高复用基础控件、菜单和设置表面已迁移。Dialog、窄容器浮层、设置行与触控目标接入语义安全边距，避免小窗口越界。
- 浏览器集合资源：主进程在收藏/文件夹、历史和下载持久化变化时发出仅含集合 kind 的事件；同步批量收藏变更自动合并，下载进度节流为 250ms，`destroyAll` 清理待发 timer。Renderer 订阅对应 kind 并清理 listener，移除固定轮询。

## 固定回归矩阵

每项记录平台、应用构建、步骤、预期、实际、日志位置和通过/失败。自动化项先跑；标为“实机”的项目由安装包验收。

| 场景 | 自动化/检查 | macOS | Windows x64 | Windows ARM VM | Linux |
|---|---|---|---|---|---|
| 新建/恢复/切换/关闭/最后一标签重开 | 单元 + 集成 | 实机 | 实机 | 实机 | 实机 |
| 快速连点新标签、恢复与手动新建并发 | 单元 + 集成 | 实机 | 实机 | 实机 | 实机 |
| 工作区切换时标签创建/导航完成 | 单元 + 集成 | 冒烟 | 冒烟 | 冒烟 | 冒烟 |
| 中文/英文输入、候选框位置、组合态回车 | Renderer 回归 | 实机 | 实机 | 实机 | 输入法实机 |
| 窗口缩放、系统 100/125/150/200% 缩放 | bounds 单测 | 实机 | 实机 | 实机 | 实机 |
| 拔掉外接屏/VM 改分辨率后窗口回到可见 work area | 几何单测 | 实机 | 实机 | 重点实机 | 实机 |
| 窄窗口 Dialog、Dropdown、Select 不越界且内部可滚动 | token 静态检查 | 实机 | 实机 | 实机 | 实机 |
| 明暗主题、专注模式入口/退出 | 组件检查 | 实机 | 实机 | 实机 | 实机 |
| 菜单、通知、最新动态、账号、扩展弹层层级 | 协议集成 | 实机 | 实机 | 实机 | 实机 |
| 普通链接、`target=_blank`、`window.open` | 主进程单测 | 实机 | 实机 | 实机 | 实机 |
| OAuth 与 Option/Alt 独立窗口 | 主进程单测 | Option 实机 | Alt 实机 | Alt 实机 | Alt 实机 |
| 历史、收藏、下载、权限、密码、固定扩展切换保持 | store 单测 | 实机 | 实机 | 实机 | 实机 |
| 页面崩溃、应用异常退出与会话恢复 | 故障注入 | 实机 | 实机 | 实机 | 实机 |
| 系统代理/PAC、CA 代理切换、无网/慢网 | 代理单测 | 实机 | 实机 | 实机 | 实机 |
| 退出重开、重复启动、后台残留进程 | 退出集成 | 实机 | 重点实机 | 重点实机 | 实机 |
| 空闲 10 分钟与 10/20 标签下内存、timeout/pipe/listener 增长 | 诊断包前后对比 | 实机 | 实机 | 实机 | 实机 |

## 最终安装包验收顺序

1. 冷启动后导出一次诊断包，记录 `startup.milestonesMs`、`resources.electronProcesses`、主进程 RSS/Heap 与活跃资源计数。
2. 连续完成新建/恢复/切换/关闭标签、历史/收藏/下载、菜单/通知/扩展浮层和中英文输入，再导出第二份诊断包；确认 listener 数量稳定，timeout/pipe 与内存变化能由当前活动解释。
3. 最小化后重复启动应用；确认只恢复并聚焦一个实例。切换显示器或 VM 分辨率后退出重开，确认窗口位于可见 work area。
4. 切换系统代理/PAC、无网/慢网、100/125/150/200% 缩放、明暗主题和专注模式；Windows x64 与 ARM VM 均执行，ARM VM 只验证 x64 安装包兼容层，不声明原生 ARM64 包支持。
5. 正常退出后检查 Electron、Pi、MCP、消息和浏览器子进程；若残留，保留退出前后诊断包和进程列表，不在包含密钥/路径的日志上直接分享隐私内容。

## 每批验证门槛

- 与修改对应的 Bun 单元/集成测试通过。
- Electron TypeScript `tsc --noEmit` 通过。
- main、preload、renderer 和 resources 正式构建通过；涉及打包脚本时才追加相应平台打包验证。
- 变更后重新检查 `git diff`，确认不覆盖无关用户改动。
- Release 仅在用户完成安装包实机矩阵并明确确认后进行。

## 本阶段自动化结果

- 浏览器生命周期、崩溃、Profile、代理、原生视图暂停、退出清理和 IPC 专项：65 项通过，0 项失败。
- 诊断脱敏与聚合新增 3 项测试；IPC 精确清单及 Core/GUI 注册分层测试通过。
- 层级 token 单一来源与任意高值回归新增 2 项静态测试；连同原生视图暂停协议共 9 项通过。Electron 类型检查、定向 ESLint（0 error）和 Renderer 正式构建通过。
- 控件几何、共享样式入口、高复用基础组件和窄窗口安全边界新增 3 项静态测试；语义 Tailwind utility 已在 Renderer 正式产物中确认生成。
- 窗口状态校验、显示器 work area 拟合和单实例激活新增 8 项测试；覆盖负坐标副屏、移除显示器、低分辨率 VM、大小写 deeplink、最小化/隐藏窗口与已销毁窗口。
- 资源与启动诊断新增 3 项测试，覆盖里程碑单次记录、内存/资源聚合、异常值归零及 PID/命令行缺失；诊断与窗口/退出联合专项 17 项通过。
- 浏览器 Profile 事件合并、无隐私内容广播、IPC 精确清单与完整 BrowserPaneManager isolated suite 通过；事件批次专项 11 项通过。
- Electron TypeScript、i18n parity/sort 检查通过。
- main、preload、renderer、resources 正式构建和 278 项资源/产物校验通过。
- 最终浏览器/窗口/退出/诊断/代理/IPC/视觉专项回归 121 项通过，0 项失败；完整 `electron:build` 发布构建链通过。
- Pi agent server 与 session tools 全量 179 项测试通过；仓库 `typecheck:all` 通过，修复配置后 subprocess/Main 再构建通过且不再出现缺失 `tsconfig.base.json` 警告。
- 定向 ESLint 0 error；全仓仍保留本阶段开始前已有的非标准阴影和直接 `openFile` 等 lint 基线错误，未混入本批修复。

## 已知验证基础设施问题

- `test:doc-tools` 在 PDF smoke 准备阶段调用 bundled `uv run --python 3.12 … img_tool.py resize` 后超过 5 分钟无输出、无子进程且接近零 CPU；本次按外部 Python 环境准备阻塞中止，不能记为通过或应用回归失败。
- `lint:i18n:coverage`、`lint:ipc-sends`、`lint:tool-name-checks` 分别指向仓库中不存在且无 Git 历史的 `scripts/check-i18n-coverage.ts`、`check-raw-sends.sh`、`check-task-tool-checks.sh`。保留为 CI 基线缺口，不通过删除命令或伪造规则制造绿灯。
