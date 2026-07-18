# Craft Agents 视觉 token 与层级协议

本规范以现有 CA 视觉方向为基础，目标是消除相近但不一致的硬编码值，而不是重新设计产品。共享 UI 与 Electron Renderer 的跨组件层级以 `packages/ui/src/styles/z-index.css` 为唯一来源，控件几何与窗口安全边距以 `packages/ui/src/styles/control-tokens.css` 为唯一来源。

## 控件几何

| Token / utility | 值 | 适用范围 |
|---|---:|---|
| `control-height-compact` | 28px | 紧凑工具栏、桌面小图标按钮 |
| `control-height-sm` | 32px | 小型搜索框与次要控件 |
| `control-height-md` | 36px | 默认 Button、Input、Select 与图标按钮 |
| `control-height-lg` | 40px | 大型主要操作 |
| `control-height-touch` | 44px | 窄窗口/触控环境的最小命中区域 |
| `radius-menu-item` / `rounded-menu-item` | 4px | 菜单内部选项 |
| `radius-control` / `rounded-control` | 6px | Button、Input、Select、Textarea |
| `radius-surface` / `rounded-surface` | 8px | Dropdown、Popover、Tooltip |
| `radius-card` / `rounded-card` | 12px | 设置卡片等分组表面 |
| `radius-modal` / `rounded-modal` | 16px | 大型模态表面；仅在原设计为 16px 时使用 |

高度可通过 `h-control-sm/md/lg` 或 `size-control-md` 使用。13px/20px 的菜单与紧凑控件文字使用 `text-control`。这些值为现有 4/6/8/12/16px 和 28/32/36/40/44px 视觉节奏命名，不授权改变既有组件尺寸。

## 响应式与动效

- 浮层在窄容器内使用 `--ca-floating-safe-inset`（12px）；窗口级 Dialog 使用 `--ca-window-safe-inset`（16px），不能贴住或越过窗口边缘。
- 设置项在窄 panel 中垂直排列时使用 `--ca-layout-gap-stacked`（10px），内容区域自行滚动，交互控件必须允许 `min-width: 0` 和文本截断。
- 触控/窄窗口命中区域不得小于 `--ca-control-height-touch`。视觉图标可以保持原尺寸，命中框负责扩大。
- 动效时长使用 `--ca-motion-exit/fast/standard/deliberate`（75/100/150/200ms）；尊重现有动画方向，不增加持续轮询或用动画掩盖原生 View 恢复问题。

## 层级表

| Token | 值 | 适用范围 |
|---|---:|---|
| `z-base` / `z-local` / `z-sticky` | 0 / 10 / 20 | 单个组件内部内容、按钮、粘性标题 |
| `z-titlebar` / `z-panel` | 40 / 50 | 窗口拖拽区和应用面板 |
| `z-dropdown-backdrop` / `z-dropdown` | 90 / 100 | 菜单外点遮罩、Dropdown、Popover、Select、Context Menu |
| `z-tooltip` | 150 | 非阻塞 Tooltip；Tooltip 不暂停原生网页 |
| `z-modal-backdrop` / `z-modal` | 190 / 200 | Dialog、Drawer 及其遮罩 |
| `z-notification` | 250 | 应用内通知和 Toast |
| `z-overlay` / `z-fullscreen` | 300 / 350 | 应用级覆盖层与全屏预览 |
| `z-floating-backdrop` / `z-floating-menu` | 390 / 400 | 需要越过模态层的浮动选择器和拖拽层 |
| `z-island-*` | 390–410 | Annotation Island 及其内部 Popover |
| `z-splash` | 600 | 启动、认证和工作区创建阻塞界面 |

## 使用规则

- Portaled、`fixed` 或跨组件表面必须使用上表的语义 utility；禁止新增 `z-[90]`、`z-[999]` 等任意高值。
- 单组件内部可以使用 `z-local`、`z-sticky`，或小于 40 的局部数值。局部值不能用于和菜单、通知、模态层竞争。
- Dropdown/Popover/Select/Context Menu 使用 `z-dropdown`；只有需要捕获菜单外点击的透明层使用 `z-dropdown-backdrop`。
- Dialog/Drawer 的遮罩必须使用 `z-modal-backdrop`，内容使用 `z-modal`。通知高于普通模态但低于应用级覆盖层。
- Tooltip 是提示信息，不取得原生网页暂停所有权。会遮挡交互内容的菜单、Popover、Dialog 等必须由 `browserNativeViewPauseReasonsAtom` 协调原生视图暂停与恢复。
- Electron `WebContentsView` 不参加 CSS stacking context。任何 React 层需要覆盖原生网页时，必须使用原生视图暂停协议或事件驱动的 bounds 避让；提高 z-index 无效。
- 新增全局层级时先更新共享 token 文件、本表和回归测试。不要分别修改 Electron 与共享 UI 样式入口。

## 示例

```tsx
<div className="fixed inset-0 z-dropdown-backdrop" />
<div className="fixed z-dropdown">…</div>

<div className="fixed inset-0 z-modal-backdrop" />
<section className="fixed z-modal">…</section>

<button className="h-control-md rounded-control">…</button>
<div className="z-dropdown rounded-surface">…</div>
```

层级只解决 React DOM 内部绘制顺序。原生网页的暂停原因、恢复时机和通知 bounds 仍由 Renderer 与主进程的协调协议负责。
