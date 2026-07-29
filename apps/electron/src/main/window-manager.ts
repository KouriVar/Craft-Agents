import { BrowserWindow, shell, nativeTheme, Menu, app } from 'electron'
import { windowLog } from './logger'
import { join, resolve, sep } from 'path'
import { existsSync } from 'fs'
import { release } from 'os'
import { fileURLToPath } from 'url'
import { getDoubleCommandScreenshotEnabled, getWorkspaceByNameOrId } from '@craft-agent/shared/config'
import { classifyExternalUrl, formatBlockedUrlError } from '@craft-agent/shared/utils/url-safety'
import { RPC_CHANNELS, type WindowCloseRequestSource } from '../shared/types'
import type { SavedWindow } from './window-state'
import { recordStartupMilestone } from './resource-diagnostics'

// Vite dev server URL for hot reload
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

type MacVibrancyMaterial = 'under-window' | 'sidebar'
type WindowsBackgroundMaterial = 'acrylic' | 'none'

interface MainWindowMaterialProfile {
  platform: NodeJS.Platform
  options: Electron.BrowserWindowConstructorOptions
  macVibrancy?: MacVibrancyMaterial
  windowsMaterial?: WindowsBackgroundMaterial
  windowsBuild?: number
  windowsAcrylicSupported?: boolean
  probe: boolean
}

function isMaterialProbeEnabled(): boolean {
  return !app.isPackaged && process.env.CA_MATERIAL_PROBE === '1'
}

function getWindowsBuildNumber(): number | undefined {
  if (process.platform !== 'win32') return undefined
  const build = Number.parseInt(release().split('.')[2] || '0', 10)
  return Number.isFinite(build) ? build : undefined
}

function getMaterialProbeMacVibrancy(): MacVibrancyMaterial {
  return process.env.CA_MATERIAL_PROBE_VIBRANCY === 'sidebar' ? 'sidebar' : 'under-window'
}

function getMainWindowMaterialProfile(isMac: boolean, isWindows: boolean): MainWindowMaterialProfile {
  const probe = isMaterialProbeEnabled()
  if (isMac) {
    const macVibrancy = probe ? getMaterialProbeMacVibrancy() : 'under-window'
    return {
      platform: process.platform,
      probe,
      macVibrancy,
      options: {
        titleBarStyle: 'hiddenInset',
        trafficLightPosition: { x: 18, y: 16 },
        transparent: true,
        backgroundColor: '#00000000',
        vibrancy: macVibrancy,
        visualEffectState: 'active',
        roundedCorners: true,
      },
    }
  }

  if (isWindows) {
    const windowsBuild = getWindowsBuildNumber()
    const windowsAcrylicSupported = process.env.CA_FORCE_WINDOWS_ACRYLIC === '1'
      || (typeof windowsBuild === 'number' && windowsBuild >= 17763)

    if (windowsAcrylicSupported) {
      return {
        platform: process.platform,
        probe,
        windowsBuild,
        windowsAcrylicSupported,
        windowsMaterial: 'acrylic',
        options: {
          frame: false,
          autoHideMenuBar: true,
          backgroundColor: '#f4f6f8',
          backgroundMaterial: 'acrylic',
          roundedCorners: true,
          thickFrame: true,
          hasShadow: true,
        },
      }
    }

    return {
      platform: process.platform,
      probe,
      windowsBuild,
      windowsAcrylicSupported,
      windowsMaterial: 'none',
      options: {
        frame: false,
        autoHideMenuBar: true,
        backgroundColor: '#f4f6f8',
        roundedCorners: true,
        thickFrame: true,
        hasShadow: true,
      },
    }
  }

  return {
    platform: process.platform,
    probe,
    options: {
      frame: true,
      autoHideMenuBar: true,
    },
  }
}

function reapplyNativeWindowMaterial(window: BrowserWindow, profile: MainWindowMaterialProfile): void {
  if (window.isDestroyed()) return
  if (profile.macVibrancy && process.platform === 'darwin') {
    window.setVibrancy(profile.macVibrancy)
    window.setWindowButtonVisibility(true)
    window.setWindowButtonPosition({ x: 18, y: 19 })
  }
  if (profile.windowsMaterial === 'acrylic' && process.platform === 'win32') {
    window.setBackgroundMaterial('acrylic')
  } else if (profile.windowsMaterial === 'none' && process.platform === 'win32') {
    window.setBackgroundMaterial('none')
  }
}

function getMaterialProbeUrl(profile: MainWindowMaterialProfile): string {
  const system = {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: process.platform,
    osRelease: release(),
    profile,
  }
  const safeJson = JSON.stringify(system, null, 2)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>CraftAgent Material Probe</title>
  <style>
    html, body, #root {
      width: 100%;
      height: 100%;
      margin: 0;
      background: transparent !important;
      overflow: hidden;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: #1f2328;
    }
    body {
      -webkit-app-region: drag;
    }
    .shell {
      position: fixed;
      inset: 0;
      border-radius: 18px;
      background: rgba(220, 232, 238, 0.18);
      box-shadow: inset 0 0 0 1px rgba(30, 40, 50, 0.08);
    }
    .card {
      position: absolute;
      left: 50%;
      top: 50%;
      width: min(640px, calc(100vw - 160px));
      min-height: 340px;
      transform: translate(-50%, -50%);
      border-radius: 16px;
      background: #f7f8fa;
      box-shadow: 0 18px 45px rgba(0, 0, 0, 0.18), inset 0 0 0 1px rgba(0,0,0,0.08);
      padding: 28px;
      box-sizing: border-box;
      -webkit-app-region: no-drag;
    }
    h1 {
      margin: 0 0 10px;
      font-size: 22px;
    }
    p {
      margin: 0 0 18px;
      color: #68707a;
      line-height: 1.45;
    }
    pre {
      margin: 0;
      max-height: 210px;
      overflow: auto;
      border-radius: 10px;
      background: #111827;
      color: #dbeafe;
      padding: 14px;
      font-size: 12px;
      line-height: 1.5;
      white-space: pre-wrap;
    }
  </style>
</head>
<body>
  <div id="root">
    <div class="shell"></div>
    <main class="card">
      <h1>CraftAgent Material Probe</h1>
      <p>The outer area is transparent plus a low-opacity tint. The center rectangle is intentionally opaque. Move this window over wallpaper or other apps: the outer area must show native blurred background, not CSS backdrop-filter.</p>
      <pre>${safeJson}</pre>
    </main>
  </div>
</body>
</html>`

  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`
}

interface ManagedWindow {
  window: BrowserWindow
  workspaceId: string
}

export interface CreateWindowOptions {
  /** The workspace to open (empty string for onboarding) */
  workspaceId: string
  /** Whether to open in focused mode (smaller window, no sidebars) */
  focused?: boolean
  /** Deep link URL to navigate to after window loads (without ?window= param) */
  initialDeepLink?: string
  /** Full URL to restore from saved state (preserves route/query params) */
  restoreUrl?: string
}

export class WindowManager {
  private windows: Map<number, ManagedWindow> = new Map()  // webContents.id → ManagedWindow
  private focusedModeWindows: Set<number> = new Set()  // webContents.id of windows in focused mode
  private pendingCloseTimeouts: Map<number, NodeJS.Timeout> = new Map()  // Fallback timeouts for window close
  private eventSink: ((channel: string, target: import('@craft-agent/shared/protocol').PushTarget, ...args: any[]) => void) | null = null
  private clientResolver: ((wcId: number) => string | undefined) | null = null
  private keyboardCloseIntents: Set<number> = new Set()  // webContents.id flagged by Cmd/Ctrl+W before close
  private keyboardCloseIntentTimeouts: Map<number, NodeJS.Timeout> = new Map()  // Auto-clear stale keyboard-close intents
  private isAppQuitting = false  // Skip layered close interception during app quit

  /**
   * Set the event sink and client resolver for pushing events via the RPC server
   * instead of webContents.send. Called after server creation.
   */
  setRpcEventSink(
    sink: (channel: string, target: import('@craft-agent/shared/protocol').PushTarget, ...args: any[]) => void,
    resolver: (wcId: number) => string | undefined
  ): void {
    this.eventSink = sink
    this.clientResolver = resolver
  }

  /** Return current RPC event sink, if transport has been initialized. */
  getRpcEventSink(): ((channel: string, target: import('@craft-agent/shared/protocol').PushTarget, ...args: any[]) => void) | null {
    return this.eventSink
  }

  /** Resolve a window's current clientId from transport handshake state. */
  getClientIdForWindow(webContentsId: number): string | undefined {
    return this.clientResolver?.(webContentsId)
  }

  /** Push an event to a specific window via the RPC event sink. Falls back to webContents.send. */
  private pushToWindow(window: BrowserWindow, channel: string, ...args: any[]): void {
    if (this.eventSink && this.clientResolver) {
      const clientId = this.clientResolver(window.webContents.id)
      if (clientId) {
        this.eventSink(channel, { to: 'client', clientId }, ...args)
        return
      }
    }
    // Fallback: direct webContents.send (used before WS handshake completes)
    if (!window.isDestroyed() && !window.webContents.isDestroyed() && window.webContents.mainFrame) {
      window.webContents.send(channel, ...args)
    }
  }

  private isRendererAppUrl(url: string): boolean {
    if (VITE_DEV_SERVER_URL) {
      try {
        const parsed = new URL(url)
        const devServer = new URL(VITE_DEV_SERVER_URL)
        if (parsed.origin === devServer.origin) return true
      } catch {
        // Fall through to file:// handling below.
      }
    }

    try {
      const parsed = new URL(url)
      if (parsed.protocol !== 'file:') return false

      const filePath = resolve(fileURLToPath(parsed))
      const rendererRoot = resolve(join(__dirname, 'renderer'))
      return filePath === join(rendererRoot, 'index.html') || filePath.startsWith(rendererRoot + sep)
    } catch {
      return false
    }
  }

  private openExternalFromRenderer(url: string, context: string, sourceWindow?: BrowserWindow): void {
    const classification = classifyExternalUrl(url)

    if (classification.kind === 'dangerous') {
      windowLog.warn(`[url-safety] Blocked ${context}: ${formatBlockedUrlError(classification)} url=${url}`)
      return
    }

    if (classification.kind === 'internal-deeplink') {
      if (!sourceWindow) {
        windowLog.warn(`[url-safety] Blocked ${context}: internal deep link has no target window url=${url}`)
        return
      }

      void import('./deep-link').then(async ({ handleDeepLink }) => {
        const result = await handleDeepLink(
          url,
          this,
          this.eventSink ?? undefined,
          this.clientResolver ?? undefined,
          this.clientResolver?.(sourceWindow.webContents.id),
        )
        if (!result.success) {
          windowLog.warn(`[url-safety] Blocked ${context}: unsupported internal deep link url=${url} error=${result.error ?? 'unknown'}`)
        }
      }).catch((error) => {
        windowLog.warn(`[url-safety] Failed to route internal deep link from ${context}: ${error instanceof Error ? error.message : String(error)}`)
      })
      return
    }

    void shell.openExternal(url).catch((error) => {
      windowLog.warn(`[url-safety] Failed to open external URL from ${context}: ${error instanceof Error ? error.message : String(error)}`)
    })
  }

  /**
   * Apply the window-title policy across all managed windows:
   *   1 window  → app name ("Craft Agents") on the lone window
   *   ≥2 windows → workspace name on each window, app-name fallback when the
   *                workspace can't be resolved (e.g. onboarding window).
   *
   * Called after createWindow() registers a new window and after the closed
   * handler removes one, so titles always reflect the current window count.
   * Renderer-driven page-title-updated events are suppressed in createWindow
   * so these setTitle() calls aren't clobbered by the static <title> tag.
   */
  private refreshWindowTitles(): void {
    const defaultTitle = app.getName()
    const showWorkspaceName = this.windows.size > 1
    for (const { window, workspaceId } of this.windows.values()) {
      if (window.isDestroyed()) continue
      let title = defaultTitle
      if (showWorkspaceName && workspaceId) {
        try {
          const ws = getWorkspaceByNameOrId(workspaceId)
          if (ws?.name) title = ws.name
        } catch (err) {
          windowLog.warn('refreshWindowTitles: workspace lookup failed', { workspaceId, err })
        }
      }
      window.setTitle(title)
    }
  }

  /**
   * Create a new window for a workspace
   * @param options - Window creation options
   */
  createWindow(options: CreateWindowOptions): BrowserWindow {
    const { workspaceId, focused = false, initialDeepLink, restoreUrl } = options

    // Load platform-specific app icon
    // In packaged app, resources are at dist/resources/ (same level as __dirname)
    // In dev, resources are at ../resources/ (sibling of dist/)
    const getIconPath = () => {
      const iconName = process.platform === 'darwin' ? 'icon.icns'
        : process.platform === 'win32' ? 'icon.ico'
        : 'icon.png'
      return [
        join(__dirname, 'resources', iconName),
        join(__dirname, '../resources', iconName),
      ].find(p => existsSync(p)) ?? join(__dirname, '../resources', iconName)
    }

    const iconPath = getIconPath()
    const iconExists = existsSync(iconPath)

    if (!iconExists) {
      windowLog.warn('App icon not found at:', iconPath)
    }

    // Use smaller window size for focused mode (single session view)
    const windowWidth = focused ? 900 : 1400
    const windowHeight = focused ? 700 : 900

    // Platform-specific window options
    const isMac = process.platform === 'darwin'
    const isWindows = process.platform === 'win32'
    const materialProfile = getMainWindowMaterialProfile(isMac, isWindows)

    const window = new BrowserWindow({
      width: windowWidth,
      height: windowHeight,
      minWidth: 800,
      minHeight: 600,
      show: false, // Don't show until ready-to-show event (faster perceived startup)
      title: '',
      icon: iconExists ? iconPath : undefined,
      ...materialProfile.options,
      webPreferences: {
        preload: join(__dirname, 'bootstrap-preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        webviewTag: true // Right sidebar browser embeds web contents in-app.
      }
    })

    // Show window when first paint is ready (faster perceived startup)
    window.once('ready-to-show', () => {
      recordStartupMilestone('first-window-ready-to-show')
      reapplyNativeWindowMaterial(window, materialProfile)
      window.show()
    })
    const scheduleMaterialReapply = () => {
      reapplyNativeWindowMaterial(window, materialProfile)
      setTimeout(() => reapplyNativeWindowMaterial(window, materialProfile), 120)
    }
    window.on('show', scheduleMaterialReapply)
    window.on('restore', scheduleMaterialReapply)
    window.on('maximize', scheduleMaterialReapply)
    window.on('unmaximize', scheduleMaterialReapply)
    const pushMaximizedState = () => {
      this.pushToWindow(window, RPC_CHANNELS.window.MAXIMIZED_STATE, window.isMaximized())
    }
    window.on('maximize', pushMaximizedState)
    window.on('unmaximize', pushMaximizedState)
    window.on('restore', pushMaximizedState)

    // Open external links in default browser, but never hand known-dangerous
    // schemes directly to shell.openExternal. Markdown normal-clicks go through
    // OPEN_URL; middle-clicks/window.open/top-navigation land here.
    window.webContents.setWindowOpenHandler((details) => {
      this.openExternalFromRenderer(details.url, 'window-open', window)
      return { action: 'deny' }
    })

    // Handle external navigation attempts from renderer WebContents
    window.webContents.on('will-navigate', (event, url) => {
      // Allow only the actual app shell (file:// in prod, Vite dev server in dev).
      // Any other navigation is treated as an external URL and goes through the
      // same URL-safety classifier used by OPEN_URL.
      if (this.isRendererAppUrl(url)) return

      event.preventDefault()
      this.openExternalFromRenderer(url, 'will-navigate', window)
    })

    // Enable right-click context menu in development
    if (!app.isPackaged) {
      window.webContents.on('context-menu', (_event, params) => {
        Menu.buildFromTemplate([
          { label: 'Inspect Element', click: () => window.webContents.inspectElement(params.x, params.y) },
          { type: 'separator' },
          { label: 'Cut', role: 'cut', enabled: params.editFlags.canCut },
          { label: 'Copy', role: 'copy', enabled: params.editFlags.canCopy },
          { label: 'Paste', role: 'paste', enabled: params.editFlags.canPaste },
        ]).popup()
      })
    }

    // The renderer's index.html ships with `<title>Craft Agents</title>`, so
    // without this Electron auto-syncs every window's title back to that on
    // load — clobbering the workspace-name policy applied below. Suppress the
    // default sync so setTitle() calls from refreshWindowTitles() stick.
    window.on('page-title-updated', (event) => {
      event.preventDefault()
    })

    // Store the window mapping BEFORE loadURL — bootstrap preload uses
    // __get-workspace-id (via sendSync) which reads this map during eval.
    const webContentsId = window.webContents.id
    this.windows.set(webContentsId, { window, workspaceId })

    // Apply window-title policy now that the map size reflects this window —
    // covers both the new window and any existing windows that should switch
    // from app name → workspace name as the count crosses 1 → 2.
    this.refreshWindowTitles()

    // Track focused mode state for persistence
    if (focused) {
      this.focusedModeWindows.add(webContentsId)
    }

    // Development-only native material probe. This deliberately bypasses the
    // full CraftAgent UI so platform material behavior can be verified without
    // business-layout backgrounds masking the result.
    if (materialProfile.probe) {
      window.loadURL(getMaterialProbeUrl(materialProfile))
    } else if (restoreUrl) {
      // Load the renderer - use restoreUrl if provided, otherwise build from options
      // Restore from saved URL - need to adapt for dev vs prod
      if (VITE_DEV_SERVER_URL) {
        // In dev mode, replace the base URL but keep the path and query
        try {
          const savedUrl = new URL(restoreUrl)
          const devUrl = new URL(VITE_DEV_SERVER_URL)
          // Preserve pathname and search from saved URL, use dev server host
          devUrl.pathname = savedUrl.pathname
          devUrl.search = savedUrl.search
          window.loadURL(devUrl.toString())
        } catch {
          // Fallback if URL parsing fails
          windowLog.warn('Failed to parse restoreUrl, using default:', restoreUrl)
          const params = new URLSearchParams({ workspaceId, ...(focused && { focused: 'true' }) }).toString()
          window.loadURL(`${VITE_DEV_SERVER_URL}?${params}`)
        }
      } else {
        // In prod, always extract query params and load from current __dirname.
        // Never load file:// URLs directly — the path may be stale (e.g. Linux AppImage
        // mounts to a different /tmp dir on each launch). See #13.
        try {
          const savedUrl = new URL(restoreUrl)
          const query: Record<string, string> = {}
          savedUrl.searchParams.forEach((value, key) => { query[key] = value })
          window.loadFile(join(__dirname, 'renderer/index.html'), { query })
        } catch {
          window.loadFile(join(__dirname, 'renderer/index.html'), { query: { workspaceId } })
        }
      }
    } else {
      // Build URL from options
      const query: Record<string, string> = { workspaceId }
      if (focused) {
        query.focused = 'true' // Open in focused mode (no sidebars)
      }

      if (VITE_DEV_SERVER_URL) {
        const params = new URLSearchParams(query).toString()
        window.loadURL(`${VITE_DEV_SERVER_URL}?${params}`)
      } else {
        window.loadFile(join(__dirname, 'renderer/index.html'), { query })
      }
    }

    // Fallback: if the renderer fails to load (e.g. stale path, disk error),
    // recover gracefully by loading the default state instead of showing a white screen. See #13.
    // In dev mode, retry the Vite dev server (it may not be ready yet) instead of falling back
    // to file:// which doesn't exist during development.
    let failLoadRetries = 0
    let failLoadRetryTimer: ReturnType<typeof setTimeout> | null = null
    const clearFailLoadRetry = () => {
      if (failLoadRetryTimer) {
        clearTimeout(failLoadRetryTimer)
        failLoadRetryTimer = null
      }
    }
    window.on('closed', clearFailLoadRetry)
    window.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
      windowLog.warn('Failed to load renderer:', errorCode, errorDescription)
      if (window.isDestroyed() || window.webContents.isDestroyed()) return
      if (VITE_DEV_SERVER_URL && failLoadRetries < 5) {
        failLoadRetries++
        windowLog.info(`Retrying Vite dev server (attempt ${failLoadRetries}/5)...`)
        clearFailLoadRetry()
        failLoadRetryTimer = setTimeout(() => {
          failLoadRetryTimer = null
          if (window.isDestroyed() || window.webContents.isDestroyed()) return
          const params = new URLSearchParams({ workspaceId }).toString()
          window.loadURL(`${VITE_DEV_SERVER_URL}?${params}`)
        }, 1000)
      } else {
        window.loadFile(join(__dirname, 'renderer/index.html'), { query: { workspaceId } })
      }
    })

    // If an initial deep link was provided, navigate to it after the window is ready
    if (initialDeepLink) {
      window.once('ready-to-show', () => {
        // Import parseDeepLink dynamically to avoid circular dependency
        import('./deep-link').then(({ parseDeepLink }) => {
          const target = parseDeepLink(initialDeepLink)
          if (target && (target.view || target.action)) {
            // Wait a bit for React to mount and register IPC listeners
            setTimeout(() => {
              this.pushToWindow(window, RPC_CHANNELS.deeplink.NAVIGATE, {
                view: target.view,
                action: target.action,
                actionParams: target.actionParams,
              })
            }, 100)
          }
        })
      })
    }

    // Listen for system theme changes and notify this window's renderer
    const themeHandler = () => {
      this.pushToWindow(window, RPC_CHANNELS.theme.SYSTEM_CHANGED, nativeTheme.shouldUseDarkColors)
    }
    nativeTheme.on('updated', themeHandler)

    // Handle focus/blur to broadcast window focus state
    window.on('focus', () => {
      this.pushToWindow(window, RPC_CHANNELS.window.FOCUS_STATE, true)
    })
    window.on('blur', () => {
      this.pushToWindow(window, RPC_CHANNELS.window.FOCUS_STATE, false)
    })

    let leftShortcutDown = false
    let rightShortcutDown = false
    let screenCaptureTriggered = false

    // Detect Cmd/Ctrl+W before close events so renderer can distinguish close source.
    // Intent is short-lived to avoid stale classification.
    window.webContents.on('before-input-event', (_event, input) => {
      // Electron reports physical modifier sides here, which keeps the
      // screenshot gesture functional whenever a CraftAgent window is focused.
      // The preload turns the request into the draft-only screen capture IPC.
      const code = input.code
      if (process.platform === 'darwin') {
        if (code === 'MetaLeft') leftShortcutDown = input.type === 'keyDown'
        if (code === 'MetaRight') rightShortcutDown = input.type === 'keyDown'
      }
      else if (process.platform === 'win32') {
        if (code === 'AltLeft') leftShortcutDown = input.type === 'keyDown'
        if (code === 'AltRight') rightShortcutDown = input.type === 'keyDown'
      }
      if (
        (process.platform === 'darwin' || process.platform === 'win32')
        && getDoubleCommandScreenshotEnabled()
        && leftShortcutDown
        && rightShortcutDown
        && input.type === 'keyDown'
        && !screenCaptureTriggered
      ) {
        screenCaptureTriggered = true
        this.pushToWindow(window, RPC_CHANNELS.screenCapture.REQUESTED)
      }
      if (!leftShortcutDown || !rightShortcutDown) screenCaptureTriggered = false

      if (!input || input.type !== 'keyDown') return
      const key = input.key?.toLowerCase?.()
      if (key !== 'w') return

      const isCloseShortcut = process.platform === 'darwin'
        ? !!input.meta
        : !!input.control

      if (!isCloseShortcut) return

      const wcId = window.webContents.id
      this.keyboardCloseIntents.add(wcId)
      const existingTimeout = this.keyboardCloseIntentTimeouts.get(wcId)
      if (existingTimeout) clearTimeout(existingTimeout)

      this.keyboardCloseIntentTimeouts.set(wcId, setTimeout(() => {
        this.keyboardCloseIntentTimeouts.delete(wcId)
        this.keyboardCloseIntents.delete(wcId)
      }, 500))
    })

    // Handle window close request (traffic-light button, menu close, Cmd/Ctrl+W)
    // and send source metadata so renderer can decide layered dismiss vs direct close.
    window.on('close', (event) => {
      // During app quit, bypass layered close behavior and allow native close flow.
      // This preserves expected Cmd+Q semantics (quit app instead of closing overlays/panels first).
      if (this.isAppQuitting) {
        return
      }

      // Check if renderer is ready (mainFrame exists) - if not, allow close directly
      if (!window.webContents.isDestroyed() && window.webContents.mainFrame) {
        event.preventDefault()
        const wcId = window.webContents.id
        let source: WindowCloseRequestSource = 'window-button'
        if (this.keyboardCloseIntents.has(wcId)) {
          source = 'keyboard-shortcut'
          this.keyboardCloseIntents.delete(wcId)
          const keyboardIntentTimeout = this.keyboardCloseIntentTimeouts.get(wcId)
          if (keyboardIntentTimeout) {
            clearTimeout(keyboardIntentTimeout)
            this.keyboardCloseIntentTimeouts.delete(wcId)
          }
        }

        // Send close request to renderer - it will either close a modal/panel or confirm close.
        this.pushToWindow(window, RPC_CHANNELS.window.CLOSE_REQUESTED, { source })

        // Fallback timeout: if IPC fails (e.g., on Hyprland/Wayland), force close after 3s.
        // Reset timeout on each attempt so active users closing modals aren't interrupted.
        const existingTimeout = this.pendingCloseTimeouts.get(wcId)
        if (existingTimeout) clearTimeout(existingTimeout)

        this.pendingCloseTimeouts.set(wcId, setTimeout(() => {
          this.pendingCloseTimeouts.delete(wcId)
          if (!window.isDestroyed()) window.destroy()
        }, 3000))
      }
      // If renderer not ready, allow default close behavior
    })

    // Handle window closed - clean up theme listener and internal state
    window.on('closed', () => {
      // Clean up any pending close timeout to prevent memory leaks
      const timeout = this.pendingCloseTimeouts.get(webContentsId)
      if (timeout) {
        clearTimeout(timeout)
        this.pendingCloseTimeouts.delete(webContentsId)
      }

      // Clean up short-lived keyboard-close intent tracking.
      const keyboardIntentTimeout = this.keyboardCloseIntentTimeouts.get(webContentsId)
      if (keyboardIntentTimeout) {
        clearTimeout(keyboardIntentTimeout)
        this.keyboardCloseIntentTimeouts.delete(webContentsId)
      }
      this.keyboardCloseIntents.delete(webContentsId)

      nativeTheme.removeListener('updated', themeHandler)
      this.windows.delete(webContentsId)
      this.focusedModeWindows.delete(webContentsId)
      // Re-apply window-title policy — surviving windows revert from workspace
      // name back to app name when the count drops from 2 → 1.
      this.refreshWindowTitles()
      windowLog.info(`Window closed for workspace ${workspaceId}`)
    })

    windowLog.info(`Created window for workspace ${workspaceId} (focused: ${focused})`)
    return window
  }

  /**
   * Get window by webContents.id (used by IPC handlers instead of BrowserWindow.fromId)
   */
  getWindowByWebContentsId(wcId: number): BrowserWindow | null {
    const managed = this.windows.get(wcId)
    return managed?.window ?? null
  }

  /**
   * Get window by workspace ID (returns first match - for backwards compatibility)
   */
  getWindowByWorkspace(workspaceId: string): BrowserWindow | null {
    for (const managed of this.windows.values()) {
      if (managed.workspaceId === workspaceId && !managed.window.isDestroyed()) {
        return managed.window
      }
    }
    return null
  }

  /**
   * Get ALL windows for a workspace (main window + tab content windows)
   * Used for broadcasting events to all windows showing the same workspace
   */
  getAllWindowsForWorkspace(workspaceId: string): BrowserWindow[] {
    const windows: BrowserWindow[] = []
    for (const managed of this.windows.values()) {
      if (managed.workspaceId === workspaceId && !managed.window.isDestroyed()) {
        windows.push(managed.window)
      }
    }
    // Debug: log registered workspaces when lookup fails
    if (windows.length === 0 && this.windows.size > 0) {
      const registered = Array.from(this.windows.values()).map(m => m.workspaceId)
      windowLog.warn(`No windows for workspace '${workspaceId}', have: [${registered.join(', ')}]`)
    }
    return windows
  }

  /**
   * Get workspace ID for a window (by webContents.id)
   */
  getWorkspaceForWindow(webContentsId: number): string | null {
    const managed = this.windows.get(webContentsId)
    return managed?.workspaceId ?? null
  }

  /**
   * Mark whether the app is in quit flow.
   * When true, window close events bypass layered close interception.
   */
  setAppQuitting(isQuitting: boolean): void {
    this.isAppQuitting = isQuitting
  }

  /**
   * Close window by webContents.id (triggers close event which may be intercepted)
   */
  closeWindow(webContentsId: number): void {
    const managed = this.windows.get(webContentsId)
    if (managed && !managed.window.isDestroyed()) {
      managed.window.close()
    }
  }

  /**
   * Force close window by webContents.id (bypasses close event interception).
   * Used when renderer confirms the close action (no modals to close).
   */
  forceCloseWindow(webContentsId: number): void {
    // Clear any pending close timeout since renderer confirmed
    const timeout = this.pendingCloseTimeouts.get(webContentsId)
    if (timeout) {
      clearTimeout(timeout)
      this.pendingCloseTimeouts.delete(webContentsId)
    }

    const managed = this.windows.get(webContentsId)
    if (managed && !managed.window.isDestroyed()) {
      // Remove close listener temporarily to avoid infinite loop,
      // then destroy the window directly
      managed.window.destroy()
    }
  }

  /**
   * Cancel a pending close request (renderer handled it by closing a modal/panel).
   * Clears the fallback timeout so the window stays open.
   */
  cancelPendingClose(webContentsId: number): void {
    const timeout = this.pendingCloseTimeouts.get(webContentsId)
    if (timeout) {
      clearTimeout(timeout)
      this.pendingCloseTimeouts.delete(webContentsId)
    }
  }

  /**
   * Close window for a specific workspace
   */
  closeWindowForWorkspace(workspaceId: string): void {
    const window = this.getWindowByWorkspace(workspaceId)
    if (window && !window.isDestroyed()) {
      window.close()
    }
  }

  /**
   * Update the workspace ID for an existing window (for in-window switching)
   * @param webContentsId - The webContents.id of the window
   * @param workspaceId - The new workspace ID
   * @returns true if window was found and updated, false otherwise
   */
  updateWindowWorkspace(webContentsId: number, workspaceId: string): boolean {
    const managed = this.windows.get(webContentsId)
    if (managed) {
      const oldWorkspaceId = managed.workspaceId
      managed.workspaceId = workspaceId
      // Re-apply window-title policy so in-window workspace switches update
      // the titlebar immediately (relevant when ≥2 windows are open).
      this.refreshWindowTitles()
      windowLog.info(`Updated window ${webContentsId} from workspace ${oldWorkspaceId} to ${workspaceId}`)
      return true
    }
    // Window not found - log for debugging
    windowLog.warn(`Cannot update workspace for unknown window ${webContentsId}, registered: [${Array.from(this.windows.keys()).join(', ')}]`)
    return false
  }

  /**
   * Register an existing window with a workspace ID
   * Used for re-registration when window mapping is lost (e.g., after refresh)
   * @param window - The BrowserWindow to register
   * @param workspaceId - The workspace ID to associate with
   */
  registerWindow(window: BrowserWindow, workspaceId: string): void {
    const webContentsId = window.webContents.id
    this.windows.set(webContentsId, { window, workspaceId })
    // Re-apply window-title policy after re-registration (e.g. post-refresh).
    this.refreshWindowTitles()
    windowLog.info(`Registered window ${webContentsId} for workspace ${workspaceId}`)
  }

  /**
   * Get all managed windows
   */
  getAllWindows(): ManagedWindow[] {
    return Array.from(this.windows.values()).filter(m => !m.window.isDestroyed())
  }

  /**
   * Focus existing window for workspace or create new one
   */
  focusOrCreateWindow(workspaceId: string): BrowserWindow {
    const existing = this.getWindowByWorkspace(workspaceId)
    if (existing) {
      if (existing.isMinimized()) {
        existing.restore()
      }
      existing.focus()
      return existing
    }
    return this.createWindow({ workspaceId })
  }

  /**
   * Get window states for persistence (includes bounds and focused mode)
   * Used by window-state.ts to save/restore windows
   */
  getWindowStates(): SavedWindow[] {
    return this.getAllWindows().map(managed => {
      const webContentsId = managed.window.webContents.id
      const isFocused = this.focusedModeWindows.has(webContentsId)
      const url = managed.window.webContents.getURL()
      return {
        type: 'main' as const,
        workspaceId: managed.workspaceId,
        bounds: managed.window.getBounds(),
        ...(isFocused && { focused: true }),
        ...(url && { url }),
      }
    })
  }

  /**
   * Check if any windows are open
   */
  hasWindows(): boolean {
    return this.getAllWindows().length > 0
  }

  /**
   * Get the currently focused window
   */
  getFocusedWindow(): BrowserWindow | null {
    const focused = BrowserWindow.getFocusedWindow()
    if (focused && !focused.isDestroyed()) {
      return focused
    }
    return null
  }

  /**
   * Get the last active window (most recently used)
   * Falls back to any available window if none focused
   */
  getLastActiveWindow(): BrowserWindow | null {
    // First try focused window
    const focused = this.getFocusedWindow()
    if (focused) {
      return focused
    }

    // Fall back to any available window
    const allWindows = this.getAllWindows()
    if (allWindows.length > 0) {
      return allWindows[0].window
    }

    return null
  }

  /**
   * Show or hide macOS traffic light buttons (close/minimize/maximize).
   * Used to hide them when fullscreen overlays are open to prevent accidental clicks.
   * No-op on non-macOS platforms.
   */
  setTrafficLightsVisible(webContentsId: number, visible: boolean): void {
    if (process.platform !== 'darwin') return

    const managed = this.windows.get(webContentsId)
    if (managed && !managed.window.isDestroyed()) {
      managed.window.setWindowButtonVisibility(visible)
      // Re-apply custom traffic light position after showing buttons
      // setWindowButtonVisibility can reset position to default, so we need
      // to restore the custom position using the modern setWindowButtonPosition API
      if (visible) {
        managed.window.setWindowButtonPosition({ x: 18, y: 19 })
      }
    }
  }
}
