/**
 * BrowserPaneManager
 *
 * Owns browser instances as dedicated BrowserWindow objects.
 * Each instance maps 1:1 to a full native window while preserving
 * shared session/cookie partition and CDP automation support.
 */

import { join, parse as parsePath, resolve } from 'path'
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'fs'
import { randomUUID } from 'crypto'
import { validateFilePath, getWorkspaceAllowedDirs } from '@craft-agent/server-core/handlers'
import { BrowserWindow, Menu, WebContentsView, app, clipboard, dialog, ipcMain, nativeTheme, net, session, shell, type DownloadItem, type MenuItemConstructorOptions, type MessageBoxOptions, type Rectangle, type Session as ElectronSession } from 'electron'
import { mainLog } from './logger'
import type { WindowManager } from './window-manager'
import { BrowserCDP, type AccessibilitySnapshot, type ElementGeometry } from './browser-cdp'
import {
  type BrowserPaneBounds,
  type BrowserEmptyStateLaunchPayload,
  type BrowserEmptyStateLaunchResult,
  type BrowserInstanceInfo,
  type BrowserBookmarkEntry,
  type BrowserBookmarkFolder,
  type BrowserHistoryEntry,
  type BrowserDownloadRecord,
  type BrowserExtensionEntry,
  type BrowserPermissionEntry,
  type BrowserWorkspaceSnapshot,
} from '../shared/types'
import { DEFAULT_THEME, loadAppTheme, getAllowRemoteEvaluate } from '@craft-agent/shared/config'
import { CodedError } from '@craft-agent/shared/protocol'
import type {
  IBrowserPaneManager,
  BrowserInstanceSnapshot,
} from '@craft-agent/server-core/handlers'
import type {
  BrowserCapabilityRequest,
  ScreenshotResultWire,
} from '@craft-agent/server-core/transport'
import { BrowserProfileStore } from './browser-profile-store'
import { BrowserPasswordVault } from './browser-password-vault'
import extractZip from 'extract-zip'

export type { BrowserInstanceInfo }

const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL
const TOOLBAR_LOAD_MAX_RETRIES = 4
const TOOLBAR_LOAD_RETRY_DELAY_MS = 500
const TOOLBAR_HEIGHT = 48
const EMBEDDED_VIEW_RADIUS = 10
const MAX_CONSOLE_LOG_ENTRIES = 500
const MAX_NETWORK_LOG_ENTRIES = 500
const MAX_DOWNLOAD_LOG_ENTRIES = 200
const DEFAULT_WAIT_TIMEOUT_MS = 10_000
const DEFAULT_WAIT_POLL_MS = 100
const SCREENSHOT_HIDDEN_CAPTURE_ATTEMPTS = 3
const SCREENSHOT_RETRY_DELAY_MS = 120
const SCREENSHOT_RESCUE_PAINT_DELAY_MS = 180
const SCREENSHOT_NETWORK_IDLE_TIMEOUT_MS = 1_000
const SCREENSHOT_NETWORK_IDLE_MS = 300
const THEME_COLOR_SIGNAL_PREFIX = '__craft_theme_color__:'
const THEME_COLOR_NULL_SENTINEL = '__NULL__'
const THEME_OBSERVER_MIN_INTERVAL_MS = 120
const EARLY_THEME_EXTRACTION_DELAY_MS = 100
const BROWSER_EMPTY_STATE_PAGE = 'browser-empty-state.html'
const EMPTY_STATE_FOCUS_CHANNEL = 'browser-empty-state:request-focus'
const CRAFT_DEEPLINK_SCHEME_PREFIX = `${process.env.CRAFT_DEEPLINK_SCHEME || 'craftagents'}://`
const DANGEROUS_DOWNLOAD_EXTENSIONS = new Set([
  '.app', '.bat', '.cmd', '.com', '.command', '.dmg', '.exe', '.jar', '.msi', '.pkg', '.ps1', '.scr', '.sh',
])
const INTERNAL_BROWSER_PROTOCOLS = new Set(['about:', 'blob:', 'data:', 'file:', 'http:', 'https:', 'javascript:'])
const CHROME_EXTENSION_ID_PATTERN = /^[a-p]{32}$/
const MAX_EXTENSION_PACKAGE_BYTES = 100 * 1024 * 1024
const INSTALL_STORE_EXTENSION_CHANNEL = 'browser-extension:install-from-store-page'

function escapeBookmarkHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

function decodeBookmarkHtml(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_match, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')
}

function readHtmlAttribute(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'))
  return match ? decodeBookmarkHtml(match[1] ?? match[2] ?? '') : null
}

const THEME_COLOR_EXTRACTOR_FN = String.raw`
() => {
  const toHex = (r, g, b) => '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('');

  const parseColor = (str) => {
    if (!str) return null;
    str = str.trim();
    const hm = /^#([0-9a-f]{3,8})$/i.exec(str);
    if (hm) {
      const h = hm[1];
      let r, g, b;
      if (h.length === 3) { r = parseInt(h[0]+h[0],16); g = parseInt(h[1]+h[1],16); b = parseInt(h[2]+h[2],16); }
      else if (h.length >= 6) { r = parseInt(h.slice(0,2),16); g = parseInt(h.slice(2,4),16); b = parseInt(h.slice(4,6),16); }
      else return null;
      return toHex(r, g, b);
    }
    const rm = str.match(/rgba?[\(]\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/);
    if (rm) return toHex(+rm[1], +rm[2], +rm[3]);
    return null;
  };

  const parseBg = (el) => {
    if (!el) return null;
    const bg = getComputedStyle(el).backgroundColor;
    if (!bg || bg === 'transparent' || bg === 'rgba(0, 0, 0, 0)') return null;
    return parseColor(bg);
  };

  // 1. theme-color meta — respect media attribute for light/dark
  const metas = document.querySelectorAll('meta[name="theme-color"]');
  for (const m of metas) {
    const media = m.getAttribute('media');
    if (media && !window.matchMedia(media).matches) continue;
    const c = parseColor(m.content);
    if (c) return c;
  }

  // 2. Safari-like approach: sample fixed/sticky elements at viewport top-center
  const els = document.elementsFromPoint(window.innerWidth / 2, 4);
  for (const el of els) {
    if (el === document.documentElement || el === document.body) continue;
    const style = getComputedStyle(el);
    const pos = style.position;
    if (pos !== 'fixed' && pos !== 'sticky') continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < window.innerWidth * 0.8) continue;
    const c = parseBg(el);
    if (c) return c;
  }

  // 3. Fallback: body then html
  return parseBg(document.body) || parseBg(document.documentElement) || null;
}
`

/** IPC channels for the browser toolbar preload */
const TOOLBAR_CHANNELS = {
  NAVIGATE: 'browser-toolbar:navigate',
  GO_BACK: 'browser-toolbar:go-back',
  GO_FORWARD: 'browser-toolbar:go-forward',
  RELOAD: 'browser-toolbar:reload',
  STOP: 'browser-toolbar:stop',
  SET_REVEALED: 'browser-toolbar:set-revealed',
  PIN_EMBEDDED: 'browser-toolbar:pin-embedded',
  SHOW_EMBEDDED_MENU: 'browser-toolbar:show-embedded-menu',
  TOGGLE_BOOKMARK: 'browser-toolbar:toggle-bookmark',
  MENU_GEOMETRY: 'browser-toolbar:menu-geometry',
  FORCE_CLOSE_MENU: 'browser-toolbar:force-close-menu',
  HIDE: 'browser-toolbar:hide',
  DESTROY: 'browser-toolbar:destroy',
  STATE_UPDATE: 'browser-toolbar:state-update',
  THEME_COLOR: 'browser-toolbar:theme-color',
} as const
export const BROWSER_PANE_SESSION_PARTITION = 'persist:browser-pane'
const SESSION_PARTITION = BROWSER_PANE_SESSION_PARTITION

interface AgentControlState {
  active: boolean
  sessionId: string
  displayName?: string
  intent?: string
}

interface AgentControlLockState {
  active: boolean
  previousResizable: boolean
}

interface BrowserInstance {
  id: string
  window: BrowserWindow
  toolbarView: WebContentsView
  pageView: WebContentsView
  nativeOverlayView: WebContentsView
  cdp: BrowserCDP
  currentUrl: string
  title: string
  favicon: string | null
  isLoading: boolean
  canGoBack: boolean
  canGoForward: boolean
  boundSessionId: string | null
  ownerType: 'session' | 'manual'
  ownerSessionId: string | null
  /**
   * Workspace this instance is associated with, or `null` for unbound manual
   * windows. Renderers in other workspaces filter such entries out of the tab
   * strip / status badge. Stamped at create-time (or first bind) — once non-null,
   * subsequent rebinds may overwrite it with the new binder's workspace.
   */
  workspaceId: string | null
  isVisible: boolean
  isHiding: boolean
  keepAliveOnWindowClose: boolean
  toolbarReady: boolean
  toolbarMenuOpen: boolean
  toolbarMenuHeight: number
  toolbarMenuOverlayActive: boolean
  showOnCreate: boolean
  pendingShowOnReady: boolean
  pendingShowToken: number
  lastAction: LastBrowserAction | null
  agentControl: AgentControlState | null
  lockState: AgentControlLockState
  nativeOverlayReady: boolean
  themeColor: string | null
  inPageThemeTimer: ReturnType<typeof setTimeout> | null
  themeObserverToken: string | null
  consoleLogs: BrowserConsoleEntry[]
  networkLogs: BrowserNetworkEntry[]
  downloads: BrowserDownloadEntry[]
  lastLaunchToken: string | null
  /** Main app renderer that currently hosts this instance as an embedded tab. */
  embeddedHostWebContentsId: number | null
  /** Native host for embedded WebContentsViews. The shell BrowserWindow stays hidden. */
  embeddedHostWindow: BrowserWindow | null
  /** Last page bounds in host content coordinates. */
  embeddedBounds: Rectangle | null
  /** Whether the integrated toolbar occupies layout or floats above the page. */
  embeddedToolbarMode: 'fixed' | 'floating'
  embeddedToolbarRevealed: boolean
  lastCrashAt: number
  crashRecoveryAttempts: number
  credentialOfferUrl: string | null
  /** Tracks Option/Alt while the page requests a new window. */
  altKeyPressed: boolean
}

interface CreateBrowserInstanceOptions {
  show?: boolean
  ownerType?: 'session' | 'manual'
  ownerSessionId?: string
  workspaceId?: string | null
  embeddedHostWebContentsId?: number
  initialUrl?: string
}

export interface BrowserScreenshotOptions {
  mode?: 'raw' | 'agent'
  refs?: string[]
  includeLastAction?: boolean
  includeMetadata?: boolean
  /** Annotate screenshot with @eN labels on all interactive elements from accessibility tree */
  annotate?: boolean
  format?: 'png' | 'jpeg'
  jpegQuality?: number
}

export interface BrowserConsoleEntry {
  timestamp: number
  level: 'log' | 'info' | 'warn' | 'error'
  message: string
}

export interface BrowserConsoleOptions {
  level?: 'all' | BrowserConsoleEntry['level']
  limit?: number
}

export interface BrowserScreenshotRegionTarget {
  x?: number
  y?: number
  width?: number
  height?: number
  ref?: string
  selector?: string
  padding?: number
  format?: 'png' | 'jpeg'
  jpegQuality?: number
}

export interface BrowserNetworkEntry {
  timestamp: number
  method: string
  url: string
  status: number
  resourceType: string
  ok: boolean
}

export interface BrowserNetworkOptions {
  limit?: number
  status?: 'all' | 'failed' | '2xx' | '3xx' | '4xx' | '5xx'
  method?: string
  resourceType?: string
}

export interface BrowserWaitArgs {
  kind: 'selector' | 'text' | 'url' | 'network-idle'
  value?: string
  timeoutMs?: number
  pollMs?: number
  idleMs?: number
}

export interface BrowserWaitResult {
  ok: true
  kind: BrowserWaitArgs['kind']
  elapsedMs: number
  detail: string
}

export interface BrowserKeyArgs {
  key: string
  modifiers?: Array<'shift' | 'control' | 'alt' | 'meta'>
}

export interface BrowserDownloadEntry {
  id: string
  timestamp: number
  url: string
  filename: string
  state: 'started' | 'paused' | 'completed' | 'interrupted' | 'cancelled'
  bytesReceived: number
  totalBytes: number
  mimeType: string
  savePath?: string
}

export interface BrowserDownloadOptions {
  action?: 'list' | 'wait'
  limit?: number
  timeoutMs?: number
}

export interface BrowserScreenshotResult {
  imageBuffer: Buffer
  imageFormat: 'png' | 'jpeg'
  metadata?: {
    mode: 'raw' | 'agent'
    viewport?: {
      width: number
      height: number
      dpr: number
      scrollX: number
      scrollY: number
    }
    targets?: Array<{
      ref: string
      role?: string
      name?: string
      box: { x: number; y: number; width: number; height: number }
      clickPoint: { x: number; y: number }
    }>
    action?: {
      tool: string
      ref?: string
      status: 'succeeded' | 'failed'
      timestamp: number
    }
    annotationPartial?: boolean
    warnings?: string[]
    region?: {
      x: number
      y: number
      width: number
      height: number
    }
    targetMode?: 'coords' | 'ref' | 'selector'
  }
}

interface LastBrowserAction {
  tool: string
  ref?: string
  status: 'succeeded' | 'failed'
  geometry?: ElementGeometry
  timestamp: number
}

let instanceCounter = 0

export class BrowserPaneManager implements IBrowserPaneManager {
  private instances: Map<string, BrowserInstance> = new Map()
  private destroyingIds: Set<string> = new Set()
  private stateChangeCallback: ((info: BrowserInstanceInfo) => void) | null = null
  private removedCallback: ((id: string) => void) | null = null
  private interactedCallback: ((id: string) => void) | null = null
  private partitionPermissionsInitialized = false
  private partitionObserversInitialized = false
  private inFlightRequestsByWebContentsId = new Map<number, number>()
  private lastNetworkActivityByWebContentsId = new Map<number, number>()
  private popupWindowsByParentInstanceId = new Map<string, Set<BrowserWindow>>()
  private popupParentByWebContentsId = new Map<number, string>()
  private windowManager: WindowManager | null = null
  private sessionPathResolver: ((sessionId: string) => string | null) | null = null
  private readonly profileStore = new BrowserProfileStore()
  private readonly permissionDecisions = new Map<string, boolean>()
  private readonly activeDownloads = new Map<string, { item: DownloadItem; instanceId: string }>()
  private readonly passwordVault = new BrowserPasswordVault()
  private readonly pendingCredentialPrompts = new Set<string>()

  constructor() {
    for (const entry of this.profileStore.listPermissions()) {
      this.permissionDecisions.set(`${entry.origin}|${entry.permission}`, entry.allowed)
    }
    void this.restoreExtensions()
  }

  setWindowManager(windowManager: WindowManager): void {
    this.windowManager = windowManager
  }

  handleCertificateError(webContentsId: number, url: string, error: string, callback: (trusted: boolean) => void): boolean {
    const instance = this.getInstanceByWebContentsId(webContentsId)
    if (!instance) return false
    const host = instance.embeddedHostWindow ?? instance.window
    const localeIsChinese = app.getLocale().toLowerCase().startsWith('zh')
    void dialog.showMessageBox(host, {
      type: 'warning',
      title: localeIsChinese ? '连接不安全' : 'Connection is not private',
      message: localeIsChinese ? '此网站的安全证书无效。' : 'This site presented an invalid security certificate.',
      detail: `${url}\n\n${error}`,
      buttons: [localeIsChinese ? '返回安全页面' : 'Go back', localeIsChinese ? '仍然继续（不安全）' : 'Continue (unsafe)'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    }).then((result) => callback(result.response === 1), () => callback(false))
    return true
  }

  setSessionPathResolver(fn: (sessionId: string) => string | null): void {
    this.sessionPathResolver = fn
  }

  onStateChange(callback: (info: BrowserInstanceInfo) => void): void {
    this.stateChangeCallback = callback
  }

  onRemoved(callback: (id: string) => void): void {
    this.removedCallback = callback
  }

  onInteracted(callback: (id: string) => void): void {
    this.interactedCallback = callback
  }

  createInstance(id?: string, options?: CreateBrowserInstanceOptions): string {
    let instanceId = id
    if (!instanceId) {
      do {
        instanceId = `browser-${++instanceCounter}`
      } while (this.instances.has(instanceId))
    }
    const shouldShow = options?.show ?? false
    const ownerType = options?.ownerType ?? 'manual'
    const ownerSessionId = ownerType === 'session' ? (options?.ownerSessionId ?? null) : null
    const workspaceId = options?.workspaceId ?? null
    const embeddedHostWebContentsId = options?.embeddedHostWebContentsId ?? null
    const embeddedHostWindow = embeddedHostWebContentsId !== null
      ? this.windowManager?.getWindowByWebContentsId(embeddedHostWebContentsId) ?? null
      : null

    if (this.instances.has(instanceId)) {
      mainLog.warn(`[browser-pane] Instance already exists, reusing: ${instanceId}`)
      return instanceId
    }

    const ses = session.fromPartition(SESSION_PARTITION)
    this.setupSessionPermissions(ses)
    this.setupSessionObservers(ses)

    // Match background to current OS theme to prevent black/white flash on open
    const bgColor = nativeTheme.shouldUseDarkColors ? '#2b292e' : '#fafafb'

    const window = new BrowserWindow({
      width: embeddedHostWindow ? 1 : 1200,
      height: embeddedHostWindow ? 1 : 900,
      minWidth: embeddedHostWindow ? 1 : 700,
      minHeight: embeddedHostWindow ? 1 : 500,
      show: false, // Always hidden until toolbar is painted (ready-to-show)
      backgroundColor: bgColor,
      // Fully chromeless — standalone mode renders into this hidden shell.
      // Embedded mode moves the page views into the owning Craft window.
      frame: false,
      hasShadow: !embeddedHostWindow,
      skipTaskbar: Boolean(embeddedHostWindow),
      movable: !embeddedHostWindow,
      resizable: !embeddedHostWindow,
      webPreferences: {
        partition: SESSION_PARTITION,
        session: ses,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    })

    const toolbarView = new WebContentsView({
      webPreferences: {
        preload: join(__dirname, 'browser-toolbar-preload.cjs'),
        partition: SESSION_PARTITION,
        session: ses,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    })

    const pageView = new WebContentsView({
      webPreferences: {
        preload: join(__dirname, 'browser-page-preload.cjs'),
        partition: SESSION_PARTITION,
        session: ses,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    })

    const nativeOverlayView = new WebContentsView({
      webPreferences: {
        partition: SESSION_PARTITION,
        session: ses,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    })

    // Match the native views to the app theme so about:blank never flashes.
    const toolbarWcWithBg = toolbarView.webContents as typeof toolbarView.webContents & { setBackgroundColor?: (color: string) => void }
    toolbarWcWithBg.setBackgroundColor?.('#00000000')
    const pageWcWithBg = pageView.webContents as typeof pageView.webContents & { setBackgroundColor?: (color: string) => void }
    pageWcWithBg.setBackgroundColor?.(bgColor)
    const overlayWcWithBg = nativeOverlayView.webContents as typeof nativeOverlayView.webContents & { setBackgroundColor?: (color: string) => void }
    overlayWcWithBg.setBackgroundColor?.('#00000000')

    const cdp = new BrowserCDP(pageView.webContents)

    const instance: BrowserInstance = {
      id: instanceId,
      window,
      toolbarView,
      pageView,
      nativeOverlayView,
      cdp,
      currentUrl: 'about:blank',
      title: 'New Tab',
      favicon: null,
      isLoading: false,
      canGoBack: false,
      canGoForward: false,
      boundSessionId: ownerSessionId,
      ownerType,
      ownerSessionId,
      workspaceId,
      isVisible: false,
      isHiding: false,
      keepAliveOnWindowClose: true,
      toolbarReady: false,
      toolbarMenuOpen: false,
      toolbarMenuHeight: 0,
      toolbarMenuOverlayActive: false,
      showOnCreate: shouldShow,
      pendingShowOnReady: false,
      pendingShowToken: 0,
      lastAction: null,
      agentControl: null,
      lockState: {
        active: false,
        previousResizable: this.getWindowResizable(window),
      },
      nativeOverlayReady: false,
      themeColor: null,
      inPageThemeTimer: null,
      themeObserverToken: null,
      consoleLogs: [],
      networkLogs: [],
      downloads: [],
      lastLaunchToken: null,
      embeddedHostWebContentsId,
      embeddedHostWindow,
      embeddedBounds: null,
      // Embedded workspaces now keep navigation controls with the tab list;
      // fixed mode keeps the separate native floating toolbar hidden.
      embeddedToolbarMode: 'fixed',
      embeddedToolbarRevealed: false,
      lastCrashAt: 0,
      crashRecoveryAttempts: 0,
      credentialOfferUrl: null,
      altKeyPressed: false,
    }

    const defaultUa = pageView.webContents.userAgent || ''
    const sanitizedUa = defaultUa.replace(/\sElectron\/[^\s]+/g, '')
    if (sanitizedUa && sanitizedUa !== defaultUa) {
      pageView.webContents.setUserAgent(sanitizedUa)
    }

    if (embeddedHostWindow) {
      pageView.setBorderRadius(EMBEDDED_VIEW_RADIUS)
      nativeOverlayView.setBorderRadius(EMBEDDED_VIEW_RADIUS)
      pageView.setVisible(false)
      nativeOverlayView.setVisible(false)
      embeddedHostWindow.contentView.addChildView(pageView)
      embeddedHostWindow.contentView.addChildView(nativeOverlayView)
    } else {
      window.contentView.addChildView(pageView)
      window.contentView.addChildView(nativeOverlayView)
      window.contentView.addChildView(toolbarView)
      nativeOverlayView.setVisible(false)
    }
    void this.loadNativeOverlayPage(instance)

    this.layoutAllViews(instance)

    this.setupWindowListeners(instance)
    this.instances.set(instanceId, instance)
    this.emitStateChange(instance)
    mainLog.info(`[browser-pane] toolbar version: v4-react-chromeless`)
    mainLog.info(`[browser-pane] Created instance: ${instanceId} (show=${shouldShow}, ownerType=${ownerType}, ownerSessionId=${ownerSessionId ?? 'none'})`)

    if (embeddedHostWindow) {
      toolbarView.setVisible(false)
      instance.toolbarReady = true
    }
    void this.loadToolbarPage(instance)
      .finally(() => {
        // Safety net: if Electron never fires ready-to-show, still unblock focus/show behavior.
        if (!instance.toolbarReady) {
          this.markToolbarReady(instance, 'toolbar-load-finalized')
        }
      })
    void this.loadEmptyStatePage(instance)
      .then(async () => {
        const initialUrl = options?.initialUrl?.trim()
        if (initialUrl && initialUrl !== 'about:blank') {
          await this.navigate(instance.id, initialUrl)
        }
      })
      .catch((error) => {
        mainLog.warn(`[browser-pane] initial page load failed id=${instance.id}: ${error instanceof Error ? error.message : String(error)}`)
        void pageView.webContents.loadURL('about:blank')
      })

    return instanceId
  }

  destroyInstance(id: string): void {
    const instance = this.instances.get(id)
    if (!instance) {
      mainLog.info(`[browser-pane] destroy requested for missing instance id=${id}`)
      return
    }

    const destroyedBefore = instance.window.isDestroyed()
    mainLog.info(`[browser-pane] destroy requested id=${id} destroyedBefore=${destroyedBefore} keepAlive=${instance.keepAliveOnWindowClose}`)

    // Clear pending timers before destroying the window
    if (instance.inPageThemeTimer) {
      clearTimeout(instance.inPageThemeTimer)
      instance.inPageThemeTimer = null
    }
    instance.themeObserverToken = null
    instance.pendingShowOnReady = false
    instance.pendingShowToken += 1

    // Clean up in-flight network tracking for this instance's webContents
    const wcId = instance.pageView.webContents.id
    this.inFlightRequestsByWebContentsId.delete(wcId)
    this.lastNetworkActivityByWebContentsId.delete(wcId)

    const runCleanup = (label: string, action: () => void): void => {
      try {
        action()
      } catch (error) {
        mainLog.warn(`[browser-pane] destroy cleanup failed id=${id} step=${label} error=${error instanceof Error ? error.message : String(error)}`)
      }
    }

    runCleanup('closePopupsForParent', () => this.closePopupsForParent(instance.id, 'parent_destroy'))
    runCleanup('applyAgentControlLock', () => this.applyAgentControlLock(instance, false))
    runCleanup('updateNativeOverlayState', () => this.updateNativeOverlayState(instance))

    try {
      if (!instance.window.isDestroyed()) {
        this.destroyingIds.add(id)
        instance.window.destroy()
      }
    } catch (error) {
      mainLog.warn(`[browser-pane] destroy failed id=${id} error=${error instanceof Error ? error.message : String(error)}`)
    } finally {
      // Finalize synchronously in case closed does not fire (or fires later).
      this.finalizeDestroyedInstance(instance, 'destroy')
      mainLog.info(`[browser-pane] destroy completed id=${id} removed=${!this.instances.has(id)}`)
    }
  }

  getInstance(id: string): BrowserInstance | undefined {
    return this.instances.get(id)
  }

  private cleanupDestroyedInstance(instance: BrowserInstance, reason: string): void {
    this.finalizeDestroyedInstance(instance, 'closed')
    mainLog.info(`[browser-pane] cleaned up stale instance ${instance.id}: ${reason}`)
  }

  /**
   * Get an instance that is confirmed alive (window not destroyed).
   * Throws a clear error if the instance is missing or its window was closed.
   * Automatically cleans up stale entries from the instance map.
   */
  private requireAliveInstance(id: string): BrowserInstance {
    const instance = this.instances.get(id)
    if (!instance) throw new Error(`Browser instance not found: ${id}`)
    if (instance.window.isDestroyed()) {
      this.cleanupDestroyedInstance(instance, `lookup by id ${id}`)
      throw new Error(`Browser window was closed (instance: ${id})`)
    }
    return instance
  }

  async handleEmptyStateLaunchFromRenderer(
    senderWebContentsId: number,
    payload: BrowserEmptyStateLaunchPayload,
  ): Promise<BrowserEmptyStateLaunchResult> {
    const instance = this.findInstanceByPageWebContentsId(senderWebContentsId)
    if (!instance) {
      mainLog.warn(`[browser-pane] empty-state launch ignored: sender not mapped senderWebContentsId=${senderWebContentsId}`)
      return { ok: false, handled: false, reason: 'instance_not_found' }
    }

    const route = payload.route?.trim()
    if (!route) {
      mainLog.warn(`[browser-pane] empty-state launch missing route id=${instance.id}`)
      return { ok: false, handled: false, reason: 'missing_route' }
    }

    const token = payload.token ?? null
    const handled = await this.triggerEmptyStateRouteLaunch(instance, route, token, 'ipc')
    return {
      ok: true,
      handled,
      reason: handled ? undefined : 'duplicate',
    }
  }

  private findInstanceByPageWebContentsId(senderWebContentsId: number): BrowserInstance | undefined {
    for (const instance of this.instances.values()) {
      if (instance.pageView.webContents.id === senderWebContentsId) {
        return instance
      }
    }
    return undefined
  }

  private resolveLaunchWorkspaceId(): string | null {
    if (!this.windowManager) return null

    const focusedWindow = this.windowManager.getFocusedWindow()
    if (focusedWindow) {
      const focusedWorkspaceId = this.windowManager.getWorkspaceForWindow(focusedWindow.webContents.id)
      if (focusedWorkspaceId) {
        return focusedWorkspaceId
      }
    }

    const managedWindows = this.windowManager.getAllWindows()
    return managedWindows[0]?.workspaceId ?? null
  }

  private buildDeepLinkFromRoute(route: string): string {
    const queryStart = route.indexOf('?')
    const routePath = queryStart >= 0 ? route.slice(0, queryStart) : route
    const routeQuery = queryStart >= 0 ? route.slice(queryStart + 1) : ''
    let normalizedPath = routePath.replace(/^\/+/, '')

    const workspaceId = this.resolveLaunchWorkspaceId()
    if (workspaceId && !normalizedPath.startsWith('workspace/')) {
      normalizedPath = `workspace/${encodeURIComponent(workspaceId)}/${normalizedPath}`
    }

    return `${CRAFT_DEEPLINK_SCHEME_PREFIX}${normalizedPath}${routeQuery ? `?${routeQuery}` : ''}`
  }

  private async triggerEmptyStateRouteLaunch(
    instance: BrowserInstance,
    route: string,
    token: string | null,
    source: 'hash' | 'ipc',
  ): Promise<boolean> {
    const dedupeToken = token ?? route
    if (dedupeToken && instance.lastLaunchToken === dedupeToken) {
      mainLog.info(`[browser-pane] ignoring duplicate empty-state launch id=${instance.id} source=${source} token=${dedupeToken}`)
      return false
    }

    instance.lastLaunchToken = dedupeToken
    const deepLink = this.buildDeepLinkFromRoute(route)
    mainLog.info(`[browser-pane] handling empty-state launch id=${instance.id} source=${source} route=${route} deepLink=${deepLink}`)

    await this.handleDeepLinkUrl(deepLink)
    return true
  }

  listInstances(): BrowserInstanceInfo[] {
    const infos: BrowserInstanceInfo[] = []
    for (const instance of this.instances.values()) {
      if (instance.window.isDestroyed()) {
        this.cleanupDestroyedInstance(instance, 'listInstances')
        continue
      }
      infos.push(this.toInfo(instance))
    }
    return infos
  }

  async listInstancesAsync(): Promise<BrowserInstanceInfo[]> {
    return this.listInstances()
  }

  async getInstanceAsync(id: string): Promise<BrowserInstanceSnapshot | undefined> {
    return this.getInstance(id)
  }

  async createForSessionAsync(
    sessionId: string,
    options?: { show?: boolean; workspaceId?: string | null },
  ): Promise<string> {
    return this.createForSession(sessionId, options)
  }

  async getOrCreateForSessionAsync(
    sessionId: string,
    options?: { workspaceId?: string | null },
  ): Promise<string> {
    return this.getOrCreateForSession(sessionId, options)
  }

  async focusBoundForSessionAsync(
    sessionId: string,
    options?: { workspaceId?: string | null },
  ): Promise<string> {
    return this.focusBoundForSession(sessionId, options)
  }

  getWindowCount(): number {
    return this.instances.size
  }

  getBrowserWindows(): BrowserWindow[] {
    return Array.from(this.instances.values())
      .map((instance) => instance.window)
      .filter((win) => !win.isDestroyed())
  }

  async navigate(id: string, url: string): Promise<{ url: string; title: string }> {
    const instance = this.requireAliveInstance(id)

    let normalizedUrl = url.trim()
    const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(normalizedUrl)
    const isAbout = normalizedUrl.startsWith('about:')
    if (!hasScheme && !isAbout) {
      const looksLikeHost = /^(localhost|\d{1,3}(?:\.\d{1,3}){3}|[\w-]+(?:\.[\w-]+)+)(?::\d+)?(?:\/|$)/i.test(normalizedUrl)
      if (looksLikeHost) {
        normalizedUrl = `https://${normalizedUrl}`
      } else {
        normalizedUrl = `https://duckduckgo.com/?q=${encodeURIComponent(normalizedUrl)}`
      }
    }

    if (normalizedUrl !== 'about:blank') {
      let parsed: URL
      try {
        parsed = new URL(normalizedUrl)
      } catch {
        throw new Error('Invalid browser URL.')
      }
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error(`Unsupported browser protocol: ${parsed.protocol}`)
      }
    }

    const timeoutMs = 30_000
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null

    try {
      const loaded = instance.pageView.webContents.loadURL(normalizedUrl)
      const timeout = new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => reject(new Error(`Navigation to "${normalizedUrl}" timed out after ${timeoutMs / 1000}s`)), timeoutMs)
      })
      await Promise.race([loaded, timeout])
      this.pushToolbarState(instance)

      return { url: instance.currentUrl, title: instance.title }
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle)
      }
    }
  }

  async goBack(id: string): Promise<void> {
    const instance = this.requireAliveInstance(id)
    if (instance.pageView.webContents.canGoBack()) {
      instance.pageView.webContents.goBack()
    }
  }

  async goForward(id: string): Promise<void> {
    const instance = this.requireAliveInstance(id)
    if (instance.pageView.webContents.canGoForward()) {
      instance.pageView.webContents.goForward()
    }
  }

  reload(id: string): void {
    const instance = this.instances.get(id)
    if (!instance || instance.window.isDestroyed()) return
    instance.pageView.webContents.reload()
  }

  stop(id: string): void {
    const instance = this.instances.get(id)
    if (!instance || instance.window.isDestroyed()) return
    instance.pageView.webContents.stop()
  }

  focus(id: string): void {
    const instance = this.instances.get(id)
    if (!instance) return

    const win = instance.window
    if (win.isDestroyed()) return

    if (instance.embeddedHostWindow && !instance.embeddedHostWindow.isDestroyed()) {
      instance.pageView.setVisible(true)
      instance.embeddedHostWindow.contentView.addChildView(instance.pageView)
      this.updateNativeOverlayState(instance)
      instance.pageView.webContents.focus()
      instance.isVisible = true
      this.emitStateChange(instance)
      return
    }

    // If toolbar hasn't painted yet, defer showing until markToolbarReady runs.
    // Token guard prevents stale deferred focus from showing after hide/destroy.
    if (!instance.toolbarReady) {
      if (instance.pendingShowOnReady) return
      instance.pendingShowOnReady = true
      const token = ++instance.pendingShowToken
      mainLog.info(`[browser-pane] focus deferred until ready id=${instance.id} token=${token}`)
      return
    }

    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()

    instance.isVisible = true
    this.emitStateChange(instance)
  }

  /** Embed the live page directly in the requesting Craft window. */
  setEmbeddedBounds(id: string, hostWebContentsId: number, bounds: BrowserPaneBounds): void {
    const instance = this.requireAliveInstance(id)
    const hostWindow = this.windowManager?.getWindowByWebContentsId(hostWebContentsId)
    if (!hostWindow || hostWindow.isDestroyed()) {
      throw new Error(`Browser embed host not found: ${hostWebContentsId}`)
    }

    const attachedToNewHost = instance.embeddedHostWebContentsId !== hostWebContentsId
    if (attachedToNewHost) {
      this.detachPageViews(instance)
      instance.embeddedHostWebContentsId = hostWebContentsId
      instance.embeddedHostWindow = hostWindow
      instance.isVisible = false
      if (!instance.window.isDestroyed()) instance.window.contentView.removeChildView(instance.toolbarView)
      hostWindow.contentView.addChildView(instance.pageView)
      hostWindow.contentView.addChildView(instance.nativeOverlayView)
      hostWindow.contentView.addChildView(instance.toolbarView)
      instance.pageView.setBorderRadius(EMBEDDED_VIEW_RADIUS)
      instance.nativeOverlayView.setBorderRadius(EMBEDDED_VIEW_RADIUS)
      instance.toolbarView.setBorderRadius(EMBEDDED_VIEW_RADIUS)
      if (!instance.window.isDestroyed()) instance.window.hide()
      this.forceCloseToolbarMenu(instance, 'embedded-attach')
      void this.loadToolbarPage(instance)
    }

    if (![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)) {
      throw new Error('Browser embed bounds must contain finite numbers.')
    }
    const contentBounds = hostWindow.getContentBounds()
    const zoomFactor = hostWindow.webContents.getZoomFactor?.() || 1
    const contentWidth = Math.max(1, contentBounds.width)
    const contentHeight = Math.max(1, contentBounds.height)
    const x = Math.max(0, Math.min(contentWidth - 1, Math.round(bounds.x * zoomFactor)))
    const y = Math.max(0, Math.min(contentHeight - 1, Math.round(bounds.y * zoomFactor)))
    const width = Math.max(1, Math.min(contentWidth - x, Math.round(bounds.width * zoomFactor)))
    const height = Math.max(1, Math.min(contentHeight - y, Math.round(bounds.height * zoomFactor)))
    const nextBounds = {
      x,
      y,
      width,
      height,
    }

    const previousBounds = instance.embeddedBounds
    if (
      !attachedToNewHost
      && instance.embeddedHostWindow === hostWindow
      && previousBounds
      && previousBounds.x === nextBounds.x
      && previousBounds.y === nextBounds.y
      && previousBounds.width === nextBounds.width
      && previousBounds.height === nextBounds.height
    ) {
      return
    }

    instance.embeddedHostWindow = hostWindow
    instance.embeddedBounds = nextBounds
    instance.pageView.setBounds(nextBounds)
    instance.pageView.setBorderRadius(EMBEDDED_VIEW_RADIUS)
    this.layoutEmbeddedToolbar(instance)
    if (instance.agentControl?.active || instance.toolbarMenuOverlayActive) {
      instance.nativeOverlayView.setBounds(nextBounds)
      instance.nativeOverlayView.setBorderRadius(EMBEDDED_VIEW_RADIUS)
    }
  }

  /** Show or hide an embedded tab without changing its navigation state. */
  setEmbeddedVisible(id: string, hostWebContentsId: number, visible: boolean): void {
    const instance = this.requireAliveInstance(id)
    if (instance.embeddedHostWebContentsId !== hostWebContentsId) return
    if (instance.isVisible === visible) return

    if (visible) {
      instance.pageView.setVisible(true)
      instance.embeddedHostWindow?.contentView.addChildView(instance.pageView)
      instance.isVisible = true
      if (process.platform === 'win32' && this.isBrowserEmptyStateUrl(instance.pageView.webContents.getURL())) {
        instance.embeddedHostWindow?.focus()
        instance.pageView.webContents.focus()
      }
    } else {
      instance.pageView.setVisible(false)
      instance.nativeOverlayView.setVisible(false)
      instance.isVisible = false
    }
    this.layoutEmbeddedToolbar(instance)
    this.updateNativeOverlayState(instance)
    this.emitStateChange(instance)
  }

  setEmbeddedToolbarMode(id: string, hostWebContentsId: number, mode: 'fixed' | 'floating'): void {
    const instance = this.requireAliveInstance(id)
    if (instance.embeddedHostWebContentsId !== hostWebContentsId) return
    if (instance.embeddedToolbarMode === mode) return

    instance.embeddedToolbarMode = mode
    instance.embeddedToolbarRevealed = false
    this.layoutEmbeddedToolbar(instance)
    this.pushToolbarState(instance)
    this.emitStateChange(instance)
  }

  loadWorkspaceState(workspaceId: string): BrowserWorkspaceSnapshot {
    return this.profileStore.loadWorkspaceState(workspaceId)
  }

  saveWorkspaceState(workspaceId: string, snapshot: BrowserWorkspaceSnapshot): void {
    if (!workspaceId) return
    this.profileStore.saveWorkspaceState(workspaceId, snapshot)
  }

  hide(id: string): void {
    const instance = this.instances.get(id)
    if (!instance) return

    // Re-entrancy guard for standalone shell teardown.
    if (instance.isHiding) return

    const win = instance.window
    if (win.isDestroyed()) return

    if (instance.embeddedHostWindow) {
      instance.pageView.setVisible(false)
      instance.nativeOverlayView.setVisible(false)
      instance.isVisible = false
      this.emitStateChange(instance)
      return
    }

    instance.isHiding = true

    // Cancel any deferred show request queued before toolbar was ready.
    if (instance.pendingShowOnReady) {
      instance.pendingShowOnReady = false
      instance.pendingShowToken += 1
    }

    this.forceCloseToolbarMenu(instance, 'window-hide')

    // Cancel an in-flight page load before hiding the standalone shell.
    if (instance.isLoading) {
      try {
        const pageWc = instance.pageView.webContents
        if (!pageWc.isDestroyed()) pageWc.stop()
      } catch (error) {
        mainLog.warn(`[browser-pane] failed to stop page load before hide id=${id}: ${(error as Error)?.message ?? error}`)
      }
    }

    win.hide()

    instance.isVisible = false

    // Defer the state-change callback until native window teardown completes.
    queueMicrotask(() => {
      instance.isHiding = false
      this.emitStateChange(instance)
    })
  }

  async getAccessibilitySnapshot(id: string): Promise<AccessibilitySnapshot> {
    const instance = this.requireAliveInstance(id)
    return instance.cdp.getAccessibilitySnapshot()
  }

  async clickAtCoordinates(id: string, x: number, y: number): Promise<void> {
    const instance = this.requireAliveInstance(id)

    try {
      await instance.cdp.clickAtCoordinates(x, y)
      instance.lastAction = {
        tool: 'browser_click_at',
        status: 'succeeded',
        timestamp: Date.now(),
      }
    } catch (error) {
      instance.lastAction = {
        tool: 'browser_click_at',
        status: 'failed',
        timestamp: Date.now(),
      }
      throw error
    }
  }

  async drag(id: string, x1: number, y1: number, x2: number, y2: number): Promise<void> {
    const instance = this.requireAliveInstance(id)

    try {
      await instance.cdp.drag(x1, y1, x2, y2)
      instance.lastAction = {
        tool: 'browser_drag',
        status: 'succeeded',
        timestamp: Date.now(),
      }
    } catch (error) {
      instance.lastAction = {
        tool: 'browser_drag',
        status: 'failed',
        timestamp: Date.now(),
      }
      throw error
    }
  }

  async typeText(id: string, text: string): Promise<void> {
    const instance = this.requireAliveInstance(id)

    try {
      await instance.cdp.typeText(text)
      instance.lastAction = {
        tool: 'browser_type',
        status: 'succeeded',
        timestamp: Date.now(),
      }
    } catch (error) {
      instance.lastAction = {
        tool: 'browser_type',
        status: 'failed',
        timestamp: Date.now(),
      }
      throw error
    }
  }

  async setClipboard(id: string, text: string): Promise<void> {
    const instance = this.requireAliveInstance(id)
    await instance.cdp.setClipboard(text)
  }

  async getClipboard(id: string): Promise<string> {
    const instance = this.requireAliveInstance(id)
    return instance.cdp.getClipboard()
  }

  async clickElement(
    id: string,
    ref: string,
    options?: { waitFor?: 'none' | 'navigation' | 'network-idle'; timeoutMs?: number }
  ): Promise<void> {
    const instance = this.requireAliveInstance(id)

    try {
      const geometry = await instance.cdp.clickElement(ref)
      instance.lastAction = {
        tool: 'browser_click',
        ref,
        status: 'succeeded',
        geometry,
        timestamp: Date.now(),
      }

      const waitFor = options?.waitFor ?? 'none'
      if (waitFor === 'navigation') {
        const timeoutMs = Math.max(100, options?.timeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS)
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => {
            cleanup()
            reject(new Error(
              `Click navigation wait timed out after ${timeoutMs}ms (no navigation event observed). `
              + `Tip: retry with "click ${ref}" (no navigation wait), then use "wait url <pattern>" or "wait network-idle".`
            ))
          }, timeoutMs)

          const onNav = () => {
            cleanup()
            resolve()
          }

          const cleanup = () => {
            clearTimeout(timer)
            instance.pageView.webContents.removeListener('did-navigate', onNav)
            instance.pageView.webContents.removeListener('did-navigate-in-page', onNav)
          }

          instance.pageView.webContents.once('did-navigate', onNav)
          instance.pageView.webContents.once('did-navigate-in-page', onNav)
        })
      } else if (waitFor === 'network-idle') {
        await this.waitFor(id, { kind: 'network-idle', timeoutMs: options?.timeoutMs })
      }
    } catch (error) {
      instance.lastAction = {
        tool: 'browser_click',
        ref,
        status: 'failed',
        timestamp: Date.now(),
      }
      throw error
    }
  }

  async fillElement(id: string, ref: string, value: string): Promise<void> {
    const instance = this.requireAliveInstance(id)

    try {
      const geometry = await instance.cdp.fillElement(ref, value)
      instance.lastAction = {
        tool: 'browser_fill',
        ref,
        status: 'succeeded',
        geometry,
        timestamp: Date.now(),
      }
    } catch (error) {
      instance.lastAction = {
        tool: 'browser_fill',
        ref,
        status: 'failed',
        timestamp: Date.now(),
      }
      throw error
    }
  }

  async selectOption(id: string, ref: string, value: string): Promise<void> {
    const instance = this.requireAliveInstance(id)

    try {
      const geometry = await instance.cdp.selectOption(ref, value)
      instance.lastAction = {
        tool: 'browser_select',
        ref,
        status: 'succeeded',
        geometry,
        timestamp: Date.now(),
      }
    } catch (error) {
      instance.lastAction = {
        tool: 'browser_select',
        ref,
        status: 'failed',
        timestamp: Date.now(),
      }
      throw error
    }
  }

  private suspendOverlayForCapture(instance: BrowserInstance): boolean {
    const shouldSuspend = !!instance.agentControl?.active
      && instance.nativeOverlayReady

    if (!shouldSuspend) return false

    instance.nativeOverlayView.setBounds({ x: 0, y: 0, width: 0, height: 0 })
    return true
  }

  private restoreOverlayAfterCapture(instance: BrowserInstance, suspended: boolean): void {
    if (!suspended) return
    this.updateNativeOverlayState(instance)
  }

  async screenshot(id: string, options?: BrowserScreenshotOptions): Promise<BrowserScreenshotResult> {
    const instance = this.requireAliveInstance(id)

    // Hide native agent overlay so it doesn't appear in captures
    const suspendedOverlay = this.suspendOverlayForCapture(instance)

    try {
      // When annotating, force agent mode and gather refs from accessibility tree
      const annotate = !!options?.annotate
      const mode = (annotate || options?.mode === 'agent') ? 'agent' : 'raw'

      if (mode === 'raw') {
        const viewport = await instance.cdp.getViewportMetrics()
        const captured = await this.capturePageWithRecovery(instance, {
          mode,
          errorPrefix: 'screenshot',
          dpr: viewport.dpr,
          format: options?.format,
          jpegQuality: options?.jpegQuality,
        })

        return {
          imageBuffer: captured.imageBuffer,
          imageFormat: captured.imageFormat,
          metadata: options?.includeMetadata
            ? {
              mode: 'raw',
              warnings: captured.warnings.length > 0 ? captured.warnings : undefined,
            }
            : undefined,
        }
      }

      const warnings: string[] = []
      const geometries: ElementGeometry[] = []

      const MAX_ANNOTATED_REFS = 100
      let refs = options?.refs ?? []

      if (annotate) {
        try {
          const snapshot = await instance.cdp.getAccessibilitySnapshot()
          refs = snapshot.nodes.map((node) => node.ref).slice(0, MAX_ANNOTATED_REFS)
          if (snapshot.nodes.length > MAX_ANNOTATED_REFS) {
            warnings.push(`Annotation capped at ${MAX_ANNOTATED_REFS} of ${snapshot.nodes.length} elements`)
          }
        } catch (error) {
          warnings.push(`Accessibility snapshot for annotation failed: ${error instanceof Error ? error.message : String(error)}`)
          refs = []
        }
      }

      const settled = await Promise.allSettled(
        refs.map((ref) => instance.cdp.getElementGeometry(ref)),
      )

      for (let i = 0; i < settled.length; i++) {
        const result = settled[i]!
        if (result.status === 'fulfilled') {
          geometries.push(result.value)
        } else if (!annotate) {
          const reason = result.reason instanceof Error ? result.reason.message : String(result.reason)
          warnings.push(`Could not resolve ref ${refs[i]}: ${reason}`)
        }
      }

      if (options?.includeLastAction && instance.lastAction?.geometry) {
        geometries.push(instance.lastAction.geometry)
      }

      const metadataText = instance.lastAction
        ? `${instance.lastAction.tool} • ${instance.lastAction.status} • ${new Date(instance.lastAction.timestamp).toISOString()}`
        : `browser_screenshot • ${new Date().toISOString()}`

      let annotationPartial = false

      try {
        if (geometries.length > 0 || options?.includeMetadata) {
          await instance.cdp.renderTemporaryOverlay({
            geometries,
            includeMetadata: !!options?.includeMetadata,
            metadataText,
            includeClickPoints: true,
          })
        }
      } catch (error) {
        annotationPartial = true
        warnings.push(`Annotation overlay failed: ${error instanceof Error ? error.message : String(error)}`)
      }

      try {
        const viewport = await instance.cdp.getViewportMetrics()
        const captured = await this.capturePageWithRecovery(instance, {
          mode,
          errorPrefix: 'screenshot',
          dpr: viewport.dpr,
          format: options?.format,
          jpegQuality: options?.jpegQuality,
        })

        if (captured.warnings.length > 0) {
          warnings.push(...captured.warnings)
        }

        return {
          imageBuffer: captured.imageBuffer,
          imageFormat: captured.imageFormat,
          metadata: {
            mode: 'agent',
            viewport,
            targets: geometries.map((g) => ({
              ref: g.ref,
              role: g.role,
              name: g.name,
              box: g.box,
              clickPoint: g.clickPoint,
            })),
            action: instance.lastAction
              ? {
                tool: instance.lastAction.tool,
                ref: instance.lastAction.ref,
                status: instance.lastAction.status,
                timestamp: instance.lastAction.timestamp,
              }
              : undefined,
            annotationPartial,
            warnings: warnings.length > 0 ? warnings : undefined,
          },
        }
      } finally {
        try {
          await instance.cdp.clearTemporaryOverlay()
        } catch {
          // ignore cleanup errors
        }
      }
    } finally {
      this.restoreOverlayAfterCapture(instance, suspendedOverlay)
    }
  }

  async screenshotRegion(id: string, target: BrowserScreenshotRegionTarget): Promise<BrowserScreenshotResult> {
    const instance = this.instances.get(id)
    if (!instance) throw new Error(`Browser instance not found: ${id}`)

    const hasCoords = [target.x, target.y, target.width, target.height].every((v) => typeof v === 'number')
    const hasRef = typeof target.ref === 'string' && target.ref.length > 0
    const hasSelector = typeof target.selector === 'string' && target.selector.length > 0

    const modeCount = [hasCoords, hasRef, hasSelector].filter(Boolean).length
    if (modeCount === 0) {
      throw new Error('Region screenshot requires either coordinates, ref, or selector')
    }
    if (modeCount > 1) {
      throw new Error('Region screenshot target is ambiguous. Provide only one of coordinates, ref, or selector')
    }

    const suspendedOverlay = this.suspendOverlayForCapture(instance)

    try {
      let box: { x: number; y: number; width: number; height: number }

      if (hasRef) {
        const geometry = await instance.cdp.getElementGeometry(String(target.ref))
        box = { ...geometry.box }
      } else if (hasSelector) {
        const geometry = await instance.cdp.getElementGeometryBySelector(String(target.selector))
        box = { ...geometry.box }
      } else {
        box = {
          x: Number(target.x),
          y: Number(target.y),
          width: Number(target.width),
          height: Number(target.height),
        }
      }

      const padding = Math.max(0, Number(target.padding ?? 0))
      box = {
        x: box.x - padding,
        y: box.y - padding,
        width: box.width + padding * 2,
        height: box.height + padding * 2,
      }

      const viewport = await instance.cdp.getViewportMetrics()

      const clippedX = Math.max(0, Math.floor(box.x))
      const clippedY = Math.max(0, Math.floor(box.y))
      const maxWidth = Math.max(0, Math.floor(viewport.width - clippedX))
      const maxHeight = Math.max(0, Math.floor(viewport.height - clippedY))
      const clippedWidth = Math.min(Math.max(1, Math.floor(box.width)), maxWidth)
      const clippedHeight = Math.min(Math.max(1, Math.floor(box.height)), maxHeight)

      if (maxWidth <= 0 || maxHeight <= 0 || clippedWidth <= 0 || clippedHeight <= 0) {
        throw new Error('Resolved screenshot region is outside the current viewport')
      }

      const captured = await this.capturePageWithRecovery(instance, {
        mode: 'region',
        errorPrefix: 'region screenshot',
        rect: {
          x: clippedX,
          y: clippedY,
          width: clippedWidth,
          height: clippedHeight,
        },
        dpr: viewport.dpr,
        format: target.format,
        jpegQuality: target.jpegQuality,
      })

      return {
        imageBuffer: captured.imageBuffer,
        imageFormat: captured.imageFormat,
        metadata: {
          mode: 'raw',
          viewport,
          region: {
            x: clippedX,
            y: clippedY,
            width: clippedWidth,
            height: clippedHeight,
          },
          targetMode: hasRef ? 'ref' : hasSelector ? 'selector' : 'coords',
          warnings: captured.warnings.length > 0 ? captured.warnings : undefined,
        },
      }
    } finally {
      this.restoreOverlayAfterCapture(instance, suspendedOverlay)
    }
  }

  private async capturePageWithRecovery(
    instance: BrowserInstance,
    options: {
      mode: 'raw' | 'agent' | 'region'
      errorPrefix: 'screenshot' | 'region screenshot'
      rect?: { x: number; y: number; width: number; height: number }
      dpr?: number
      format?: 'png' | 'jpeg'
      jpegQuality?: number
    },
  ): Promise<{ imageBuffer: Buffer; imageFormat: 'png' | 'jpeg'; warnings: string[] }> {
    let rescueUsed = false
    let sawDisplaySurfaceUnavailable = false
    const warnings: string[] = []
    const imageOpts = { dpr: options.dpr, format: options.format, jpegQuality: options.jpegQuality }

    for (let attempt = 1; attempt <= SCREENSHOT_HIDDEN_CAPTURE_ATTEMPTS; attempt += 1) {
      let result: { buffer: Buffer; format: 'png' | 'jpeg' } | null = null
      try {
        result = await this.capturePageImage(instance, {
          rect: options.rect,
          useHiddenCaptureOptions: true,
          ...imageOpts,
        })
      } catch (error) {
        if (this.isDisplaySurfaceUnavailableError(error)) {
          sawDisplaySurfaceUnavailable = true
          mainLog.warn(
            `[browser-pane] ${options.errorPrefix} display surface unavailable instance=${instance.id} mode=${options.mode} attempt=${attempt}/${SCREENSHOT_HIDDEN_CAPTURE_ATTEMPTS} visible=${instance.isVisible} url=${instance.currentUrl}`,
          )
        } else {
          throw error
        }
      }

      if (result) {
        if (attempt > 1) {
          warnings.push(`Capture recovered after ${attempt} hidden attempt${attempt === 1 ? '' : 's'}.`)
        }
        return { imageBuffer: result.buffer, imageFormat: result.format, warnings }
      }

      mainLog.warn(
        `[browser-pane] ${options.errorPrefix} empty capture attempt instance=${instance.id} mode=${options.mode} attempt=${attempt}/${SCREENSHOT_HIDDEN_CAPTURE_ATTEMPTS} visible=${instance.isVisible} isLoading=${instance.isLoading} url=${instance.currentUrl}`,
      )

      if (attempt < SCREENSHOT_HIDDEN_CAPTURE_ATTEMPTS) {
        await this.waitForScreenshotReadiness(instance.id)
      }
    }

    const window = instance.window
    const wasVisible = instance.isVisible

    if (!window.isDestroyed()) {
      try {
        if (!wasVisible) {
          if (window.isMinimized()) {
            window.restore()
          }
          window.showInactive()
          instance.isVisible = true
          this.emitStateChange(instance)
          rescueUsed = true
          await this.sleep(SCREENSHOT_RESCUE_PAINT_DELAY_MS)
          await this.waitForScreenshotReadiness(instance.id)
        }

        let rescueResult: { buffer: Buffer; format: 'png' | 'jpeg' } | null = null
        try {
          rescueResult = await this.capturePageImage(instance, {
            rect: options.rect,
            useHiddenCaptureOptions: false,
            ...imageOpts,
          })
        } catch (error) {
          if (this.isDisplaySurfaceUnavailableError(error)) {
            sawDisplaySurfaceUnavailable = true
            mainLog.warn(
              `[browser-pane] ${options.errorPrefix} display surface unavailable during rescue instance=${instance.id} mode=${options.mode} visible=${instance.isVisible} url=${instance.currentUrl}`,
            )
          } else {
            throw error
          }
        }

        if (rescueResult) {
          if (rescueUsed) {
            warnings.push('Capture required temporary inactive reveal for rendering; browser visibility was restored immediately.')
          }
          return { imageBuffer: rescueResult.buffer, imageFormat: rescueResult.format, warnings }
        }
      } finally {
        if (!wasVisible && !window.isDestroyed()) {
          window.hide()
          instance.isVisible = false
          this.emitStateChange(instance)
        }
      }
    }

    mainLog.warn(
      `[browser-pane] ${options.errorPrefix} capture failed after recovery instance=${instance.id} mode=${options.mode} visible=${instance.isVisible} isLoading=${instance.isLoading} url=${instance.currentUrl} rescueUsed=${rescueUsed}`,
    )

    if (sawDisplaySurfaceUnavailable) {
      throw new Error(
        `Failed to capture ${options.errorPrefix}: current display surface is unavailable. `
        + `Try focusing the browser window first ("focus ${instance.id}" or "open --foreground") and retry.`
      )
    }

    throw new Error(`Failed to capture ${options.errorPrefix}: empty image buffer`)
  }

  private isDisplaySurfaceUnavailableError(error: unknown): boolean {
    if (!(error instanceof Error)) return false
    return error.message.toLowerCase().includes('current display surface not available for capture')
  }

  private async capturePageImage(
    instance: BrowserInstance,
    options: {
      rect?: { x: number; y: number; width: number; height: number }
      useHiddenCaptureOptions: boolean
      dpr?: number
      format?: 'png' | 'jpeg'
      jpegQuality?: number
    },
  ): Promise<{ buffer: Buffer; format: 'png' | 'jpeg' } | null> {
    const captureOpts = options.useHiddenCaptureOptions
      ? { stayHidden: true, stayAwake: true }
      : undefined

    let image = options.rect
      ? await instance.pageView.webContents.capturePage(options.rect, captureOpts)
      : await instance.pageView.webContents.capturePage(undefined, captureOpts)

    if (image.isEmpty()) {
      return null
    }

    // Downscale from device pixels to CSS pixels so screenshot coordinates
    // match click-at viewport coordinates (uses Skia Lanczos via 'best')
    const dpr = options.dpr ?? 1
    if (dpr > 1) {
      const size = image.getSize()
      image = image.resize({
        width: Math.round(size.width / dpr),
        height: Math.round(size.height / dpr),
        quality: 'best',
      })
    }

    const fmt = options.format ?? 'png'
    const encoded = fmt === 'jpeg'
      ? image.toJPEG(options.jpegQuality ?? 80)
      : image.toPNG()

    if (!encoded || encoded.length === 0) {
      return null
    }

    return { buffer: encoded, format: fmt }
  }

  private async waitForScreenshotReadiness(instanceId: string): Promise<void> {
    try {
      await this.waitFor(instanceId, {
        kind: 'network-idle',
        timeoutMs: SCREENSHOT_NETWORK_IDLE_TIMEOUT_MS,
        idleMs: SCREENSHOT_NETWORK_IDLE_MS,
      })
    } catch {
      // network-idle can fail on continuously active pages; still proceed after bounded delay
    }

    await this.sleep(SCREENSHOT_RETRY_DELAY_MS)
  }

  getConsoleLogs(id: string, options?: BrowserConsoleOptions): BrowserConsoleEntry[] {
    const instance = this.requireAliveInstance(id)

    const level = options?.level ?? 'all'
    const limit = Math.max(1, Math.min(500, Number(options?.limit ?? 50)))

    const filtered = level === 'all'
      ? instance.consoleLogs
      : instance.consoleLogs.filter((entry) => entry.level === level)

    return filtered.slice(-limit)
  }

  getNetworkLogs(id: string, options?: BrowserNetworkOptions): BrowserNetworkEntry[] {
    const instance = this.requireAliveInstance(id)

    const statusFilter = options?.status ?? 'all'
    const limit = Math.max(1, Math.min(500, Number(options?.limit ?? 50)))
    const method = options?.method?.toUpperCase()
    const resourceType = options?.resourceType?.toLowerCase()

    const filtered = instance.networkLogs.filter((entry) => {
      if (method && entry.method !== method) return false
      if (resourceType && entry.resourceType.toLowerCase() !== resourceType) return false

      if (statusFilter === 'all') return true
      if (statusFilter === 'failed') return !entry.ok
      if (statusFilter === '2xx') return entry.status >= 200 && entry.status < 300
      if (statusFilter === '3xx') return entry.status >= 300 && entry.status < 400
      if (statusFilter === '4xx') return entry.status >= 400 && entry.status < 500
      if (statusFilter === '5xx') return entry.status >= 500 && entry.status < 600
      return true
    })

    return filtered.slice(-limit)
  }

  async waitFor(id: string, args: BrowserWaitArgs): Promise<BrowserWaitResult> {
    const instance = this.requireAliveInstance(id)

    const timeoutMs = Math.max(100, args.timeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS)
    const pollMs = Math.max(25, args.pollMs ?? DEFAULT_WAIT_POLL_MS)
    const idleMs = Math.max(100, args.idleMs ?? 700)
    const started = Date.now()

    const until = async (predicate: () => Promise<boolean>, detail: string): Promise<BrowserWaitResult> => {
      while (Date.now() - started <= timeoutMs) {
        if (await predicate()) {
          return {
            ok: true,
            kind: args.kind,
            elapsedMs: Date.now() - started,
            detail,
          }
        }
        await this.sleep(pollMs)
      }
      throw new Error(`Wait timed out after ${timeoutMs}ms (${args.kind})`)
    }

    if (args.kind === 'selector') {
      const selector = args.value?.trim()
      if (!selector) throw new Error('browser_wait selector requires value')
      return until(async () => {
        const exists = await instance.pageView.webContents.executeJavaScript(
          `Boolean(document.querySelector(${JSON.stringify(selector)}))`
        )
        return Boolean(exists)
      }, `selector matched: ${selector}`)
    }

    if (args.kind === 'text') {
      const text = args.value?.trim()
      if (!text) throw new Error('browser_wait text requires value')
      return until(async () => {
        const found = await instance.pageView.webContents.executeJavaScript(
          `document.body && document.body.innerText && document.body.innerText.includes(${JSON.stringify(text)})`
        )
        return Boolean(found)
      }, `text found: ${text}`)
    }

    if (args.kind === 'url') {
      const needle = args.value?.trim()
      if (!needle) throw new Error('browser_wait url requires value')
      return until(async () => {
        return instance.currentUrl.includes(needle)
      }, `url matched: ${needle}`)
    }

    if (args.kind === 'network-idle') {
      const wcId = instance.pageView.webContents.id
      return until(async () => {
        const inflight = this.inFlightRequestsByWebContentsId.get(wcId) ?? 0
        const last = this.lastNetworkActivityByWebContentsId.get(wcId) ?? started
        return inflight === 0 && (Date.now() - last) >= idleMs
      }, `network idle for ${idleMs}ms`)
    }

    throw new Error(`Unknown wait kind: ${args.kind}`)
  }

  async sendKey(id: string, args: BrowserKeyArgs): Promise<void> {
    const instance = this.requireAliveInstance(id)

    const key = args.key?.trim()
    if (!key) throw new Error('browser_key requires key')

    const modifiers = (args.modifiers ?? []) as Array<'shift' | 'control' | 'alt' | 'meta'>

    instance.pageView.webContents.sendInputEvent({
      type: 'keyDown',
      keyCode: key,
      modifiers,
    } as any)
    instance.pageView.webContents.sendInputEvent({
      type: 'keyUp',
      keyCode: key,
      modifiers,
    } as any)
  }

  async getDownloads(id: string, options?: BrowserDownloadOptions): Promise<BrowserDownloadEntry[]> {
    const instance = this.requireAliveInstance(id)

    const action = options?.action ?? 'list'
    const limit = Math.max(1, Math.min(200, Number(options?.limit ?? 20)))

    if (action === 'wait') {
      const timeoutMs = Math.max(100, Number(options?.timeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS))
      const started = Date.now()
      while (Date.now() - started <= timeoutMs) {
        const hasTerminal = instance.downloads.some((d) => d.state === 'completed' || d.state === 'interrupted' || d.state === 'cancelled')
        if (hasTerminal) break
        await this.sleep(100)
      }
    }

    return instance.downloads.slice(-limit)
  }

  listBookmarks(workspaceId: string | null): BrowserBookmarkEntry[] {
    return this.profileStore.listBookmarks(workspaceId)
  }

  addBookmark(workspaceId: string | null, input: { url: string; title: string; favicon?: string | null; folderId?: string | null }): BrowserBookmarkEntry {
    const parsed = new URL(input.url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('Only HTTP(S) pages can be bookmarked.')
    }
    return this.profileStore.addBookmark({
      id: randomUUID(),
      workspaceId,
      url: parsed.toString(),
      title: input.title.trim() || parsed.hostname,
      favicon: input.favicon ?? null,
      folderId: input.folderId ?? null,
      createdAt: Date.now(),
    })
  }

  updateBookmark(
    workspaceId: string | null,
    id: string,
    changes: { title?: string; folderId?: string | null },
  ): BrowserBookmarkEntry {
    const next = { ...changes }
    if (next.title !== undefined) {
      next.title = next.title.trim()
      if (!next.title) throw new Error('Bookmark title cannot be empty.')
    }
    if (next.folderId) {
      const exists = this.profileStore.listBookmarkFolders(workspaceId).some((folder) => folder.id === next.folderId)
      if (!exists) throw new Error('Bookmark folder not found.')
    }
    return this.profileStore.updateBookmark(workspaceId, id, next)
  }

  removeBookmark(workspaceId: string | null, idOrUrl: string): void {
    this.profileStore.removeBookmark(workspaceId, idOrUrl)
  }

  listBookmarkFolders(workspaceId: string | null): BrowserBookmarkFolder[] {
    return this.profileStore.listBookmarkFolders(workspaceId)
  }

  createBookmarkFolder(workspaceId: string | null, name: string): BrowserBookmarkFolder {
    const normalizedName = name.trim().slice(0, 120)
    if (!normalizedName) throw new Error('Folder name cannot be empty.')
    return this.profileStore.createBookmarkFolder({
      id: randomUUID(),
      workspaceId,
      name: normalizedName,
      createdAt: Date.now(),
    })
  }

  renameBookmarkFolder(workspaceId: string | null, id: string, name: string): BrowserBookmarkFolder {
    const normalizedName = name.trim().slice(0, 120)
    if (!normalizedName) throw new Error('Folder name cannot be empty.')
    return this.profileStore.renameBookmarkFolder(workspaceId, id, normalizedName)
  }

  removeBookmarkFolder(workspaceId: string | null, id: string): void {
    this.profileStore.removeBookmarkFolder(workspaceId, id)
  }

  async exportBookmarks(workspaceId: string | null): Promise<{ canceled: boolean; path?: string; exported: number }> {
    const bookmarks = this.profileStore.listBookmarks(workspaceId)
    const folders = this.profileStore.listBookmarkFolders(workspaceId)
    const result = await dialog.showSaveDialog({
      title: 'Export bookmarks',
      defaultPath: join(app.getPath('documents'), 'craft-agents-bookmarks.html'),
      filters: [{ name: 'Bookmarks HTML', extensions: ['html'] }],
    })
    if (result.canceled || !result.filePath) return { canceled: true, exported: 0 }

    const lines = [
      '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
      '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
      '<TITLE>Bookmarks</TITLE>',
      '<H1>Bookmarks</H1>',
      '<DL><p>',
    ]
    const appendBookmark = (bookmark: BrowserBookmarkEntry, indent: string) => {
      const icon = bookmark.favicon ? ` ICON="${escapeBookmarkHtml(bookmark.favicon)}"` : ''
      lines.push(`${indent}<DT><A HREF="${escapeBookmarkHtml(bookmark.url)}" ADD_DATE="${Math.floor(bookmark.createdAt / 1_000)}"${icon}>${escapeBookmarkHtml(bookmark.title)}</A>`)
    }
    for (const bookmark of bookmarks.filter((entry) => !entry.folderId)) appendBookmark(bookmark, '  ')
    for (const folder of folders) {
      lines.push(`  <DT><H3 ADD_DATE="${Math.floor(folder.createdAt / 1_000)}">${escapeBookmarkHtml(folder.name)}</H3>`)
      lines.push('  <DL><p>')
      for (const bookmark of bookmarks.filter((entry) => entry.folderId === folder.id)) appendBookmark(bookmark, '    ')
      lines.push('  </DL><p>')
    }
    lines.push('</DL><p>')
    writeFileSync(result.filePath, `${lines.join('\n')}\n`, 'utf8')
    return { canceled: false, path: result.filePath, exported: bookmarks.length }
  }

  async importBookmarks(workspaceId: string | null): Promise<{ canceled: boolean; imported: number; skipped: number }> {
    const result = await dialog.showOpenDialog({
      title: 'Import bookmarks',
      properties: ['openFile'],
      filters: [{ name: 'Bookmarks HTML', extensions: ['html', 'htm'] }],
    })
    if (result.canceled || !result.filePaths[0]) return { canceled: true, imported: 0, skipped: 0 }

    const html = readFileSync(result.filePaths[0], 'utf8')
    const tokens = html.match(/<DT>\s*<H3\b[^>]*>[\s\S]*?<\/H3>|<DT>\s*<A\b[^>]*>[\s\S]*?<\/A>|<DL\b[^>]*>|<\/DL>/gi) ?? []
    const folderStack: Array<BrowserBookmarkFolder | null> = []
    let pendingFolder: BrowserBookmarkFolder | null = null
    let imported = 0
    let skipped = 0
    for (const token of tokens) {
      const folderMatch = token.match(/<H3\b[^>]*>([\s\S]*?)<\/H3>/i)
      if (folderMatch) {
        const rawName = decodeBookmarkHtml(folderMatch[1].replace(/<[^>]+>/g, '')).trim()
        const parentNames = folderStack.filter((entry): entry is BrowserBookmarkFolder => Boolean(entry)).map((entry) => entry.name)
        const name = [...parentNames, rawName].filter(Boolean).join(' / ').slice(0, 120)
        pendingFolder = name ? this.createBookmarkFolder(workspaceId, name) : null
        continue
      }
      if (/^<DL\b/i.test(token)) {
        folderStack.push(pendingFolder)
        pendingFolder = null
        continue
      }
      if (/^<\/DL/i.test(token)) {
        folderStack.pop()
        continue
      }
      const anchorMatch = token.match(/(<A\b[^>]*>)([\s\S]*?)<\/A>/i)
      if (!anchorMatch) continue
      const url = readHtmlAttribute(anchorMatch[1], 'HREF')
      if (!url) { skipped += 1; continue }
      try {
        const parsed = new URL(url)
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') { skipped += 1; continue }
        const title = decodeBookmarkHtml(anchorMatch[2].replace(/<[^>]+>/g, '')).trim() || parsed.hostname
        const favicon = readHtmlAttribute(anchorMatch[1], 'ICON')
        const folder = [...folderStack].reverse().find(Boolean) ?? null
        this.addBookmark(workspaceId, { url, title, favicon, folderId: folder?.id ?? null })
        imported += 1
      } catch {
        skipped += 1
      }
    }
    return { canceled: false, imported, skipped }
  }

  listHistory(workspaceId: string | null, limit?: number): BrowserHistoryEntry[] {
    return this.profileStore.listHistory(workspaceId, limit)
  }

  clearHistory(workspaceId: string | null): void {
    this.profileStore.clearHistory(workspaceId)
  }

  removeHistoryEntry(workspaceId: string | null, id: string): void {
    this.profileStore.removeHistoryEntry(workspaceId, id)
  }

  listBrowserDownloads(workspaceId: string | null, limit?: number): BrowserDownloadRecord[] {
    return this.profileStore.listDownloads(workspaceId, limit)
  }

  clearBrowserDownloads(workspaceId: string | null): void {
    this.profileStore.clearDownloads(workspaceId)
  }

  async openBrowserDownload(workspaceId: string | null, id: string): Promise<void> {
    const entry = this.profileStore.listDownloads(workspaceId, 2_000).find((item) => item.id === id)
    if (!entry?.savePath || !existsSync(entry.savePath)) throw new Error('Downloaded file no longer exists.')
    const error = await shell.openPath(entry.savePath)
    if (error) throw new Error(error)
  }

  showBrowserDownload(workspaceId: string | null, id: string): void {
    const entry = this.profileStore.listDownloads(workspaceId, 2_000).find((item) => item.id === id)
    if (!entry?.savePath || !existsSync(entry.savePath)) throw new Error('Downloaded file no longer exists.')
    shell.showItemInFolder(entry.savePath)
  }

  pauseBrowserDownload(workspaceId: string | null, id: string): void {
    const active = this.requireActiveDownload(workspaceId, id)
    active.item.pause()
    this.updateActiveDownloadState(id, 'paused')
  }

  resumeBrowserDownload(workspaceId: string | null, id: string): void {
    const active = this.requireActiveDownload(workspaceId, id)
    if (active.item.canResume()) {
      active.item.resume()
      this.updateActiveDownloadState(id, 'started')
    }
  }

  cancelBrowserDownload(workspaceId: string | null, id: string): void {
    const active = this.requireActiveDownload(workspaceId, id)
    active.item.cancel()
    this.updateActiveDownloadState(id, 'cancelled')
  }

  retryBrowserDownload(workspaceId: string | null, id: string): void {
    const entry = this.profileStore.listDownloads(workspaceId, 2_000).find((item) => item.id === id)
    if (!entry) throw new Error('Download record not found.')
    const instance = this.instances.get(entry.tabId)
      ?? Array.from(this.instances.values()).find((item) => item.workspaceId === workspaceId)
    if (!instance) throw new Error('Open a browser tab before retrying this download.')
    instance.pageView.webContents.downloadURL(entry.url)
  }

  listBrowserPermissions(origin?: string): BrowserPermissionEntry[] {
    return this.profileStore.listPermissions(origin)
  }

  clearBrowserPermission(origin: string, permission?: string): void {
    this.profileStore.clearPermission(origin, permission)
    if (permission) {
      this.permissionDecisions.delete(`${origin}|${permission}`)
      return
    }
    for (const key of Array.from(this.permissionDecisions.keys())) {
      if (key.startsWith(`${origin}|`)) this.permissionDecisions.delete(key)
    }
  }

  listExtensions(): BrowserExtensionEntry[] {
    return session.fromPartition(SESSION_PARTITION).extensions.getAllExtensions()
      .map((extension) => {
        const preference = this.profileStore.getExtensionPreference(extension.id)
        const manifest = extension.manifest as {
          description?: string
          icons?: Record<string, string>
          permissions?: string[]
          host_permissions?: string[]
          homepage_url?: string
          manifest_version?: number
        }
        return {
          id: extension.id,
          name: extension.name,
          version: extension.version,
          path: extension.path,
          description: manifest.description ?? '',
          icon: this.readExtensionIcon(extension.path, manifest.icons),
          permissions: Array.from(new Set([...(manifest.permissions ?? []), ...(manifest.host_permissions ?? [])])),
          homepageUrl: manifest.homepage_url ?? null,
          manifestVersion: manifest.manifest_version ?? null,
          enabled: true,
          hasAction: Boolean(this.getExtensionActionPath(extension.manifest)),
          pinned: preference.pinned,
          hidden: preference.hidden,
          order: preference.order,
        }
      })
      .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
  }

  private readExtensionIcon(extensionPath: string, icons?: Record<string, string>): string | null {
    if (!icons) return null
    const iconEntry = Object.entries(icons)
      .filter(([, iconPath]) => typeof iconPath === 'string' && iconPath.length > 0)
      .sort(([a], [b]) => Number(b) - Number(a))[0]
    if (!iconEntry) return null

    const absoluteRoot = resolve(extensionPath)
    const absoluteIcon = resolve(absoluteRoot, iconEntry[1])
    if (absoluteIcon !== absoluteRoot && !absoluteIcon.startsWith(`${absoluteRoot}/`)) return null
    if (!existsSync(absoluteIcon) || !statSync(absoluteIcon).isFile() || statSync(absoluteIcon).size > 2 * 1024 * 1024) return null

    const extension = parsePath(absoluteIcon).ext.toLowerCase()
    const mime = extension === '.svg'
      ? 'image/svg+xml'
      : extension === '.jpg' || extension === '.jpeg'
        ? 'image/jpeg'
        : extension === '.webp'
          ? 'image/webp'
          : 'image/png'
    return `data:${mime};base64,${readFileSync(absoluteIcon).toString('base64')}`
  }

  private extractCrxZipPayload(packageBuffer: Buffer): Buffer {
    if (packageBuffer.byteLength > MAX_EXTENSION_PACKAGE_BYTES) throw new Error('Extension package is larger than 100 MB.')
    if (packageBuffer.subarray(0, 4).toString('ascii') !== 'Cr24') throw new Error('The selected file is not a valid CRX package.')

    const crxVersion = packageBuffer.readUInt32LE(4)
    let zipOffset: number
    if (crxVersion === 3) {
      zipOffset = 12 + packageBuffer.readUInt32LE(8)
    } else if (crxVersion === 2) {
      zipOffset = 16 + packageBuffer.readUInt32LE(8) + packageBuffer.readUInt32LE(12)
    } else {
      throw new Error(`Unsupported CRX version: ${crxVersion}.`)
    }
    if (zipOffset >= packageBuffer.byteLength || packageBuffer.readUInt32LE(zipOffset) !== 0x04034b50) {
      throw new Error('The CRX package does not contain a valid ZIP payload.')
    }
    return packageBuffer.subarray(zipOffset)
  }

  async installExtension(path: string): Promise<BrowserExtensionEntry> {
    if (!path || !existsSync(path)) throw new Error('Extension directory does not exist.')
    const managedRoot = join(app.getPath('userData'), 'browser-profile', 'extensions')
    mkdirSync(managedRoot, { recursive: true, mode: 0o700 })
    const installRoot = join(managedRoot, randomUUID())
    mkdirSync(installRoot, { recursive: true, mode: 0o700 })

    try {
      if (statSync(path).isDirectory()) {
        cpSync(path, installRoot, { recursive: true })
      } else if (path.toLowerCase().endsWith('.zip')) {
        await extractZip(path, { dir: installRoot })
      } else if (path.toLowerCase().endsWith('.crx')) {
        const temporaryZip = join(installRoot, '.craft-import.zip')
        writeFileSync(temporaryZip, this.extractCrxZipPayload(readFileSync(path)), { mode: 0o600 })
        await extractZip(temporaryZip, { dir: installRoot })
        rmSync(temporaryZip, { force: true })
      } else {
        throw new Error('Select an unpacked extension directory, .zip package, or .crx package.')
      }

      const directManifest = join(installRoot, 'manifest.json')
      const childDirectories = readdirSync(installRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory())
      const extensionRoot = existsSync(directManifest)
        ? installRoot
        : childDirectories.length === 1 && existsSync(join(installRoot, childDirectories[0]!.name, 'manifest.json'))
          ? join(installRoot, childDirectories[0]!.name)
          : null
      if (!extensionRoot) throw new Error('The selected extension package does not contain manifest.json at its root.')

      const manifest = JSON.parse(readFileSync(join(extensionRoot, 'manifest.json'), 'utf8')) as {
        name?: string
        version?: string
        manifest_version?: number
        description?: string
        icons?: Record<string, string>
        homepage_url?: string
        permissions?: string[]
        host_permissions?: string[]
      }
      if (!manifest.name || !manifest.version || ![2, 3].includes(manifest.manifest_version ?? 0)) {
        throw new Error('The extension manifest is missing a valid name, version, or manifest_version.')
      }

      const requestedPermissions = [...(manifest.permissions ?? []), ...(manifest.host_permissions ?? [])]
      const localeIsChinese = app.getLocale().toLowerCase().startsWith('zh')
      const confirmation = await dialog.showMessageBox({
        type: 'warning',
        title: localeIsChinese ? '安装浏览器扩展' : 'Install browser extension',
        message: localeIsChinese
          ? `要安装“${manifest.name}”吗？`
          : `Install “${manifest.name}”?`,
        detail: requestedPermissions.length > 0
          ? `${localeIsChinese ? '请求的权限' : 'Requested permissions'}:\n${requestedPermissions.slice(0, 20).join('\n')}`
          : (localeIsChinese ? '此扩展未声明额外权限。' : 'This extension declares no additional permissions.'),
        buttons: [localeIsChinese ? '安装' : 'Install', localeIsChinese ? '取消' : 'Cancel'],
        defaultId: 1,
        cancelId: 1,
        noLink: true,
      })
      if (confirmation.response !== 0) throw new Error('Extension installation was cancelled.')

      const extension = await session.fromPartition(SESSION_PARTITION).extensions.loadExtension(extensionRoot, {
        allowFileAccess: true,
      })
      this.profileStore.addExtensionPath(extension.path)
      const order = Math.max(0, this.listExtensions().length - 1)
      this.profileStore.setExtensionPreference(extension.id, { order })
      return {
        id: extension.id,
        name: extension.name,
        version: extension.version,
        path: extension.path,
        description: manifest.description ?? '',
        icon: this.readExtensionIcon(extension.path, (manifest as { icons?: Record<string, string> }).icons),
        permissions: requestedPermissions,
        homepageUrl: (manifest as { homepage_url?: string }).homepage_url ?? null,
        manifestVersion: manifest.manifest_version ?? null,
        enabled: true,
        hasAction: Boolean(this.getExtensionActionPath(extension.manifest)),
        pinned: false,
        hidden: false,
        order,
      }
    } catch (error) {
      rmSync(installRoot, { recursive: true, force: true })
      throw error
    }
  }

  async installExtensionFromStore(urlOrId: string): Promise<BrowserExtensionEntry> {
    const raw = urlOrId.trim()
    let extensionId = CHROME_EXTENSION_ID_PATTERN.test(raw) ? raw : ''
    let store: 'chrome' | 'edge' = 'chrome'
    if (!extensionId) {
      try {
        const parsed = new URL(raw)
        const isChromeStore = parsed.hostname === 'chromewebstore.google.com' || parsed.hostname === 'chrome.google.com'
        const isEdgeStore = parsed.hostname === 'microsoftedge.microsoft.com'
        if (!isChromeStore && !isEdgeStore) {
          throw new Error('Only Chrome Web Store and Microsoft Edge Add-ons links are supported.')
        }
        store = isEdgeStore ? 'edge' : 'chrome'
        extensionId = parsed.pathname.split('/').find((part) => CHROME_EXTENSION_ID_PATTERN.test(part)) ?? ''
      } catch (error) {
        if (error instanceof Error && error.message.startsWith('Only Chrome Web Store')) throw error
      }
    }
    if (!CHROME_EXTENSION_ID_PATTERN.test(extensionId)) {
      throw new Error('Open a valid extension detail page or paste a 32-character extension ID.')
    }

    const updateQuery = new URLSearchParams({
      response: 'redirect',
      prodversion: process.versions.chrome,
      acceptformat: 'crx2,crx3',
      x: `id=${extensionId}&installsource=ondemand&uc`,
    })
    const packageEndpoint = store === 'edge'
      ? 'https://edge.microsoft.com/extensionwebstorebase/v1/crx'
      : 'https://clients2.google.com/service/update2/crx'
    const response = await net.fetch(`${packageEndpoint}?${updateQuery.toString()}`, {
      redirect: 'follow',
    })
    if (!response.ok) throw new Error(`Extension store download failed (${response.status}).`)
    const declaredLength = Number(response.headers.get('content-length') ?? 0)
    if (declaredLength > MAX_EXTENSION_PACKAGE_BYTES) throw new Error('Extension package is larger than 100 MB.')
    const packageBuffer = Buffer.from(await response.arrayBuffer())
    if (packageBuffer.byteLength > MAX_EXTENSION_PACKAGE_BYTES) throw new Error('Extension package is larger than 100 MB.')
    const zipPayload = this.extractCrxZipPayload(packageBuffer)

    const temporaryRoot = join(app.getPath('temp'), `craft-browser-extension-${randomUUID()}`)
    mkdirSync(temporaryRoot, { recursive: true, mode: 0o700 })
    const zipPath = join(temporaryRoot, `${extensionId}.zip`)
    try {
      writeFileSync(zipPath, zipPayload, { mode: 0o600 })
      return await this.installExtension(zipPath)
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true })
    }
  }

  removeExtension(id: string): void {
    const ses = session.fromPartition(SESSION_PARTITION)
    const extension = ses.extensions.getExtension(id)
    if (!extension) return
    ses.extensions.removeExtension(id)
    this.profileStore.removeExtensionPath(extension.path)
    this.profileStore.removeExtensionPreference(id)
    const managedRoot = join(app.getPath('userData'), 'browser-profile', 'extensions')
    const normalizedPath = extension.path.replaceAll('\\', '/')
    const normalizedRoot = `${managedRoot.replaceAll('\\', '/')}/`
    if (normalizedPath.startsWith(normalizedRoot)) {
      const relativePath = normalizedPath.slice(normalizedRoot.length)
      const installDirectory = relativePath.split('/')[0]
      if (installDirectory) rmSync(join(managedRoot, installDirectory), { recursive: true, force: true })
    }
  }

  setExtensionPreference(extensionId: string, preference: { pinned?: boolean; hidden?: boolean; order?: number }): void {
    if (!session.fromPartition(SESSION_PARTITION).extensions.getExtension(extensionId)) {
      throw new Error('Browser extension is not loaded.')
    }
    this.profileStore.setExtensionPreference(extensionId, preference)
  }

  showToolbarMenu(kind: 'extensions' | 'permissions' | 'passwords', tabId?: string | null, origin?: string | null): void {
    const instance = (tabId ? this.instances.get(tabId) : null)
      ?? Array.from(this.instances.values()).find((item) => item.isVisible)
      ?? Array.from(this.instances.values())[0]
    const host = instance?.embeddedHostWindow ?? instance?.window
    if (!host || host.isDestroyed()) return

    const isChinese = app.getLocale().toLowerCase().startsWith('zh')
    let template: MenuItemConstructorOptions[]

    if (kind === 'passwords') {
      if (!instance || !origin) return
      void this.showPasswordMenu(instance, origin)
      return
    }
    if (kind === 'extensions') {
      const extensions = this.listExtensions().filter((extension) => !extension.hidden)
      template = extensions.length > 0
        ? extensions.map((extension) => ({
            label: extension.name,
            enabled: extension.hasAction,
            click: () => {
              void this.openExtensionAction(extension.id, tabId).catch((error) => {
                mainLog.warn(`[BrowserPaneManager] Failed to open extension ${extension.id}:`, error)
              })
            },
          }))
        : [{ label: isChinese ? '暂无浏览器扩展' : 'No browser extensions', enabled: false }]
    } else {
      if (!origin) return
      const entries = this.listBrowserPermissions(origin)
      template = [
        { label: origin, enabled: false },
        { type: 'separator' },
        ...(entries.length > 0
          ? entries.map((entry) => ({
              label: `${entry.permission} · ${entry.allowed ? (isChinese ? '允许' : 'Allowed') : (isChinese ? '阻止' : 'Blocked')}`,
              click: () => this.clearBrowserPermission(entry.origin, entry.permission),
            }) satisfies MenuItemConstructorOptions)
          : [{ label: isChinese ? '暂无已保存权限' : 'No saved permissions', enabled: false }]),
        ...(entries.length > 0
          ? [
              { type: 'separator' } as MenuItemConstructorOptions,
              {
                label: isChinese ? '重置此网站的权限' : 'Reset permissions for this site',
                click: () => this.clearBrowserPermission(origin),
              },
            ]
          : []),
      ]
    }

    Menu.buildFromTemplate(template).popup({ window: host })
  }

  async openExtensionAction(extensionId: string, tabId?: string | null): Promise<void> {
    const ses = session.fromPartition(SESSION_PARTITION)
    const extension = ses.extensions.getExtension(extensionId)
    if (!extension) throw new Error('Browser extension is not loaded.')
    const actionPath = this.getExtensionActionPath(extension.manifest)
    if (!actionPath) throw new Error('This extension does not expose a popup or options page.')

    const parentInstance = (tabId ? this.instances.get(tabId) : null)
      ?? Array.from(this.instances.values()).find((instance) => instance.isVisible)
      ?? Array.from(this.instances.values())[0]
    const popupWindow = new BrowserWindow({
      width: 420,
      height: 600,
      minWidth: 320,
      minHeight: 360,
      show: true,
      autoHideMenuBar: true,
      parent: parentInstance?.embeddedHostWindow ?? parentInstance?.window,
      webPreferences: {
        partition: SESSION_PARTITION,
        session: ses,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    })
    if (parentInstance) {
      this.registerPopupWindow(parentInstance, popupWindow, `chrome-extension://${extension.id}/${actionPath}`)
    }
    await popupWindow.loadURL(`chrome-extension://${extension.id}/${actionPath.replace(/^\/+/, '')}`)
  }

  // validateUploadFilePath removed — uses shared validateFilePath from @craft-agent/server-core/handlers

  async uploadFile(id: string, ref: string, filePaths: string[]): Promise<ElementGeometry> {
    const instance = this.requireAliveInstance(id)

    const safePaths: string[] = []
    for (const p of filePaths) {
      const workspaceId = this.resolveLaunchWorkspaceId()
      const safePath = await validateFilePath(p, getWorkspaceAllowedDirs(workspaceId))
      if (!existsSync(safePath)) throw new Error(`File not found: ${p}`)
      safePaths.push(safePath)
    }

    return instance.cdp.setFileInputFiles(ref, safePaths)
  }

  windowResize(id: string, width: number, height: number): { width: number; height: number } {
    const instance = this.requireAliveInstance(id)

    const requestedViewportWidth = Math.max(320, Math.floor(width))
    const requestedViewportHeight = Math.max(240, Math.floor(height))
    instance.window.setContentSize(requestedViewportWidth, requestedViewportHeight + TOOLBAR_HEIGHT)

    this.layoutAllViews(instance)

    // Return effective viewport dimensions after OS/window min-size constraints are applied.
    const [appliedContentWidth, appliedContentHeight] = instance.window.getContentSize()
    return {
      width: Math.max(0, Math.floor(appliedContentWidth)),
      height: Math.max(0, Math.floor(appliedContentHeight - TOOLBAR_HEIGHT)),
    }
  }

  async evaluate(id: string, expression: string): Promise<unknown> {
    const instance = this.requireAliveInstance(id)
    return instance.pageView.webContents.executeJavaScript(expression)
  }

  async detectSecurityChallenge(id: string): Promise<{ detected: boolean; provider: string; signals: string[] }> {
    const instance = this.instances.get(id)
    if (!instance || instance.window.isDestroyed()) return { detected: false, provider: 'none', signals: [] }

    const signals: string[] = []
    const title = instance.title || ''
    const url = instance.currentUrl || ''

    // Title-based detection
    if (/^Just a moment/i.test(title)) {
      signals.push('title:just-a-moment')
    }

    // URL-based detection
    if (url.includes('/cdn-cgi/challenge-platform/')) {
      signals.push('url:cdn-cgi-challenge')
    }

    // DOM-based detection via JS evaluation
    try {
      const domSignals = await instance.pageView.webContents.executeJavaScript(`(() => {
        const signals = [];
        const bodyText = (document.body?.innerText || '').slice(0, 2000);
        if (/Verify you are human/i.test(bodyText)) signals.push('text:verify-human');
        if (/Checking (if the site connection is secure|your browser)/i.test(bodyText)) signals.push('text:checking-browser');
        if (/Performing security verification/i.test(bodyText)) signals.push('text:security-verification');
        if (document.querySelector('#challenge-form')) signals.push('dom:challenge-form');
        if (document.querySelector('#turnstile-wrapper')) signals.push('dom:turnstile-wrapper');
        if (document.querySelector('.cf-turnstile')) signals.push('dom:cf-turnstile');
        if (document.querySelector('iframe[src*="challenges.cloudflare.com"]')) signals.push('dom:cf-challenge-iframe');
        return signals;
      })()`) as string[]

      if (Array.isArray(domSignals)) {
        signals.push(...domSignals)
      }
    } catch {
      // JS evaluation can fail if page is in a weird state — don't block on it
    }

    try {
      const snapshot = await instance.cdp.getAccessibilitySnapshot()
      const actionableRoles = new Set([
        'button', 'link', 'textbox', 'searchbox', 'combobox', 'checkbox', 'radio', 'switch',
        'menuitem', 'menuitemcheckbox', 'menuitemradio', 'tab', 'option', 'slider', 'spinbutton', 'listbox',
      ])
      const actionableCount = snapshot.nodes.filter((node) => {
        const role = (node.role || '').toLowerCase()
        return actionableRoles.has(role) && !node.disabled
      }).length

      if (snapshot.nodes.length > 0 && actionableCount <= 2) {
        signals.push(`ax:near-empty(${actionableCount}/${snapshot.nodes.length})`)
      }
    } catch {
      // AX snapshot can fail transiently during navigation; ignore
    }

    const detected = signals.length > 0
    const isCloudflare = signals.some(s =>
      s.includes('cf-') || s.includes('challenge') || s.includes('turnstile') || s === 'title:just-a-moment'
    )
    const provider = detected ? (isCloudflare ? 'cloudflare' : 'unknown') : 'none'

    if (detected) {
      mainLog.info(`[browser-pane] security challenge detected id=${id} provider=${provider} signals=[${signals.join(', ')}]`)
    }

    return { detected, provider, signals }
  }

  async scroll(id: string, direction: 'up' | 'down' | 'left' | 'right', amount = 500): Promise<void> {
    const instance = this.requireAliveInstance(id)

    const deltaX = direction === 'left' ? -amount : direction === 'right' ? amount : 0
    const deltaY = direction === 'up' ? -amount : direction === 'down' ? amount : 0

    await instance.pageView.webContents.executeJavaScript(`window.scrollBy(${deltaX}, ${deltaY})`)
  }

  bindSession(id: string, sessionId: string, options?: { workspaceId?: string | null }): void {
    const instance = this.instances.get(id)
    if (instance) {
      instance.boundSessionId = sessionId
      instance.ownerType = 'session'
      instance.ownerSessionId = sessionId
      // Adopt the new binder's workspace. Manual windows being reused for a
      // session start carrying that session's workspace so the receiving
      // workspace's UI sees them and others don't.
      if (options?.workspaceId !== undefined) {
        instance.workspaceId = options.workspaceId
      }
      this.emitStateChange(instance)
    }
  }

  unbindSession(id: string): void {
    const instance = this.instances.get(id)
    if (instance) {
      instance.boundSessionId = null
      instance.ownerType = 'manual'
      // Preserve ownerSessionId as last-known owner for lifecycle targeting.
      this.emitStateChange(instance)
    }
  }

  /** Unbind all instances bound to the given session (non-destructive — window stays alive and reusable). */
  unbindAllForSession(sessionId: string): void {
    for (const instance of this.instances.values()) {
      if (instance.boundSessionId === sessionId) {
        instance.boundSessionId = null
        instance.ownerType = 'manual'
        // Keep ownerSessionId for post-turn lifecycle commands like `close` and `hide`.
        instance.ownerSessionId = instance.ownerSessionId ?? sessionId
        this.emitStateChange(instance)
        mainLog.info(`[browser-pane] Unbound instance ${instance.id} from session ${sessionId} (owner retained: ${instance.ownerSessionId ?? 'none'})`)
      }
    }
  }

  getBoundForSession(sessionId: string): string | null {
    for (const instance of this.instances.values()) {
      if (instance.ownerType === 'session' && instance.ownerSessionId === sessionId) {
        if (instance.window.isDestroyed()) {
          this.cleanupDestroyedInstance(instance, `getBoundForSession(${sessionId})`)
          continue
        }
        return instance.id
      }
    }
    return null
  }

  /**
   * Pick an unbound window that the caller's workspace is allowed to adopt.
   *
   * Why workspace filtering matters: when a session ends, its window stays
   * alive and becomes `ownerType='manual'` so the next turn of the **same**
   * session can re-bind it. But the window keeps its original `workspaceId`.
   * Without filtering, a session in workspace B would grab a window left
   * behind by workspace A — moving the window across workspaces, which is
   * exactly the leak this whole workspace-isolation work is fixing.
   *
   * Rule: adoption is allowed if the unbound window has `workspaceId === null`
   * (truly user-opened, no workspace context) OR matches the caller's
   * `workspaceId`. Same-workspace reuse covers the legitimate "turn ended,
   * next turn re-binds" case as well as any future turn of any session in
   * that workspace.
   */
  private findReusableUnboundInstance(workspaceId: string | null): BrowserInstance | null {
    const candidates = Array.from(this.instances.values()).filter(
      (i) =>
        i.boundSessionId === null &&
        i.ownerType === 'manual' &&
        (i.workspaceId === null || i.workspaceId === workspaceId),
    )
    if (candidates.length === 0) return null

    // Prefer visible windows first, then fall back to first available.
    return candidates.find((i) => i.isVisible) ?? candidates[0]
  }

  createForSession(
    sessionId: string,
    options?: { show?: boolean; allowReuseManual?: boolean; workspaceId?: string | null },
  ): string {
    const workspaceId = options?.workspaceId ?? null
    const existing = this.getBoundForSession(sessionId)
    if (existing) {
      // Already bound — adopt the workspace if the caller provided one and the
      // existing instance was bound before we knew about its workspace.
      if (options?.workspaceId !== undefined) {
        const instance = this.instances.get(existing)
        if (instance) instance.workspaceId = options.workspaceId
      }
      if (options?.show) {
        this.focus(existing)
      }
      return existing
    }

    // Reuse an unbound/manual window before creating a new one — local
    // sessions only. Remote agents must always get a fresh window so they
    // can never hijack a window the user opened manually.
    const allowReuseManual = options?.allowReuseManual ?? true
    if (allowReuseManual) {
      const reusable = this.findReusableUnboundInstance(workspaceId)
      if (reusable) {
        this.bindSession(reusable.id, sessionId, { workspaceId })
        if (options?.show) {
          this.focus(reusable.id)
        }
        mainLog.info(`[browser-pane] Reused unbound instance ${reusable.id} for session ${sessionId} (workspace=${workspaceId ?? 'none'})`)
        return reusable.id
      }
    }

    return this.createInstance(undefined, {
      show: options?.show ?? false,
      ownerType: 'session',
      ownerSessionId: sessionId,
      workspaceId,
    })
  }

  focusBoundForSession(sessionId: string, options?: { workspaceId?: string | null }): string {
    const id = this.createForSession(sessionId, { show: true, workspaceId: options?.workspaceId })
    this.focus(id)
    return id
  }

  getOrCreateForSession(sessionId: string, options?: { workspaceId?: string | null }): string {
    return this.createForSession(sessionId, { show: false, workspaceId: options?.workspaceId })
  }

  getBoundInstanceId(sessionId: string): string | null {
    for (const [id, instance] of this.instances) {
      if (instance.boundSessionId === sessionId) {
        if (instance.window.isDestroyed()) {
          this.cleanupDestroyedInstance(instance, `getBoundInstanceId(${sessionId})`)
          continue
        }
        return id
      }
    }
    return null
  }

  destroyForSession(sessionId: string): void {
    for (const [id, instance] of this.instances) {
      if (instance.boundSessionId === sessionId) {
        this.destroyInstance(id)
      }
    }
  }

  async clearVisualsForSession(sessionId: string): Promise<void> {
    for (const instance of this.instances.values()) {
      if (instance.boundSessionId === sessionId) {
        instance.agentControl = null
        this.applyAgentControlLock(instance, false)
        this.updateNativeOverlayState(instance)
        this.emitStateChange(instance)
      }
    }
  }

  private getAgentControlLabel(agentControl: Pick<AgentControlState, 'displayName' | 'intent'> | null | undefined): string {
    if (agentControl?.intent) {
      return `${agentControl.displayName ?? 'Agent'} — ${agentControl.intent}`
    }

    return agentControl?.displayName ?? 'Agent is working…'
  }

  private reapplyAgentControlVisual(instance: BrowserInstance): void {
    const active = !!instance.agentControl?.active
    this.applyAgentControlLock(instance, active)
    this.updateNativeOverlayState(instance)
  }

  /** Resolve the app's current accent color as a concrete CSS value (not a var reference). */
  private getResolvedAccentColor(): string {
    const isDark = nativeTheme.shouldUseDarkColors
    const userTheme = loadAppTheme()
    const accent = isDark
      ? (userTheme?.dark?.accent ?? userTheme?.accent ?? DEFAULT_THEME.dark!.accent!)
      : (userTheme?.accent ?? DEFAULT_THEME.accent!)
    return accent
  }

  private async loadNativeOverlayPage(instance: BrowserInstance): Promise<void> {
    const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      html, body {
        margin: 0;
        width: 100%;
        height: 100%;
        background: transparent;
        overflow: hidden;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }
      #overlay {
        position: fixed;
        inset: 0;
        border: 2px solid transparent;
        border-radius: ${EMBEDDED_VIEW_RADIUS}px;
        box-sizing: border-box;
        pointer-events: none;
      }
      #chip {
        position: fixed;
        top: 8px;
        right: 8px;
        padding: 4px 8px;
        border-radius: 7px;
        background: rgba(2, 6, 23, 0.82);
        color: rgba(236, 254, 255, 0.95);
        font-size: 11px;
        line-height: 1.2;
        backdrop-filter: blur(4px);
        max-width: calc(100vw - 16px);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      #shield {
        position: fixed;
        inset: 0;
        pointer-events: none;
        cursor: default;
      }
    </style>
  </head>
  <body>
    <div id="overlay">
      <div id="shield"></div>
      <div id="chip">Agent is working…</div>
    </div>
  </body>
</html>`

    try {
      await instance.nativeOverlayView.webContents.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(html)}`)
      instance.nativeOverlayReady = true
      mainLog.info(`[browser-pane] native overlay ready id=${instance.id} radius=${EMBEDDED_VIEW_RADIUS}`)
      this.updateNativeOverlayState(instance)
    } catch (error) {
      instance.nativeOverlayReady = false
      mainLog.warn(`[browser-pane] native overlay load failed id=${instance.id}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private getToolbarEffectiveHeight(instance: BrowserInstance): number {
    if (instance.embeddedHostWebContentsId !== null) return 0
    if (!instance.toolbarMenuOpen) return TOOLBAR_HEIGHT

    const [, contentHeight] = instance.window.getContentSize()
    return Math.max(TOOLBAR_HEIGHT, contentHeight)
  }

  private layoutToolbarView(instance: BrowserInstance): void {
    if (instance.embeddedHostWindow) return
    const [width] = instance.window.getContentSize()
    const toolbarHeight = this.getToolbarEffectiveHeight(instance)

    instance.toolbarView.setBounds({ x: 0, y: 0, width, height: toolbarHeight })
  }

  private layoutEmbeddedToolbar(instance: BrowserInstance): void {
    const host = instance.embeddedHostWindow
    const bounds = instance.embeddedBounds
    if (!host || host.isDestroyed() || !bounds || instance.embeddedToolbarMode !== 'floating' || !instance.isVisible || instance.agentControl?.active) {
      instance.toolbarView.setVisible(false)
      return
    }

    const inset = 8
    const collapsedTriggerHeight = 8
    const revealed = instance.embeddedToolbarRevealed
    const toolbarBounds = {
      x: bounds.x + inset,
      // Keep the invisible trigger and revealed toolbar on the same inset
      // baseline so expanding it does not jump under the pointer.
      y: bounds.y + inset,
      width: Math.max(1, bounds.width - (inset * 2)),
      height: revealed ? TOOLBAR_HEIGHT : collapsedTriggerHeight,
    }
    instance.toolbarView.setBounds(toolbarBounds)
    // The collapsed trigger is a background-colored hit area, not a visible
    // capsule. The revealed surface gets its radius from renderer CSS.
    // CSS owns the visible rounded surface. Native clipping on top of the CSS
    // border/shadow creates a dark, doubled corner on macOS.
    instance.toolbarView.setBorderRadius(0)
    instance.toolbarView.setVisible(true)
    // Promote only when another native sibling is actually above the toolbar.
    // Unconditionally removing/re-adding the view produces synthetic pointer
    // exits on macOS, interrupting clicks and causing reveal/collapse flicker.
    if (host.contentView.children.at(-1) !== instance.toolbarView) {
      host.contentView.removeChildView(instance.toolbarView)
      host.contentView.addChildView(instance.toolbarView)
    }
  }

  private updateNativeOverlayState(instance: BrowserInstance): void {
    const control = instance.agentControl
    const agentActive = !!control?.active
    const menuActive = !!instance.toolbarMenuOverlayActive
    const shouldShow = agentActive || menuActive

    if (!shouldShow || !instance.nativeOverlayReady || instance.window.isDestroyed()) {
      instance.nativeOverlayView.setVisible(false)
      return
    }

    if (instance.embeddedHostWindow) {
      if (!instance.embeddedBounds || !instance.isVisible) {
        instance.nativeOverlayView.setVisible(false)
        return
      }
      instance.nativeOverlayView.setBounds(instance.embeddedBounds)
      instance.nativeOverlayView.setBorderRadius(EMBEDDED_VIEW_RADIUS)
      instance.nativeOverlayView.setVisible(true)
      instance.embeddedHostWindow.contentView.addChildView(instance.nativeOverlayView)
    } else {
      const [width, height] = instance.window.getContentSize()
      const toolbarHeight = this.getToolbarEffectiveHeight(instance)
      const overlayHeight = Math.max(1, height - toolbarHeight)
      instance.nativeOverlayView.setBounds({ x: 0, y: toolbarHeight, width, height: overlayHeight })
      instance.nativeOverlayView.setVisible(true)
      instance.window.contentView.addChildView(instance.nativeOverlayView)
      instance.window.contentView.addChildView(instance.toolbarView)
    }

    if (agentActive) {
      const label = this.getAgentControlLabel(control)
      const accent = this.getResolvedAccentColor()

      void instance.nativeOverlayView.webContents.executeJavaScript(`(() => {
        const overlay = document.getElementById('overlay');
        const chip = document.getElementById('chip');
        const shield = document.getElementById('shield');
        if (!overlay || !chip || !shield) return;

        overlay.style.borderColor = ${JSON.stringify(accent)};
        overlay.style.boxShadow = 'inset 0 0 0 1px color-mix(in oklab, ' + ${JSON.stringify(accent)} + ' 45%, transparent), inset 0 0 24px color-mix(in oklab, ' + ${JSON.stringify(accent)} + ' 28%, transparent)';
        chip.textContent = ${JSON.stringify(label)};
        chip.style.display = 'inline-flex';
        shield.style.pointerEvents = 'auto';
        shield.style.cursor = 'not-allowed';
        shield.style.background = 'rgba(2, 6, 23, 0.03)';
      })()`).catch(() => {})
      return
    }

    // Menu mode: transparent full-page tap-catcher, no visuals
    void instance.nativeOverlayView.webContents.executeJavaScript(`(() => {
      const overlay = document.getElementById('overlay');
      const chip = document.getElementById('chip');
      const shield = document.getElementById('shield');
      if (!overlay || !chip || !shield) return;

      overlay.style.borderColor = 'transparent';
      overlay.style.boxShadow = 'none';
      chip.style.display = 'none';
      shield.style.pointerEvents = 'auto';
      shield.style.cursor = 'default';
      shield.style.background = 'rgba(0, 0, 0, 0.001)';
    })()`).catch(() => {})
  }

  private getWindowResizable(window: BrowserWindow): boolean {
    return typeof window.isResizable === 'function' ? window.isResizable() : true
  }

  private setWindowResizable(window: BrowserWindow, value: boolean): void {
    if (typeof window.setResizable === 'function') {
      window.setResizable(value)
    }
  }

  private applyAgentControlLock(instance: BrowserInstance, active: boolean): void {
    const wantsLock = active && !!instance.agentControl?.active

    if (wantsLock && !instance.lockState.active) {
      instance.lockState.previousResizable = this.getWindowResizable(instance.window)
      this.setWindowResizable(instance.window, false)
      instance.lockState.active = true
      mainLog.info(`[browser-pane] interaction lock enabled id=${instance.id}`)
      return
    }

    if (!wantsLock && instance.lockState.active) {
      this.setWindowResizable(instance.window, instance.lockState.previousResizable)
      instance.lockState.active = false
      mainLog.info(`[browser-pane] interaction lock released id=${instance.id}`)
    }
  }

  destroyAll(): void {
    for (const id of [...this.instances.keys()]) {
      this.destroyInstance(id)
    }
  }

  private finalizeDestroyedInstance(instance: BrowserInstance, source: 'destroy' | 'closed'): void {
    if (!this.instances.has(instance.id)) {
      return
    }

    this.destroyingIds.delete(instance.id)
    this.closePopupsForParent(instance.id, 'parent_destroy')
    this.applyAgentControlLock(instance, false)
    this.detachPageViews(instance)
    instance.cdp.detach()
    for (const view of [instance.pageView, instance.nativeOverlayView]) {
      if (!view.webContents.isDestroyed()) view.webContents.close()
    }
    this.instances.delete(instance.id)
    this.removedCallback?.(instance.id)
    mainLog.info(`[browser-pane] Destroyed instance: ${instance.id} (${source})`)
  }

  private layoutPageView(instance: BrowserInstance): void {
    if (instance.embeddedHostWindow) {
      this.updateNativeOverlayState(instance)
      return
    }
    const [width, height] = instance.window.getContentSize()
    const toolbarHeight = this.getToolbarEffectiveHeight(instance)
    instance.pageView.setBounds({ x: 0, y: toolbarHeight, width, height: Math.max(1, height - toolbarHeight) })
    this.updateNativeOverlayState(instance)
  }

  private layoutAllViews(instance: BrowserInstance): void {
    this.layoutToolbarView(instance)
    this.layoutPageView(instance)
    if (!instance.window.isDestroyed() && !instance.embeddedHostWindow) {
      instance.window.contentView.addChildView(instance.toolbarView)
    }
  }

  private detachPageViews(instance: BrowserInstance): void {
    const host = instance.embeddedHostWindow
    if (host && !host.isDestroyed()) {
      host.contentView.removeChildView(instance.pageView)
      host.contentView.removeChildView(instance.nativeOverlayView)
      host.contentView.removeChildView(instance.toolbarView)
    } else if (!instance.window.isDestroyed()) {
      instance.window.contentView.removeChildView(instance.pageView)
      instance.window.contentView.removeChildView(instance.nativeOverlayView)
    }
    instance.pageView.setVisible(false)
    instance.nativeOverlayView.setVisible(false)
    instance.toolbarView.setVisible(false)
  }

  private forceCloseToolbarMenu(instance: BrowserInstance, reason: string): void {
    if (!instance.toolbarMenuOpen && instance.toolbarMenuHeight === 0 && !instance.toolbarMenuOverlayActive) {
      return
    }

    instance.toolbarMenuOpen = false
    instance.toolbarMenuHeight = 0
    instance.toolbarMenuOverlayActive = false
    this.layoutAllViews(instance)

    if (!instance.window.isDestroyed() && !instance.toolbarView.webContents.isDestroyed()) {
      instance.toolbarView.webContents.send(TOOLBAR_CHANNELS.FORCE_CLOSE_MENU, { reason })
    }
  }

  private isBrowserEmptyStateUrl(url: string): boolean {
    if (!url) return false
    return url.includes(`/${BROWSER_EMPTY_STATE_PAGE}`) || url.includes(`\\${BROWSER_EMPTY_STATE_PAGE}`)
  }

  private normalizePageState(url: string, title: string): { url: string; title: string } {
    if (this.isBrowserEmptyStateUrl(url)) {
      return { url: 'about:blank', title: 'New Tab' }
    }
    return { url, title }
  }

  private async loadEmptyStatePage(instance: BrowserInstance): Promise<void> {
    if (VITE_DEV_SERVER_URL) {
      await instance.pageView.webContents.loadURL(`${VITE_DEV_SERVER_URL}/${BROWSER_EMPTY_STATE_PAGE}`)
      return
    }

    await instance.pageView.webContents.loadFile(join(__dirname, `renderer/${BROWSER_EMPTY_STATE_PAGE}`))
  }

  private async handleDeepLinkUrl(url: string): Promise<void> {
    if (!url.startsWith(CRAFT_DEEPLINK_SCHEME_PREFIX)) return

    try {
      if (!this.windowManager) {
        mainLog.warn('[browser-pane] window manager unavailable for deep-link handling, falling back to shell.openExternal')
        await shell.openExternal(url)
        return
      }

      const { handleDeepLink } = await import('./deep-link')
      const sink = this.windowManager.getRpcEventSink() ?? undefined
      const resolver = (wcId: number) => this.windowManager?.getClientIdForWindow(wcId)
      const result = await handleDeepLink(url, this.windowManager, sink, resolver)
      if (!result.success) {
        mainLog.warn(`[browser-pane] deep-link handling failed: ${result.error ?? 'unknown error'} url=${url}`)
      }
    } catch (error) {
      mainLog.warn(`[browser-pane] deep-link handling threw, falling back to shell.openExternal: ${error instanceof Error ? error.message : String(error)}`)
      await shell.openExternal(url)
    }
  }

  private async maybeHandleEmptyStateLaunch(instance: BrowserInstance, url: string): Promise<boolean> {
    if (!this.isBrowserEmptyStateUrl(url)) {
      return false
    }

    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      return false
    }

    const hash = parsed.hash.startsWith('#') ? parsed.hash.slice(1) : parsed.hash
    if (hash.startsWith('navigate=')) {
      const params = new URLSearchParams(hash.slice('navigate='.length))
      const value = params.get('value')?.trim()
      if (!value) return false
      await this.navigate(instance.id, value)
      return true
    }

    if (!hash.startsWith('launch=')) return false
    const launchPayload = hash.startsWith('launch=') ? hash.slice('launch='.length) : hash
    if (!launchPayload) return false

    const params = new URLSearchParams(launchPayload)
    const route = params.get('route')
    const token = params.get('ts') ?? route ?? null

    if (!route) {
      mainLog.warn(`[browser-pane] empty-state launch missing route id=${instance.id}`)
      return false
    }

    const handled = await this.triggerEmptyStateRouteLaunch(instance, route, token, 'hash')

    try {
      await instance.pageView.webContents.executeJavaScript(
        "if (window.location.hash.includes('launch=')) history.replaceState(null, '', window.location.pathname + window.location.search);",
      )
    } catch {
      // Best effort cleanup only
    }

    return handled
  }

  private async loadToolbarPage(instance: BrowserInstance): Promise<void> {
    const embedded = instance.embeddedHostWebContentsId !== null
    const query = `instanceId=${encodeURIComponent(instance.id)}&embedded=${embedded ? '1' : '0'}`
    let lastError: unknown = null

    for (let attempt = 0; attempt <= TOOLBAR_LOAD_MAX_RETRIES; attempt++) {
      try {
        if (VITE_DEV_SERVER_URL) {
          await instance.toolbarView.webContents.loadURL(`${VITE_DEV_SERVER_URL}/browser-toolbar.html?${query}`)
        } else {
          await instance.toolbarView.webContents.loadFile(
            join(__dirname, 'renderer/browser-toolbar.html'),
            { query: { instanceId: instance.id, embedded: embedded ? '1' : '0' } },
          )
        }

        if (attempt > 0) {
          mainLog.info(`[browser-pane] toolbar load recovered id=${instance.id} attempt=${attempt + 1}`)
        }
        return
      } catch (error) {
        lastError = error
        const retrying = attempt < TOOLBAR_LOAD_MAX_RETRIES
        mainLog.warn(
          `[browser-pane] toolbar load failed id=${instance.id} attempt=${attempt + 1}/${TOOLBAR_LOAD_MAX_RETRIES + 1}: ${error instanceof Error ? error.message : String(error)}${retrying ? ' (retrying)' : ''}`,
        )

        if (retrying) {
          await this.sleep(TOOLBAR_LOAD_RETRY_DELAY_MS)
        }
      }
    }

    const errorText = lastError instanceof Error ? lastError.message : String(lastError ?? 'unknown error')
    await this.loadToolbarFallback(instance, errorText)
  }

  private async loadToolbarFallback(instance: BrowserInstance, reason: string): Promise<void> {
    const safeReason = reason.replace(/[<>&]/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[ch] || ch))
    const html = `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Browser Toolbar Error</title>
    <style>
      html, body { margin: 0; padding: 0; height: 100%; font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #fafafb; color: #1f2937; }
      @media (prefers-color-scheme: dark) { html, body { background: #2b292e; color: #e5e7eb; } }
      .wrap { height: 100%; display: flex; align-items: center; justify-content: center; }
      .card { max-width: 640px; margin: 0 20px; padding: 14px 16px; border-radius: 10px; background: rgba(127,127,127,0.12); font-size: 12px; line-height: 1.45; }
      .title { font-weight: 600; margin-bottom: 6px; }
      .muted { opacity: 0.8; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="card">
        <div class="title">Browser toolbar failed to load</div>
        <div class="muted">The page area still works, but toolbar UI is unavailable. Try reopening the browser window.</div>
        <div class="muted" style="margin-top: 8px; word-break: break-word;">Reason: ${safeReason}</div>
      </div>
    </div>
  </body>
</html>`

    try {
      await instance.toolbarView.webContents.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(html)}`)
      mainLog.warn(`[browser-pane] Loaded toolbar fallback id=${instance.id}`)
    } catch (error) {
      mainLog.error(`[browser-pane] Failed to load toolbar fallback id=${instance.id}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  private pushToolbarState(instance: BrowserInstance): void {
    if (instance.window.isDestroyed() || instance.toolbarView.webContents.isDestroyed()) return
    const state = {
      url: instance.currentUrl,
      title: instance.title,
      isLoading: instance.isLoading,
      canGoBack: instance.canGoBack,
      canGoForward: instance.canGoForward,
      themeColor: instance.themeColor,
      bookmarked: /^https?:/i.test(instance.currentUrl)
        && this.profileStore.listBookmarks(instance.workspaceId).some((entry) => entry.url === instance.currentUrl),
      embedded: instance.embeddedHostWebContentsId !== null,
      toolbarMode: instance.embeddedToolbarMode,
    }
    instance.toolbarView.webContents.send(TOOLBAR_CHANNELS.STATE_UPDATE, state)
  }

  /** Register IPC handlers for toolbar actions. Call once at app startup. */
  registerToolbarIpc(): void {
    const findInstance = (instanceId: string, event?: Electron.IpcMainInvokeEvent): BrowserInstance | undefined => {
      // Resolve by the sender WebContents first. The packaged toolbar preload
      // can briefly observe an empty/stale query string during native reloads;
      // the sender identity remains stable and is the authoritative binding.
      if (typeof event?.sender?.id === 'number') {
        return Array.from(this.instances.values()).find(
          instance => instance.toolbarView.webContents.id === event.sender.id,
        )
      }
      return this.instances.get(instanceId)
    }

    ipcMain.handle(TOOLBAR_CHANNELS.NAVIGATE, async (event, instanceId: string, url: string) => {
      const inst = findInstance(instanceId, event)
      if (inst) await this.navigate(inst.id, url)
    })

    ipcMain.handle(TOOLBAR_CHANNELS.GO_BACK, async (event, instanceId: string) => {
      const inst = findInstance(instanceId, event)
      if (inst) await this.goBack(inst.id)
    })

    ipcMain.handle(TOOLBAR_CHANNELS.GO_FORWARD, async (event, instanceId: string) => {
      const inst = findInstance(instanceId, event)
      if (inst) await this.goForward(inst.id)
    })

    ipcMain.handle(TOOLBAR_CHANNELS.RELOAD, async (event, instanceId: string) => {
      const inst = findInstance(instanceId, event)
      if (inst) this.reload(inst.id)
    })

    ipcMain.handle(TOOLBAR_CHANNELS.STOP, async (event, instanceId: string) => {
      const inst = findInstance(instanceId, event)
      if (inst) this.stop(inst.id)
    })

    ipcMain.handle(TOOLBAR_CHANNELS.SET_REVEALED, (event, instanceId: string, revealed: boolean) => {
      const inst = findInstance(instanceId, event)
      if (!inst || inst.embeddedToolbarMode !== 'floating') return
      const nextRevealed = !!revealed
      // Resizing the native view can synthesize another pointer-enter event.
      // A no-op reveal must not reorder/layout the view again or it loops.
      if (inst.embeddedToolbarRevealed === nextRevealed) return
      inst.embeddedToolbarRevealed = nextRevealed
      this.layoutEmbeddedToolbar(inst)
    })

    ipcMain.handle(TOOLBAR_CHANNELS.PIN_EMBEDDED, (event, instanceId: string): boolean => {
      const inst = findInstance(instanceId, event)
      if (!inst || inst.embeddedHostWebContentsId === null) return false
      this.setEmbeddedToolbarMode(inst.id, inst.embeddedHostWebContentsId, 'fixed')
      return inst.embeddedToolbarMode === 'fixed'
    })

    ipcMain.handle(TOOLBAR_CHANNELS.SHOW_EMBEDDED_MENU, (event, instanceId: string, kind: 'extensions' | 'permissions' | 'passwords') => {
      const inst = findInstance(instanceId, event)
      if (!inst) return
      let origin: string | null = null
      try {
        origin = new URL(inst.currentUrl).origin
      } catch {
        // Non-web pages do not expose site permissions.
      }
      this.showToolbarMenu(kind, inst.id, origin)
    })

    ipcMain.on('browser-credentials:captured', (event, payload: { origin?: string; username?: string; password?: string }) => {
      const instance = this.getInstanceByWebContentsId(event.sender.id)
      if (!instance) return
      void this.handleCapturedCredential(instance, payload)
    })

    ipcMain.handle(TOOLBAR_CHANNELS.TOGGLE_BOOKMARK, (event, instanceId: string) => {
      const inst = findInstance(instanceId, event)
      if (!inst || !/^https?:/i.test(inst.currentUrl)) return
      const existing = this.profileStore.listBookmarks(inst.workspaceId).find((entry) => entry.url === inst.currentUrl)
      if (existing) {
        this.profileStore.removeBookmark(inst.workspaceId, existing.id)
      } else {
        this.addBookmark(inst.workspaceId, {
          url: inst.currentUrl,
          title: inst.title,
          favicon: inst.favicon,
        })
      }
      this.pushToolbarState(inst)
    })

    ipcMain.handle(INSTALL_STORE_EXTENSION_CHANNEL, async (event, storeUrl: string) => {
      const inst = this.getInstanceByWebContentsId(event.sender.id)
      if (!inst || inst.pageView.webContents.id !== event.sender.id) {
        throw new Error('The extension store page is not attached to an active Craft Agents browser tab.')
      }
      const extension = await this.installExtensionFromStore(storeUrl)
      this.emitStateChange(inst)
      return extension
    })

    ipcMain.handle(TOOLBAR_CHANNELS.MENU_GEOMETRY, async (event, instanceId: string, open: boolean, height?: number) => {
      const inst = findInstance(instanceId, event)
      if (!inst) return

      const normalizedOpen = !!open
      const normalizedHeight = Math.max(0, Math.ceil(Number(height ?? 0)))

      if (!normalizedOpen) {
        this.forceCloseToolbarMenu(inst, 'renderer-close')
        return
      }

      const changed = !inst.toolbarMenuOpen
        || inst.toolbarMenuHeight !== normalizedHeight
        || !inst.toolbarMenuOverlayActive

      if (!changed) return

      inst.toolbarMenuOpen = true
      inst.toolbarMenuHeight = normalizedHeight
      inst.toolbarMenuOverlayActive = true
      this.layoutAllViews(inst)
    })

    ipcMain.handle(TOOLBAR_CHANNELS.HIDE, async (event, instanceId: string) => {
      const inst = findInstance(instanceId, event)
      mainLog.info(`[browser-pane] toolbar ipc hide requested instanceId=${instanceId} resolved=${inst?.id ?? 'none'}`)
      if (inst) this.hide(inst.id)
    })

    ipcMain.handle(TOOLBAR_CHANNELS.DESTROY, async (event, instanceId: string) => {
      const inst = findInstance(instanceId, event)
      mainLog.info(`[browser-pane] toolbar ipc destroy requested instanceId=${instanceId} resolved=${inst?.id ?? 'none'}`)
      if (inst) this.destroyInstance(inst.id)
    })

    mainLog.info('[browser-pane] Toolbar IPC handlers registered')
  }

  // ---------------------------------------------------------------------------
  // Capability IPC — dispatcher for the `client:browser:invoke` WS capability.
  //
  // Sits between the preload bridge (which receives the WS request from the
  // remote server) and the real BrowserPaneManager. It rewrites session IDs to
  // an owner-key namespace, refuses any instance ID not owned by the calling
  // (workspaceId, sessionId), and blocks unsafe methods like `uploadFile` or
  // (optionally) `evaluate`.
  // ---------------------------------------------------------------------------

  /** Register the `__browser:invoke` IPC handler. Call once at app startup. */
  registerCapabilityIpc(): void {
    ipcMain.handle('__browser:invoke', async (_event, req: BrowserCapabilityRequest) => {
      return await this.dispatchCapability(req)
    })
    mainLog.info('[browser-pane] Capability IPC handler registered')
  }

  /** Owner-key namespacing: remote sessions can't collide with local sessions. */
  private toOwnerKey(workspaceId: string, sessionId: string): string {
    return `remote:${workspaceId}:${sessionId}`
  }

  private isRemoteOwnerKey(value: string | null | undefined): value is string {
    return typeof value === 'string' && value.startsWith('remote:')
  }

  private parseOwnerKey(value: string): { workspaceId: string; sessionId: string } | null {
    if (!this.isRemoteOwnerKey(value)) return null
    const rest = value.slice('remote:'.length)
    const colon = rest.indexOf(':')
    if (colon === -1) return null
    return { workspaceId: rest.slice(0, colon), sessionId: rest.slice(colon + 1) }
  }

  /** Replace `remote:${ws}:${sid}` owner-keys with raw `sid` on outbound payloads. */
  private stripOwnerKeysInPlace<T extends Partial<BrowserInstanceInfo>>(info: T): T {
    if (this.isRemoteOwnerKey(info.boundSessionId)) {
      info.boundSessionId = this.parseOwnerKey(info.boundSessionId)!.sessionId
    }
    if (this.isRemoteOwnerKey(info.ownerSessionId)) {
      info.ownerSessionId = this.parseOwnerKey(info.ownerSessionId)!.sessionId
    }
    return info
  }

  /**
   * Throws `BROWSER_INSTANCE_NOT_OWNED` unless the instance belongs to `ownerKey`.
   * Called by every dispatcher branch that accepts an instanceId — including read-only ones.
   */
  private requireOwnedInstance(instanceId: string, ownerKey: string): void {
    const instance = this.instances.get(instanceId)
    if (!instance || instance.window.isDestroyed()) {
      throw new CodedError('BROWSER_INSTANCE_NOT_OWNED', `Browser instance "${instanceId}" not found.`)
    }
    const owned = instance.boundSessionId === ownerKey || instance.ownerSessionId === ownerKey
    if (!owned) {
      throw new CodedError('BROWSER_INSTANCE_NOT_OWNED',
        `Browser instance "${instanceId}" is not owned by this session.`)
    }
  }

  /** Session-scoped listInstances — never returns workspace-wide windows to a remote agent. */
  private listInstancesForOwner(ownerKey: string): BrowserInstanceInfo[] {
    const infos: BrowserInstanceInfo[] = []
    for (const instance of this.instances.values()) {
      if (instance.window.isDestroyed()) {
        this.cleanupDestroyedInstance(instance, 'listInstancesForOwner')
        continue
      }
      const owned = instance.boundSessionId === ownerKey || instance.ownerSessionId === ownerKey
      if (!owned) continue
      infos.push(this.stripOwnerKeysInPlace(this.toInfo(instance)))
    }
    return infos
  }

  /**
   * Extract a plain {@link BrowserInstanceSnapshot} from a live `BrowserInstance`.
   *
   * `this.getInstance(id)` returns the full instance, which has non-cloneable
   * Electron native references (`window: BrowserWindow`, `pageView: WebContentsView`,
   * `toolbarView`, ...). When we ship the result back over the `__browser:invoke`
   * IPC channel, Electron's structured-clone serializer throws
   * "An object could not be cloned" — see the user-reported bug on the remote
   * bridge path. Always pass the live instance through this helper before
   * returning over IPC.
   */
  private toSnapshot(instance: BrowserInstance): BrowserInstanceSnapshot {
    return {
      ownerType: instance.ownerType,
      ownerSessionId: instance.ownerSessionId,
      isVisible: instance.isVisible,
      title: instance.title,
      currentUrl: instance.currentUrl,
    }
  }

  private toScreenshotWire(result: BrowserScreenshotResult): ScreenshotResultWire {
    const buf = result.imageBuffer
    return {
      imageFormat: result.imageFormat,
      imageBytes: new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength),
      metadata: result.metadata,
    }
  }

  /** Main dispatcher. Strongly-typed `switch` over `IBrowserPaneManager` methods. */
  private async dispatchCapability(req: BrowserCapabilityRequest): Promise<unknown> {
    if (!req || req.v !== 1) {
      throw new CodedError('HANDLER_ERROR',
        `Unsupported browser capability request shape (v=${(req as { v?: unknown })?.v}).`)
    }
    const ownerKey = this.toOwnerKey(req.workspaceId, req.sessionId)
    const args = req.args ?? []

    switch (req.method) {
      // -- Session-scoped (no instanceId arg, takes a sessionId) ----------------
      case 'createForSession': {
        const [, options] = args as [string, { show?: boolean } | undefined]
        return this.createForSession(ownerKey, {
          show: options?.show ?? false,
          allowReuseManual: false,
          workspaceId: req.workspaceId,
        })
      }
      // Remote agents must NEVER reuse an existing manual / unbound window —
      // even one that was previously bound to a local session. The
      // workspaceId-aware reuse filter is best-effort (it can still match
      // legacy windows stamped with workspaceId=null), so we belt-and-brace
      // by disabling manual reuse on every remote lifecycle path. Each remote
      // session-id namespace gets a fresh window unless it already owns one.
      case 'getOrCreateForSession':
        return this.createForSession(ownerKey, {
          show: false,
          allowReuseManual: false,
          workspaceId: req.workspaceId,
        })
      case 'focusBoundForSession': {
        const id = this.createForSession(ownerKey, {
          show: true,
          allowReuseManual: false,
          workspaceId: req.workspaceId,
        })
        this.focus(id)
        return id
      }
      case 'destroyForSession':
        this.destroyForSession(ownerKey)
        return undefined
      case 'clearVisualsForSession':
        await this.clearVisualsForSession(ownerKey)
        return undefined
      case 'unbindAllForSession':
        this.unbindAllForSession(ownerKey)
        return undefined
      case 'setAgentControl': {
        const [, meta] = args as [string, { displayName?: string; intent?: string }]
        this.setAgentControl(ownerKey, meta, { workspaceId: req.workspaceId })
        return undefined
      }
      case 'clearAgentControl':
        this.clearAgentControl(ownerKey)
        return undefined

      // -- Mixed (instanceId + optional sessionId) ----------------------------
      case 'clearAgentControlForInstance': {
        const [instanceId, sessionId] = args as [string, string | undefined]
        this.requireOwnedInstance(instanceId, ownerKey)
        return this.clearAgentControlForInstance(
          instanceId,
          sessionId !== undefined ? ownerKey : undefined,
        )
      }

      // -- Instance-id only ----------------------------------------------------
      case 'getInstance': {
        const [instanceId] = args as [string]
        this.requireOwnedInstance(instanceId, ownerKey)
        const live = this.getInstance(instanceId)
        if (!live) return undefined
        // `getInstance` returns the live BrowserInstance (which embeds non-
        // cloneable Electron native objects). Project to a plain snapshot
        // before crossing the IPC boundary.
        return this.stripOwnerKeysInPlace(this.toSnapshot(live))
      }
      case 'listInstances':
        return this.listInstancesForOwner(ownerKey)
      case 'bindSession': {
        const [instanceId] = args as [string, string]
        this.requireOwnedInstance(instanceId, ownerKey)
        this.bindSession(instanceId, ownerKey, { workspaceId: req.workspaceId })
        return undefined
      }
      case 'focus': {
        const [instanceId] = args as [string]
        this.requireOwnedInstance(instanceId, ownerKey)
        this.focus(instanceId)
        return undefined
      }
      case 'hide': {
        const [instanceId] = args as [string]
        this.requireOwnedInstance(instanceId, ownerKey)
        this.hide(instanceId)
        return undefined
      }
      case 'destroyInstance': {
        const [instanceId] = args as [string]
        this.requireOwnedInstance(instanceId, ownerKey)
        this.destroyInstance(instanceId)
        return undefined
      }

      // -- Navigation ----------------------------------------------------------
      case 'navigate': {
        const [instanceId, url] = args as [string, string]
        this.requireOwnedInstance(instanceId, ownerKey)
        return this.navigate(instanceId, url)
      }
      case 'goBack': {
        const [instanceId] = args as [string]
        this.requireOwnedInstance(instanceId, ownerKey)
        return this.goBack(instanceId)
      }
      case 'goForward': {
        const [instanceId] = args as [string]
        this.requireOwnedInstance(instanceId, ownerKey)
        return this.goForward(instanceId)
      }

      // -- Interaction ---------------------------------------------------------
      case 'getAccessibilitySnapshot': {
        const [instanceId] = args as [string]
        this.requireOwnedInstance(instanceId, ownerKey)
        return this.getAccessibilitySnapshot(instanceId)
      }
      case 'clickElement': {
        const [instanceId, ref, options] = args as [
          string, string,
          { waitFor?: 'none' | 'navigation' | 'network-idle'; timeoutMs?: number } | undefined,
        ]
        this.requireOwnedInstance(instanceId, ownerKey)
        return this.clickElement(instanceId, ref, options)
      }
      case 'clickAtCoordinates': {
        const [instanceId, x, y] = args as [string, number, number]
        this.requireOwnedInstance(instanceId, ownerKey)
        return this.clickAtCoordinates(instanceId, x, y)
      }
      case 'drag': {
        const [instanceId, x1, y1, x2, y2] = args as [string, number, number, number, number]
        this.requireOwnedInstance(instanceId, ownerKey)
        return this.drag(instanceId, x1, y1, x2, y2)
      }
      case 'fillElement': {
        const [instanceId, ref, value] = args as [string, string, string]
        this.requireOwnedInstance(instanceId, ownerKey)
        return this.fillElement(instanceId, ref, value)
      }
      case 'typeText': {
        const [instanceId, text] = args as [string, string]
        this.requireOwnedInstance(instanceId, ownerKey)
        return this.typeText(instanceId, text)
      }
      case 'selectOption': {
        const [instanceId, ref, value] = args as [string, string, string]
        this.requireOwnedInstance(instanceId, ownerKey)
        return this.selectOption(instanceId, ref, value)
      }
      case 'sendKey': {
        const [instanceId, keyArgs] = args as [string, BrowserKeyArgs]
        this.requireOwnedInstance(instanceId, ownerKey)
        return this.sendKey(instanceId, keyArgs)
      }
      case 'scroll': {
        const [instanceId, direction, amount] = args as [
          string, 'up' | 'down' | 'left' | 'right', number | undefined,
        ]
        this.requireOwnedInstance(instanceId, ownerKey)
        return this.scroll(instanceId, direction, amount)
      }
      case 'waitFor': {
        const [instanceId, waitArgs] = args as [string, BrowserWaitArgs]
        this.requireOwnedInstance(instanceId, ownerKey)
        return this.waitFor(instanceId, waitArgs)
      }
      case 'evaluate': {
        const [instanceId, expression] = args as [string, string]
        this.requireOwnedInstance(instanceId, ownerKey)
        if (!getAllowRemoteEvaluate()) {
          throw new CodedError('BROWSER_REMOTE_EVALUATE_BLOCKED',
            'JavaScript evaluation from remote agents is disabled in this client.')
        }
        return this.evaluate(instanceId, expression)
      }

      // -- Clipboard -----------------------------------------------------------
      case 'setClipboard': {
        const [instanceId, text] = args as [string, string]
        this.requireOwnedInstance(instanceId, ownerKey)
        return this.setClipboard(instanceId, text)
      }
      case 'getClipboard': {
        const [instanceId] = args as [string]
        this.requireOwnedInstance(instanceId, ownerKey)
        return this.getClipboard(instanceId)
      }

      // -- Capture / introspection --------------------------------------------
      case 'screenshot': {
        const [instanceId, options] = args as [string, BrowserScreenshotOptions | undefined]
        this.requireOwnedInstance(instanceId, ownerKey)
        const result = await this.screenshot(instanceId, options)
        return this.toScreenshotWire(result)
      }
      case 'screenshotRegion': {
        const [instanceId, target] = args as [string, BrowserScreenshotRegionTarget]
        this.requireOwnedInstance(instanceId, ownerKey)
        const result = await this.screenshotRegion(instanceId, target)
        return this.toScreenshotWire(result)
      }
      case 'getConsoleLogs': {
        const [instanceId, options] = args as [string, BrowserConsoleOptions | undefined]
        this.requireOwnedInstance(instanceId, ownerKey)
        return this.getConsoleLogs(instanceId, options)
      }
      case 'getNetworkLogs': {
        const [instanceId, options] = args as [string, BrowserNetworkOptions | undefined]
        this.requireOwnedInstance(instanceId, ownerKey)
        return this.getNetworkLogs(instanceId, options)
      }
      case 'windowResize': {
        const [instanceId, width, height] = args as [string, number, number]
        this.requireOwnedInstance(instanceId, ownerKey)
        return this.windowResize(instanceId, width, height)
      }
      case 'getDownloads': {
        const [instanceId, options] = args as [string, BrowserDownloadOptions | undefined]
        this.requireOwnedInstance(instanceId, ownerKey)
        return this.getDownloads(instanceId, options)
      }
      case 'uploadFile':
        throw new CodedError('BROWSER_REMOTE_UPLOAD_NOT_SUPPORTED',
          'File upload from a remote agent is not supported yet. Ask the user to attach the file to the session.')
      case 'detectSecurityChallenge': {
        const [instanceId] = args as [string]
        this.requireOwnedInstance(instanceId, ownerKey)
        return this.detectSecurityChallenge(instanceId)
      }

      default: {
        const method = (req as { method?: unknown }).method
        throw new CodedError('HANDLER_ERROR', `Unknown browser capability method: ${String(method)}`)
      }
    }
  }

  private markToolbarReady(instance: BrowserInstance, reason: string): void {
    if (instance.toolbarReady || instance.window.isDestroyed()) return

    instance.toolbarReady = true
    mainLog.info(`[browser-pane] toolbar ready id=${instance.id} reason=${reason}`)

    const shouldShowNow = instance.showOnCreate || instance.pendingShowOnReady
    if (!shouldShowNow) return

    const tokenAtReady = instance.pendingShowToken
    instance.pendingShowOnReady = false

    if (instance.window.isDestroyed()) return
    if (instance.pendingShowToken !== tokenAtReady) return

    instance.window.show()
    instance.window.focus()
    instance.isVisible = true
    this.emitStateChange(instance)

  }

  // ---------------------------------------------------------------------------
  // Agent Control — persistent overlay while agent is using the browser
  // ---------------------------------------------------------------------------

  /**
   * Activate or update the agent control overlay on the browser instance
   * bound to the given session. Called from sessions.ts on browser_* tool_start events.
   */
  setAgentControl(
    sessionId: string,
    meta: { displayName?: string; intent?: string },
    options?: { workspaceId?: string | null },
  ): void {
    for (const instance of this.instances.values()) {
      if (instance.boundSessionId === sessionId) {
        instance.agentControl = {
          active: true,
          sessionId,
          displayName: meta.displayName,
          intent: meta.intent,
        }

        // Backfill workspaceId for instances that were created before the
        // workspace was known (legacy callers / pre-workspaceId code paths).
        if (options?.workspaceId !== undefined && instance.workspaceId === null) {
          instance.workspaceId = options.workspaceId
        }

        const label = this.getAgentControlLabel(instance.agentControl)

        this.layoutEmbeddedToolbar(instance)
        this.reapplyAgentControlVisual(instance)
        this.emitStateChange(instance)

        mainLog.info(`[browser-pane] agent control activated session=${sessionId} label=${label}`)
        return
      }
    }
  }

  /**
   * Clear the agent control overlay for the given session.
   * Called on explicit browser_tool release and session/window teardown.
   */
  clearAgentControl(sessionId: string): void {
    for (const instance of this.instances.values()) {
      if (instance.boundSessionId === sessionId && instance.agentControl?.active) {
        instance.agentControl = null
        this.applyAgentControlLock(instance, false)
        this.updateNativeOverlayState(instance)
        this.layoutEmbeddedToolbar(instance)
        this.emitStateChange(instance)
        mainLog.info(`[browser-pane] agent control released session=${sessionId}`)
      }
    }
  }

  clearAgentControlForInstance(instanceId: string, sessionId?: string): { released: boolean; reason?: string } {
    const instance = this.instances.get(instanceId)
    if (!instance) {
      return { released: false, reason: `Browser window "${instanceId}" not found.` }
    }

    if (sessionId) {
      if (instance.boundSessionId && instance.boundSessionId !== sessionId) {
        return { released: false, reason: `Browser window "${instanceId}" is locked to session ${instance.boundSessionId}.` }
      }

      if (!instance.boundSessionId && instance.ownerSessionId && instance.ownerSessionId !== sessionId) {
        return { released: false, reason: `Browser window "${instanceId}" is currently owned by session ${instance.ownerSessionId}.` }
      }
    }

    if (!instance.agentControl?.active) {
      return { released: false, reason: 'No active agent overlay on the target window.' }
    }

    instance.agentControl = null
    this.applyAgentControlLock(instance, false)
    this.updateNativeOverlayState(instance)
    this.layoutEmbeddedToolbar(instance)
    this.emitStateChange(instance)
    mainLog.info(`[browser-pane] agent control released instance=${instanceId}${sessionId ? ` session=${sessionId}` : ''}`)

    return { released: true }
  }

  /**
   * Extract a theme color from the page using Safari 26-style heuristics.
   * Priority: media-aware theme-color meta → elementsFromPoint (fixed/sticky headers) → body/html bg.
   * All colors pass through (including white/black) — contrast is handled by the renderer.
   * Guards against stale extraction (URL change during async executeJavaScript).
   */
  private async extractThemeColor(instance: BrowserInstance): Promise<void> {
    if (instance.themeColor) return // already set by did-change-theme-color or observer
    const urlAtStart = instance.currentUrl
    try {
      const color = await instance.pageView.webContents.executeJavaScript(`(${THEME_COLOR_EXTRACTOR_FN})()`)
      // Guard: if user navigated away during extraction, discard stale result
      if (instance.currentUrl !== urlAtStart) return
      if (typeof color === 'string' && color.length > 0) {
        this.applyThemeColor(instance, color)
      }
    } catch {
      // page destroyed or JS error — ignore
    }
  }

  private applyThemeColor(instance: BrowserInstance, color: string | null): void {
    if (instance.themeColor === color) return
    instance.themeColor = color
    if (!instance.window.isDestroyed() && !instance.toolbarView.webContents.isDestroyed()) {
      instance.toolbarView.webContents.send(TOOLBAR_CHANNELS.THEME_COLOR, color)
    }
    this.emitStateChange(instance)
  }

  private installThemeObserver(instance: BrowserInstance, allowRetry = true): void {
    const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const urlAtInstall = instance.currentUrl
    instance.themeObserverToken = token

    void instance.pageView.webContents.executeJavaScript(`
      (() => {
        const token = ${JSON.stringify(token)};
        const prefix = ${JSON.stringify(THEME_COLOR_SIGNAL_PREFIX)} + token + ':';
        const nullSentinel = ${JSON.stringify(THEME_COLOR_NULL_SENTINEL)};
        const extractThemeColor = ${THEME_COLOR_EXTRACTOR_FN};

        const w = window;
        const previousCleanup = w.__CRAFT_THEME_OBSERVER_CLEANUP__;
        if (typeof previousCleanup === 'function') {
          try { previousCleanup(); } catch {}
        }

        let lastColor = '__unset__';
        let rafId = 0;
        let timerId = 0;
        let lastRunAt = 0;
        const minIntervalMs = ${THEME_OBSERVER_MIN_INTERVAL_MS};

        const clearScheduled = () => {
          if (timerId) {
            clearTimeout(timerId);
            timerId = 0;
          }
          if (rafId) {
            cancelAnimationFrame(rafId);
            rafId = 0;
          }
        };

        const emit = (color) => {
          const normalized = typeof color === 'string' && color.length > 0 ? color : null;
          if (normalized === lastColor) return;
          lastColor = normalized;
          console.info(prefix + (normalized ?? nullSentinel));
        };

        const run = () => {
          rafId = 0;
          lastRunAt = Date.now();
          try {
            emit(extractThemeColor());
          } catch {}
        };

        const schedule = () => {
          if (rafId || timerId) return;
          const waitMs = Math.max(0, minIntervalMs - (Date.now() - lastRunAt));
          if (waitMs > 0) {
            timerId = setTimeout(() => {
              timerId = 0;
              rafId = requestAnimationFrame(run);
            }, waitMs);
            return;
          }
          rafId = requestAnimationFrame(run);
        };

        const onScroll = () => schedule();
        const onResize = () => schedule();
        const onMutation = () => schedule();

        const headObserver = new MutationObserver(onMutation);
        if (document.head) {
          headObserver.observe(document.head, {
            subtree: true,
            childList: true,
            attributes: true,
            attributeFilter: ['name', 'content', 'media'],
          });
        }

        const rootObserver = new MutationObserver(onMutation);
        if (document.documentElement) {
          rootObserver.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['class', 'style'],
          });
        }
        if (document.body) {
          rootObserver.observe(document.body, {
            attributes: true,
            attributeFilter: ['class', 'style'],
          });
        }

        w.addEventListener('scroll', onScroll, { passive: true });
        w.addEventListener('resize', onResize, { passive: true });

        const mql = w.matchMedia('(prefers-color-scheme: dark)');
        const onSchemeChange = () => schedule();
        if (typeof mql.addEventListener === 'function') mql.addEventListener('change', onSchemeChange);
        else if (typeof mql.addListener === 'function') mql.addListener(onSchemeChange);

        w.__CRAFT_THEME_OBSERVER_CLEANUP__ = () => {
          headObserver.disconnect();
          rootObserver.disconnect();
          w.removeEventListener('scroll', onScroll);
          w.removeEventListener('resize', onResize);
          if (typeof mql.removeEventListener === 'function') mql.removeEventListener('change', onSchemeChange);
          else if (typeof mql.removeListener === 'function') mql.removeListener(onSchemeChange);
          clearScheduled();
        };

        // Fast first color for initial toolbar paint and after SPA route changes
        schedule();
      })()
    `).catch(() => {
      if (!allowRetry) return
      setTimeout(() => {
        if (!this.instances.has(instance.id)) return
        if (instance.currentUrl !== urlAtInstall) return
        if (instance.themeObserverToken !== token) return
        this.installThemeObserver(instance, false)
      }, 120)
    })
  }

  private scheduleEarlyThemeExtraction(instance: BrowserInstance, urlAtSchedule: string): void {
    setTimeout(() => {
      if (!this.instances.has(instance.id)) return
      if (instance.currentUrl !== urlAtSchedule) return
      void this.extractThemeColor(instance)
    }, EARLY_THEME_EXTRACTION_DELAY_MS)
  }

  private getInstanceByWebContentsId(webContentsId: number): BrowserInstance | undefined {
    for (const instance of this.instances.values()) {
      if (instance.pageView.webContents.id === webContentsId) return instance
    }
    return undefined
  }

  private registerPopupWindow(parentInstance: BrowserInstance, popupWindow: BrowserWindow, sourceUrl?: string): void {
    const popupWcId = popupWindow.webContents.id
    const existingParent = this.popupParentByWebContentsId.get(popupWcId)
    if (existingParent && existingParent !== parentInstance.id) {
      this.unregisterPopupWindow(popupWindow, 'reparented')
    }

    let popups = this.popupWindowsByParentInstanceId.get(parentInstance.id)
    if (!popups) {
      popups = new Set<BrowserWindow>()
      this.popupWindowsByParentInstanceId.set(parentInstance.id, popups)
    }

    popups.add(popupWindow)
    this.popupParentByWebContentsId.set(popupWcId, parentInstance.id)

    const initialUrl = sourceUrl || popupWindow.webContents.getURL?.() || 'about:blank'
    mainLog.info(`[browser-pane] popup created parent=${parentInstance.id} popupWebContentsId=${popupWcId} url=${initialUrl}`)

    popupWindow.webContents.on('did-navigate', (_event, urlFromEvent) => {
      const popupUrl = typeof popupWindow.webContents.getURL === 'function'
        ? popupWindow.webContents.getURL()
        : (urlFromEvent || initialUrl)
      mainLog.info(`[browser-pane] popup did-navigate parent=${parentInstance.id} popupWebContentsId=${popupWcId} url=${popupUrl}`)
    })

    popupWindow.webContents.on('will-navigate', (event, popupUrl) => {
      if (!popupUrl.startsWith(CRAFT_DEEPLINK_SCHEME_PREFIX)) return
      event.preventDefault()
      void this.handleDeepLinkUrl(popupUrl)
      if (!popupWindow.isDestroyed()) popupWindow.close()
    })

    popupWindow.webContents.setWindowOpenHandler((details) => {
      if (details.url.startsWith(CRAFT_DEEPLINK_SCHEME_PREFIX)) {
        void this.handleDeepLinkUrl(details.url)
        return { action: 'deny' }
      }
      try {
        const parsed = new URL(details.url)
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
          return { action: 'allow' }
        }
      } catch {
        // Deny malformed popup URLs below.
      }
      return { action: 'deny' }
    })

    popupWindow.webContents.on('did-redirect-navigation', (_event, popupUrl, isInPlace, isMainFrame) => {
      mainLog.info(
        `[browser-pane] popup redirect parent=${parentInstance.id} popupWebContentsId=${popupWcId} url=${popupUrl} inPlace=${isInPlace} mainFrame=${isMainFrame}`,
      )
    })

    popupWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (!isMainFrame) return
      mainLog.warn(
        `[browser-pane] popup did-fail-load parent=${parentInstance.id} popupWebContentsId=${popupWcId} code=${errorCode} url=${validatedURL} error=${errorDescription}`,
      )
    })

    popupWindow.on('closed', () => {
      this.unregisterPopupWindow(popupWindow, 'closed')
    })
  }

  private unregisterPopupWindow(popupWindow: BrowserWindow, reason: 'closed' | 'parent_destroy' | 'reparented'): void {
    const popupWcId = popupWindow.webContents.id
    const parentId = this.popupParentByWebContentsId.get(popupWcId)
    if (!parentId) return

    this.popupParentByWebContentsId.delete(popupWcId)

    const popups = this.popupWindowsByParentInstanceId.get(parentId)
    if (popups) {
      popups.delete(popupWindow)
      if (popups.size === 0) {
        this.popupWindowsByParentInstanceId.delete(parentId)
      }
    }

    mainLog.info(`[browser-pane] popup closed parent=${parentId} popupWebContentsId=${popupWcId} reason=${reason}`)
  }

  private closePopupsForParent(parentId: string, reason: 'parent_destroy'): void {
    const popups = this.popupWindowsByParentInstanceId.get(parentId)
    if (!popups || popups.size === 0) return

    for (const popupWindow of Array.from(popups)) {
      const popupWcId = popupWindow.webContents.id
      this.unregisterPopupWindow(popupWindow, reason)
      try {
        if (!popupWindow.isDestroyed()) {
          popupWindow.destroy()
        }
      } catch (error) {
        mainLog.warn(
          `[browser-pane] popup destroy failed parent=${parentId} popupWebContentsId=${popupWcId} reason=${reason} error=${error instanceof Error ? error.message : String(error)}`,
        )
      }
    }
  }

  private pushNetworkLog(instance: BrowserInstance, entry: BrowserNetworkEntry): void {
    instance.networkLogs.push(entry)
    if (instance.networkLogs.length > MAX_NETWORK_LOG_ENTRIES) {
      instance.networkLogs.splice(0, instance.networkLogs.length - MAX_NETWORK_LOG_ENTRIES)
    }
  }

  private pushDownloadLog(instance: BrowserInstance, entry: BrowserDownloadEntry): void {
    instance.downloads.push(entry)
    if (instance.downloads.length > MAX_DOWNLOAD_LOG_ENTRIES) {
      instance.downloads.splice(0, instance.downloads.length - MAX_DOWNLOAD_LOG_ENTRIES)
    }
  }

  private recordHistory(instance: BrowserInstance): void {
    let parsed: URL
    try {
      parsed = new URL(instance.currentUrl)
    } catch {
      return
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return
    this.profileStore.recordHistory({
      id: randomUUID(),
      workspaceId: instance.workspaceId,
      tabId: instance.id,
      url: parsed.toString(),
      title: instance.title || parsed.hostname,
      favicon: instance.favicon,
      visitedAt: Date.now(),
    })
  }

  private persistDownload(instance: BrowserInstance, entry: BrowserDownloadEntry): void {
    this.profileStore.upsertDownload({
      ...entry,
      workspaceId: instance.workspaceId,
      tabId: instance.id,
    })
  }

  private requireActiveDownload(workspaceId: string | null, id: string): { item: DownloadItem; instanceId: string } {
    const active = this.activeDownloads.get(id)
    if (!active) throw new Error('Download is no longer active.')
    const instance = this.instances.get(active.instanceId)
    if (!instance || instance.workspaceId !== workspaceId) throw new Error('Download not found in this workspace.')
    return active
  }

  private updateActiveDownloadState(id: string, state: BrowserDownloadEntry['state']): void {
    const active = this.activeDownloads.get(id)
    if (!active) return
    const instance = this.instances.get(active.instanceId)
    const entry = instance?.downloads.find((download) => download.id === id)
    if (!instance || !entry) return
    entry.state = state
    entry.bytesReceived = active.item.getReceivedBytes()
    entry.totalBytes = active.item.getTotalBytes()
    this.persistDownload(instance, entry)
  }

  private async handleCapturedCredential(
    instance: BrowserInstance,
    payload: { origin?: string; username?: string; password?: string },
  ): Promise<void> {
    const origin = payload.origin?.trim() ?? ''
    const username = payload.username?.trim().slice(0, 512) ?? ''
    const password = payload.password ?? ''
    if (!origin || !username || !password || password.length > 4096) return
    try {
      const parsed = new URL(origin)
      const pageOrigin = new URL(instance.pageView.webContents.getURL()).origin
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== pageOrigin) return
    } catch {
      return
    }
    const promptKey = `${origin}\n${username}`
    if (this.pendingCredentialPrompts.has(promptKey)) return
    this.pendingCredentialPrompts.add(promptKey)
    try {
      const existing = (await this.passwordVault.list(origin)).find((credential) => credential.username === username)
      const localeIsChinese = app.getLocale().toLowerCase().startsWith('zh')
      const host = instance.embeddedHostWindow ?? instance.window
      const result = await dialog.showMessageBox(host, {
        type: 'question',
        title: localeIsChinese ? '保存密码' : 'Save password',
        message: localeIsChinese
          ? `${existing ? '更新' : '保存'} ${username} 在 ${new URL(origin).hostname} 的密码？`
          : `${existing ? 'Update' : 'Save'} the password for ${username} on ${new URL(origin).hostname}?`,
        detail: this.passwordVault.getBackend() === 'icloud-keychain'
          ? (localeIsChinese ? '密码将安全存入 iCloud 钥匙串，并可在您的设备间同步。' : 'The password will be stored in iCloud Keychain and can sync across your devices.')
          : (localeIsChinese ? '密码将使用系统密码库加密保存在本机。' : 'The password will be encrypted locally by the operating-system password vault.'),
        buttons: [localeIsChinese ? (existing ? '更新' : '保存') : (existing ? 'Update' : 'Save'), localeIsChinese ? '暂不' : 'Not now'],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
      })
      if (result.response === 0) await this.passwordVault.save({ origin, username, password })
    } finally {
      setTimeout(() => this.pendingCredentialPrompts.delete(promptKey), 2_000)
    }
  }

  private async offerPasswordFill(instance: BrowserInstance): Promise<void> {
    let origin: string
    try {
      const parsed = new URL(instance.pageView.webContents.getURL())
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return
      origin = parsed.origin
    } catch {
      return
    }
    if (instance.credentialOfferUrl === instance.currentUrl) return
    const hasPasswordField = await instance.pageView.webContents.executeJavaScript(
      `Boolean(document.querySelector('input[type="password"]'))`,
      true,
    ).catch(() => false)
    if (!hasPasswordField) return
    const credentials = await this.passwordVault.list(origin)
    if (credentials.length === 0) return
    instance.credentialOfferUrl = instance.currentUrl
    const localeIsChinese = app.getLocale().toLowerCase().startsWith('zh')
    const choices = credentials.slice(0, 8)
    const cancelLabel = localeIsChinese ? '暂不填充' : 'Not now'
    const host = instance.embeddedHostWindow ?? instance.window
    const result = await dialog.showMessageBox(host, {
      type: 'question',
      title: localeIsChinese ? '填充已保存的密码' : 'Fill saved password',
      message: localeIsChinese ? `选择 ${new URL(origin).hostname} 的登录账号` : `Choose an account for ${new URL(origin).hostname}`,
      buttons: [...choices.map((credential) => credential.username), cancelLabel],
      defaultId: 0,
      cancelId: choices.length,
      noLink: true,
    })
    const selected = choices[result.response]
    if (selected) await this.fillSavedCredential(instance, selected.id)
  }

  private async fillSavedCredential(instance: BrowserInstance, id: string): Promise<void> {
    const localeIsChinese = app.getLocale().toLowerCase().startsWith('zh')
    const credential = await this.passwordVault.reveal(
      id,
      localeIsChinese ? '使用已保存的网页登录信息' : 'Use your saved website login',
    )
    let pageOrigin: string
    try {
      pageOrigin = new URL(instance.pageView.webContents.getURL()).origin
    } catch {
      return
    }
    if (credential.origin !== pageOrigin) throw new Error('Saved password origin does not match the current page.')
    instance.pageView.webContents.send('browser-credentials:fill', {
      username: credential.username,
      password: credential.password,
    })
  }

  private async showPasswordMenu(instance: BrowserInstance, origin: string): Promise<void> {
    const host = instance.embeddedHostWindow ?? instance.window
    if (host.isDestroyed()) return
    const localeIsChinese = app.getLocale().toLowerCase().startsWith('zh')
    const credentials = await this.passwordVault.list(origin)
    const template: MenuItemConstructorOptions[] = credentials.length > 0
      ? credentials.map((credential) => ({
          label: credential.username,
          submenu: [
            {
              label: localeIsChinese ? '使用 Touch ID 填充' : 'Fill with Touch ID',
              click: () => { void this.fillSavedCredential(instance, credential.id) },
            },
            {
              label: localeIsChinese ? '删除' : 'Delete',
              click: () => { void this.passwordVault.remove(credential.id) },
            },
          ],
        }))
      : [{ label: localeIsChinese ? '此网站没有已保存的密码' : 'No saved passwords for this site', enabled: false }]
    template.push(
      { type: 'separator' },
      {
        label: this.passwordVault.getBackend() === 'icloud-keychain'
          ? (localeIsChinese ? 'iCloud 钥匙串同步已启用' : 'iCloud Keychain sync enabled')
          : (localeIsChinese ? '系统加密密码库' : 'System-encrypted password vault'),
        enabled: false,
      },
    )
    Menu.buildFromTemplate(template).popup({ window: host })
  }

  private getExtensionActionPath(manifest: any): string | null {
    const popup = manifest?.action?.default_popup
      ?? manifest?.browser_action?.default_popup
      ?? manifest?.page_action?.default_popup
      ?? manifest?.options_ui?.page
      ?? manifest?.options_page
    return typeof popup === 'string' && popup.trim() ? popup.trim() : null
  }

  private async restoreExtensions(): Promise<void> {
    const ses = session.fromPartition(SESSION_PARTITION)
    for (const path of this.profileStore.getExtensionPaths()) {
      if (!existsSync(path)) {
        this.profileStore.removeExtensionPath(path)
        continue
      }
      try {
        await ses.extensions.loadExtension(path, { allowFileAccess: true })
        mainLog.info(`[browser-pane] restored extension path=${path}`)
      } catch (error) {
        mainLog.warn(`[browser-pane] failed to restore extension path=${path}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }

  private resolveDownloadsDir(instance: BrowserInstance): string {
    const sessionId = instance.boundSessionId ?? instance.ownerSessionId
    if (sessionId && this.sessionPathResolver) {
      const sessionPath = this.sessionPathResolver(sessionId)
      if (sessionPath) {
        const dir = join(sessionPath, 'downloads')
        mkdirSync(dir, { recursive: true })
        return dir
      }
    }
    // Fallback: OS downloads folder for manual/unbound windows
    return app.getPath('downloads')
  }

  private uniqueFilename(dir: string, filename: string): string {
    if (!existsSync(join(dir, filename))) return filename
    const { name, ext } = parsePath(filename)
    let counter = 1
    while (existsSync(join(dir, `${name}_${counter}${ext}`))) {
      counter++
    }
    return `${name}_${counter}${ext}`
  }

  private isPotentiallyDangerousDownload(filename: string, mimeType: string): boolean {
    const extension = parsePath(filename).ext.toLowerCase()
    return DANGEROUS_DOWNLOAD_EXTENSIONS.has(extension)
      || mimeType === 'application/x-msdownload'
      || mimeType === 'application/x-apple-diskimage'
      || mimeType === 'application/vnd.microsoft.portable-executable'
  }

  private promptExternalProtocol(instance: BrowserInstance, url: string): void {
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      return
    }
    if (INTERNAL_BROWSER_PROTOCOLS.has(parsed.protocol) || parsed.protocol === new URL(CRAFT_DEEPLINK_SCHEME_PREFIX).protocol) return
    const host = instance.embeddedHostWindow ?? instance.window
    const localeIsChinese = app.getLocale().toLowerCase().startsWith('zh')
    void dialog.showMessageBox(host, {
      type: 'question',
      title: localeIsChinese ? '打开外部应用' : 'Open external application',
      message: localeIsChinese ? `允许此网站打开“${parsed.protocol.slice(0, -1)}”应用吗？` : `Allow this site to open the “${parsed.protocol.slice(0, -1)}” application?`,
      detail: url,
      buttons: [localeIsChinese ? '打开' : 'Open', localeIsChinese ? '取消' : 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
    }).then((result) => {
      if (result.response === 0) void shell.openExternal(url)
    }).catch((error) => mainLog.warn(`[browser-pane] external protocol prompt failed: ${String(error)}`))
  }

  private setupSessionObservers(ses: ElectronSession): void {
    if (this.partitionObserversInitialized) return
    this.partitionObserversInitialized = true

    ses.on('select-webauthn-account', (_event, details, callback) => {
      const accounts = details.accounts
      if (accounts.length <= 1) {
        callback(accounts[0]?.credentialId ?? null)
        return
      }

      void (async () => {
        let credentialId: string | null = null
        try {
          const labels = accounts.map((account) => account.displayName || account.name || details.relyingPartyId)
          const cancelLabel = app.getLocale().toLowerCase().startsWith('zh') ? '取消' : 'Cancel'
          const result = await dialog.showMessageBox({
            type: 'question',
            title: details.relyingPartyId,
            message: app.getLocale().toLowerCase().startsWith('zh') ? '选择用于登录的通行密钥' : 'Choose a passkey to sign in',
            buttons: [...labels, cancelLabel],
            cancelId: labels.length,
            defaultId: 0,
            noLink: true,
          })
          credentialId = accounts[result.response]?.credentialId ?? null
        } catch (error) {
          mainLog.warn('[BrowserPaneManager] Failed to select a WebAuthn account:', error)
        } finally {
          callback(credentialId)
        }
      })()
    })

    ses.webRequest.onBeforeRequest((details, callback) => {
      const wcId = details.webContentsId
      if (typeof wcId === 'number' && wcId > 0) {
        const current = this.inFlightRequestsByWebContentsId.get(wcId) ?? 0
        this.inFlightRequestsByWebContentsId.set(wcId, current + 1)
        this.lastNetworkActivityByWebContentsId.set(wcId, Date.now())
      }
      callback({})
    })

    ses.webRequest.onCompleted((details) => {
      const wcId = details.webContentsId
      if (typeof wcId !== 'number' || wcId <= 0) return

      const current = this.inFlightRequestsByWebContentsId.get(wcId) ?? 0
      this.inFlightRequestsByWebContentsId.set(wcId, Math.max(0, current - 1))
      this.lastNetworkActivityByWebContentsId.set(wcId, Date.now())

      const instance = this.getInstanceByWebContentsId(wcId)
      if (!instance) return

      this.pushNetworkLog(instance, {
        timestamp: Date.now(),
        method: details.method ?? 'GET',
        url: details.url ?? '',
        status: details.statusCode ?? 0,
        resourceType: String(details.resourceType ?? 'unknown'),
        ok: (details.statusCode ?? 0) >= 200 && (details.statusCode ?? 0) < 400,
      })
    })

    ses.webRequest.onErrorOccurred((details) => {
      const wcId = details.webContentsId
      if (typeof wcId !== 'number' || wcId <= 0) return

      const current = this.inFlightRequestsByWebContentsId.get(wcId) ?? 0
      this.inFlightRequestsByWebContentsId.set(wcId, Math.max(0, current - 1))
      this.lastNetworkActivityByWebContentsId.set(wcId, Date.now())

      const instance = this.getInstanceByWebContentsId(wcId)
      if (!instance) return

      this.pushNetworkLog(instance, {
        timestamp: Date.now(),
        method: details.method ?? 'GET',
        url: details.url ?? '',
        status: 0,
        resourceType: String(details.resourceType ?? 'unknown'),
        ok: false,
      })
    })

    ses.on('will-download', (_event, item, webContents) => {
      const wcId = webContents?.id
      if (typeof wcId !== 'number') return
      const instance = this.getInstanceByWebContentsId(wcId)
      if (!instance) return

      // Auto-save: set a deterministic path so Electron doesn't show a native dialog
      const downloadsDir = this.resolveDownloadsDir(instance)
      const filename = this.uniqueFilename(downloadsDir, item.getFilename())
      const savePath = join(downloadsDir, filename)
      item.setSavePath(savePath)

      const downloadId = `dl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const started: BrowserDownloadEntry = {
        id: downloadId,
        timestamp: Date.now(),
        url: item.getURL(),
        filename,
        state: 'started',
        bytesReceived: item.getReceivedBytes(),
        totalBytes: item.getTotalBytes(),
        mimeType: item.getMimeType() || 'application/octet-stream',
        savePath,
      }
      this.pushDownloadLog(instance, started)
      this.persistDownload(instance, started)
      this.activeDownloads.set(downloadId, { item, instanceId: instance.id })

      const onUpdated = (_e: Electron.Event, state: string) => {
        const latest = instance.downloads.find((d) => d.id === downloadId)
        if (!latest) return
        latest.bytesReceived = item.getReceivedBytes()
        latest.totalBytes = item.getTotalBytes()
        latest.state = item.isPaused() ? 'paused' : state === 'interrupted' ? 'interrupted' : 'started'
        this.persistDownload(instance, latest)
      }

      item.on('updated', onUpdated)

      item.once('done', (_e, state) => {
        item.removeListener('updated', onUpdated)
        const latest = instance.downloads.find((d) => d.id === downloadId)
        if (!latest) return
        latest.bytesReceived = item.getReceivedBytes()
        latest.totalBytes = item.getTotalBytes()
        latest.savePath = item.getSavePath()
        latest.state = state === 'completed' ? 'completed' : state === 'cancelled' ? 'cancelled' : 'interrupted'
        this.persistDownload(instance, latest)
        this.activeDownloads.delete(downloadId)
      })

      if (this.isPotentiallyDangerousDownload(filename, started.mimeType)) {
        item.pause()
        started.state = 'paused'
        this.persistDownload(instance, started)
        const host = instance.embeddedHostWindow ?? instance.window
        const localeIsChinese = app.getLocale().toLowerCase().startsWith('zh')
        void dialog.showMessageBox(host, {
          type: 'warning',
          title: localeIsChinese ? '确认下载' : 'Confirm download',
          message: localeIsChinese ? `“${filename}”可能会更改您的设备。` : `“${filename}” may make changes to your device.`,
          detail: item.getURL(),
          buttons: [localeIsChinese ? '取消下载' : 'Cancel download', localeIsChinese ? '仍然保留' : 'Keep anyway'],
          defaultId: 0,
          cancelId: 0,
          noLink: true,
        }).then((result) => {
          if (!this.activeDownloads.has(downloadId)) return
          if (result.response === 1) item.resume()
          else item.cancel()
        }).catch(() => {
          if (this.activeDownloads.has(downloadId)) item.cancel()
        })
      }
    })
  }

  private logPermissionDecision(kind: 'check' | 'request', permission: string, origin: string): void {
    const isNonBlockingNoise = permission === 'background-sync'
    const suffix = isNonBlockingNoise ? ' (non-blocking)' : ''
    const message = `[browser-pane] permission denied (${kind}): ${permission} origin=${origin}${suffix}`
    if (isNonBlockingNoise) {
      mainLog.info(message)
      return
    }
    mainLog.warn(message)
  }

  private setupSessionPermissions(ses: ElectronSession): void {
    if (this.partitionPermissionsInitialized) return
    this.partitionPermissionsInitialized = true

    for (const entry of this.profileStore.listPermissions()) {
      this.permissionDecisions.set(`${entry.origin}|${entry.permission}`, entry.allowed)
    }

    const allowWithoutPrompt = new Set([
      'fullscreen',
      'pointerLock',
      'clipboard-sanitized-write',
    ])
    const promptable = new Set([
      'window-management',
      'notifications',
      'geolocation',
      'media',
      'clipboard-read',
      'idle-detection',
    ])
    const decisionKey = (origin: string, permission: string) => `${origin}|${permission}`

    if (typeof ses.setPermissionCheckHandler === 'function') {
      ses.setPermissionCheckHandler((_webContents, permission: string, requestingOrigin: string, _details: any) => {
        const allowed = allowWithoutPrompt.has(permission)
          || this.permissionDecisions.get(decisionKey(requestingOrigin, permission)) === true
        if (!allowed) {
          this.logPermissionDecision('check', permission, requestingOrigin)
        }
        return allowed
      })
    }

    if (typeof ses.setPermissionRequestHandler === 'function') {
      ses.setPermissionRequestHandler((webContents, permission: string, callback: (allow: boolean) => void, details: any) => {
        const origin = details?.requestingOrigin ?? 'unknown'
        if (allowWithoutPrompt.has(permission)) {
          callback(true)
          return
        }

        const remembered = this.permissionDecisions.get(decisionKey(origin, permission))
        if (remembered !== undefined) {
          callback(remembered)
          return
        }

        if (!promptable.has(permission)) {
          this.logPermissionDecision('request', permission, origin)
          callback(false)
          return
        }

        const instance = this.getInstanceByWebContentsId(webContents.id)
        const options: MessageBoxOptions = {
          type: 'question',
          title: 'Website permission',
          message: `${origin} wants permission to use ${permission}.`,
          detail: 'This choice is saved in the persistent Craft Agents browser profile. You can reset it from the site-permissions menu.',
          buttons: ['Allow', 'Block'],
          defaultId: 1,
          cancelId: 1,
          noLink: true,
        }
        const prompt = instance
          ? dialog.showMessageBox(instance.embeddedHostWindow ?? instance.window, options)
          : dialog.showMessageBox(options)
        void prompt.then((result) => {
          const allowed = result.response === 0
          this.permissionDecisions.set(decisionKey(origin, permission), allowed)
          this.profileStore.setPermission({
            origin,
            permission,
            allowed,
            updatedAt: Date.now(),
          })
          callback(allowed)
        }).catch(() => callback(false))
      })
    }
  }

  private isToolbarUiDocumentUrl(url: string): boolean {
    if (!url) return false
    if (url.startsWith('data:text/html')) return true

    try {
      const parsed = new URL(url)
      return parsed.pathname.toLowerCase().endsWith('/browser-toolbar.html')
    } catch {
      return /browser-toolbar\.html(?:$|[?#])/i.test(url)
    }
  }

  private setupWindowListeners(instance: BrowserInstance): void {
    const pageWc = instance.pageView.webContents
    const toolbarWc = instance.toolbarView.webContents
    const overlayWc = instance.nativeOverlayView.webContents

    instance.window.on('close', (event) => {
      const explicitDestroy = this.destroyingIds.has(instance.id)
      const interceptToHide = !explicitDestroy && instance.keepAliveOnWindowClose
      mainLog.info(`[browser-pane] window close requested id=${instance.id} explicitDestroy=${explicitDestroy} keepAlive=${instance.keepAliveOnWindowClose} interceptToHide=${interceptToHide}`)

      if (interceptToHide) {
        event.preventDefault()
        // Skip if a hide is already in flight — hide() guards against re-entry
        // itself, but bailing here also avoids redundant log noise during the
        // teardown race that triggered issue #695.
        if (!instance.isHiding) {
          this.hide(instance.id)
        }
      }
    })

    instance.window.on('resize', () => {
      if (!instance.embeddedHostWindow) this.layoutAllViews(instance)
    })

    toolbarWc.on('did-finish-load', () => {
      const loadedUrl = typeof toolbarWc.getURL === 'function' ? toolbarWc.getURL() : ''
      if (!this.isToolbarUiDocumentUrl(loadedUrl)) {
        mainLog.info(`[browser-pane] toolbar did-finish-load ignored id=${instance.id} url=${loadedUrl || 'unknown'}`)
        this.pushToolbarState(instance)
        return
      }

      this.markToolbarReady(instance, 'did-finish-load')
      this.pushToolbarState(instance)
    })

    toolbarWc.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (!isMainFrame) return
      mainLog.warn(`[browser-pane] toolbar did-fail-load id=${instance.id} code=${errorCode} url=${validatedURL} error=${errorDescription}`)
    })

    pageWc.on('did-start-loading', () => {
      instance.isLoading = true
      this.emitStateChange(instance)
      void this.pushToolbarState(instance)
    })

    pageWc.on('did-stop-loading', () => {
      instance.isLoading = false
      instance.canGoBack = pageWc.canGoBack()
      instance.canGoForward = pageWc.canGoForward()
      // Drain in-flight count — all pending requests are settled once loading stops
      this.inFlightRequestsByWebContentsId.set(pageWc.id, 0)
      this.lastNetworkActivityByWebContentsId.set(pageWc.id, Date.now())
      this.emitStateChange(instance)
      this.recordHistory(instance)
      void this.pushToolbarState(instance)
      void this.extractThemeColor(instance)
      this.reapplyAgentControlVisual(instance)
    })

    pageWc.on('render-process-gone', (_event, details) => {
      if (!this.instances.has(instance.id) || details.reason === 'clean-exit' || details.reason === 'killed') return
      const now = Date.now()
      instance.crashRecoveryAttempts = now - instance.lastCrashAt < 60_000
        ? instance.crashRecoveryAttempts + 1
        : 1
      instance.lastCrashAt = now
      instance.isLoading = false
      mainLog.error(`[browser-pane] renderer gone id=${instance.id} reason=${details.reason} code=${details.exitCode}`)
      if (instance.crashRecoveryAttempts <= 2 && /^https?:/i.test(instance.currentUrl)) {
        void pageWc.reload()
      } else {
        instance.title = app.getLocale().toLowerCase().startsWith('zh') ? '页面已崩溃' : 'Page crashed'
        this.emitStateChange(instance)
        void this.pushToolbarState(instance)
      }
    })

    pageWc.on('dom-ready', () => {
      this.installThemeObserver(instance)
      void this.extractThemeColor(instance)
      void this.offerPasswordFill(instance)
    })

    pageWc.on('before-input-event', (_event, _input) => {
      if (instance.lockState.active) {
        _event.preventDefault()
      }

      // Native sibling view ordering can briefly route the first pointer
      // event to the page while the floating toolbar is collapsed (notably
      // after navigation and renderer resize on macOS). Treat the top edge of
      // the page as a second reveal sensor so the toolbar remains reachable.
      const pointerInput = _input as typeof _input & { y?: number }
      const inputType = pointerInput.type || ''
      if (inputType === 'keyUp' && (_input.key === 'Alt' || !_input.alt)) {
        instance.altKeyPressed = false
      } else if (
        inputType === 'keyDown'
        || inputType === 'mouseDown'
        || inputType === 'pointerDown'
      ) {
        instance.altKeyPressed = Boolean(_input.alt)
      }
      if (
        instance.embeddedHostWindow
        && instance.embeddedToolbarMode === 'floating'
        && !instance.embeddedToolbarRevealed
        && instance.isVisible
        && (inputType === 'mouseMove' || inputType === 'mouseDown' || inputType === 'pointerDown')
        && typeof pointerInput.y === 'number'
        && pointerInput.y <= 12
      ) {
        instance.embeddedToolbarRevealed = true
        this.layoutEmbeddedToolbar(instance)
      }
    })

    pageWc.on('ipc-message', (_event, channel) => {
      if (channel !== EMPTY_STATE_FOCUS_CHANNEL) return
      if (process.platform !== 'win32' || !this.isBrowserEmptyStateUrl(pageWc.getURL())) return
      instance.embeddedHostWindow?.focus()
      pageWc.focus()
    })

    pageWc.on('context-menu', (_event, params) => {
      const localeIsChinese = app.getLocale().toLowerCase().startsWith('zh')
      const template: MenuItemConstructorOptions[] = []
      if (params.linkURL) {
        template.push(
          {
            label: localeIsChinese ? '在新标签页中打开链接' : 'Open link in new tab',
            click: () => {
              this.createInstance(undefined, {
                show: false,
                ownerType: 'manual',
                workspaceId: instance.workspaceId,
                embeddedHostWebContentsId: instance.embeddedHostWebContentsId ?? undefined,
                initialUrl: params.linkURL,
              })
            },
          },
          {
            label: localeIsChinese ? '复制链接' : 'Copy link',
            click: () => clipboard.writeText(params.linkURL),
          },
          { type: 'separator' },
        )
      }
      if (params.hasImageContents && params.srcURL) {
        template.push({
          label: localeIsChinese ? '下载图片' : 'Download image',
          click: () => pageWc.downloadURL(params.srcURL),
        }, { type: 'separator' })
      }
      if (params.isEditable) {
        template.push(
          { label: localeIsChinese ? '剪切' : 'Cut', enabled: params.editFlags.canCut, click: () => pageWc.cut() },
          { label: localeIsChinese ? '复制' : 'Copy', enabled: params.editFlags.canCopy, click: () => pageWc.copy() },
          { label: localeIsChinese ? '粘贴' : 'Paste', enabled: params.editFlags.canPaste, click: () => pageWc.paste() },
        )
      } else if (params.selectionText) {
        template.push({ label: localeIsChinese ? '复制' : 'Copy', click: () => pageWc.copy() })
      } else {
        template.push(
          { label: localeIsChinese ? '返回' : 'Back', enabled: pageWc.canGoBack(), click: () => pageWc.goBack() },
          { label: localeIsChinese ? '前进' : 'Forward', enabled: pageWc.canGoForward(), click: () => pageWc.goForward() },
          { label: localeIsChinese ? '重新加载' : 'Reload', click: () => pageWc.reload() },
        )
      }
      if (!app.isPackaged) {
        template.push(
          { type: 'separator' },
          { label: localeIsChinese ? '检查元素' : 'Inspect element', click: () => pageWc.inspectElement(params.x, params.y) },
        )
      }
      Menu.buildFromTemplate(template).popup({ window: instance.embeddedHostWindow ?? instance.window })
    })

    toolbarWc.on('before-input-event', (event, input) => {
      if (instance.lockState.active) {
        event.preventDefault()
      }

      const inputType = input.type || ''
      if (
        instance.embeddedToolbarMode === 'floating'
        && !instance.embeddedToolbarRevealed
        && (inputType === 'mouseMove' || inputType === 'mouseDown' || inputType === 'pointerDown')
      ) {
        instance.embeddedToolbarRevealed = true
        this.layoutEmbeddedToolbar(instance)
      }
    })

    overlayWc.on('before-input-event', (event, input) => {
      if (!instance.toolbarMenuOverlayActive) return

      const inputType = input.type || ''
      if (inputType === 'mouseDown' || inputType === 'touchStart' || inputType === 'pointerDown') {
        event.preventDefault()
        this.forceCloseToolbarMenu(instance, 'overlay-tap')
      }
    })

    pageWc.on('did-navigate', (_event, urlFromEvent) => {
      const url = typeof pageWc.getURL === 'function' ? pageWc.getURL() : (urlFromEvent || instance.currentUrl)
      const previousUrl = instance.currentUrl
      if (instance.inPageThemeTimer) {
        clearTimeout(instance.inPageThemeTimer)
        instance.inPageThemeTimer = null
      }
      instance.themeObserverToken = null
      instance.themeColor = null // reset for new page (batched with state push below)
      const normalized = this.normalizePageState(url, pageWc.getTitle())
      instance.currentUrl = normalized.url
      instance.title = normalized.title
      mainLog.info(`[browser-pane] did-navigate id=${instance.id} from=${previousUrl} to=${instance.currentUrl}`)
      instance.canGoBack = pageWc.canGoBack()
      instance.canGoForward = pageWc.canGoForward()
      // Drain in-flight count — prior page's requests are cancelled on navigation
      this.inFlightRequestsByWebContentsId.set(pageWc.id, 0)
      this.lastNetworkActivityByWebContentsId.set(pageWc.id, Date.now())
      this.emitStateChange(instance)
      void this.pushToolbarState(instance)
      this.scheduleEarlyThemeExtraction(instance, url)
      this.reapplyAgentControlVisual(instance)
    })

    pageWc.on('did-redirect-navigation', (_event, url, isInPlace, isMainFrame) => {
      if (!isMainFrame) return
      mainLog.info(`[browser-pane] did-redirect-navigation id=${instance.id} url=${url} inPlace=${isInPlace}`)
    })

    pageWc.on('did-navigate-in-page', (_event, urlFromEvent) => {
      const url = typeof pageWc.getURL === 'function' ? pageWc.getURL() : (urlFromEvent || instance.currentUrl)
      const normalized = this.normalizePageState(url, instance.title)
      instance.currentUrl = normalized.url
      instance.title = normalized.title
      instance.canGoBack = pageWc.canGoBack()
      instance.canGoForward = pageWc.canGoForward()

      void this.maybeHandleEmptyStateLaunch(instance, url).then((handled) => {
        if (handled) {
          this.emitStateChange(instance)
          void this.pushToolbarState(instance)
          return
        }

        // SPA route change — re-extract theme color (debounced)
        if (instance.inPageThemeTimer) clearTimeout(instance.inPageThemeTimer)
        instance.themeObserverToken = null
        instance.themeColor = null
        this.emitStateChange(instance)
        this.recordHistory(instance)
        void this.pushToolbarState(instance)
        this.installThemeObserver(instance)
        instance.inPageThemeTimer = setTimeout(() => { void this.extractThemeColor(instance) }, 300)
        this.reapplyAgentControlVisual(instance)
      }).catch((error) => {
        mainLog.warn(`[browser-pane] empty-state launch handling failed id=${instance.id}: ${error instanceof Error ? error.message : String(error)}`)
      })
    })

    pageWc.on('page-title-updated', (_event, title) => {
      const normalized = this.normalizePageState(pageWc.getURL(), title)
      instance.title = normalized.title
      this.recordHistory(instance)
      this.emitStateChange(instance)
      void this.pushToolbarState(instance)
    })

    pageWc.on('page-favicon-updated', (_event, favicons) => {
      instance.favicon = favicons[0] || null
      this.recordHistory(instance)
      this.emitStateChange(instance)
    })

    pageWc.on('did-change-theme-color', (_event, color) => {
      this.applyThemeColor(instance, color ?? null)
    })

    pageWc.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
      mainLog.warn(`[browser-pane] did-fail-load id=${instance.id} code=${errorCode} url=${validatedURL} error=${errorDescription}`)
    })

    pageWc.on('console-message', (_event, level, message) => {
      if (message.startsWith(THEME_COLOR_SIGNAL_PREFIX)) {
        const payload = message.slice(THEME_COLOR_SIGNAL_PREFIX.length)
        const delimiterIdx = payload.indexOf(':')
        if (delimiterIdx > 0) {
          const token = payload.slice(0, delimiterIdx)
          const value = payload.slice(delimiterIdx + 1).trim()
          if (token === instance.themeObserverToken) {
            if (value === THEME_COLOR_NULL_SENTINEL) {
              this.applyThemeColor(instance, null)
            } else if (value.length > 0) {
              this.applyThemeColor(instance, value)
            }
          }
        }
        return
      }

      const mappedLevel: BrowserConsoleEntry['level'] = level >= 3 ? 'error' : level === 2 ? 'warn' : level === 1 ? 'info' : 'log'
      instance.consoleLogs.push({
        timestamp: Date.now(),
        level: mappedLevel,
        message,
      })
      if (instance.consoleLogs.length > MAX_CONSOLE_LOG_ENTRIES) {
        instance.consoleLogs.splice(0, instance.consoleLogs.length - MAX_CONSOLE_LOG_ENTRIES)
      }

      if (level >= 2) {
        mainLog.warn(`[browser-pane] console id=${instance.id} level=${level}: ${message}`)
      }
    })

    pageWc.on('will-navigate', (event, url) => {
      if (url.startsWith(CRAFT_DEEPLINK_SCHEME_PREFIX)) {
        event.preventDefault()
        void this.handleDeepLinkUrl(url)
        return
      }
      try {
        const parsed = new URL(url)
        if (!INTERNAL_BROWSER_PROTOCOLS.has(parsed.protocol)) {
          event.preventDefault()
          this.promptExternalProtocol(instance, url)
        }
      } catch {
        event.preventDefault()
      }
    })

    pageWc.on('did-create-window', (popupWindow, details) => {
      const popupUrl = details?.url || popupWindow.webContents.getURL?.() || 'about:blank'
      this.registerPopupWindow(instance, popupWindow, popupUrl)
    })

    pageWc.setWindowOpenHandler((details) => {
      mainLog.info(
        `[browser-pane] window-open requested id=${instance.id} url=${details.url} disposition=${details.disposition ?? 'unknown'} frameName=${details.frameName || 'none'}`,
      )

      if (details.url.startsWith(CRAFT_DEEPLINK_SCHEME_PREFIX)) {
        void this.handleDeepLinkUrl(details.url)
        return { action: 'deny' }
      }

      let parsed: URL
      try {
        parsed = new URL(details.url)
      } catch {
        mainLog.warn(`[browser-pane] window-open denied id=${instance.id} reason=invalid_url url=${details.url}`)
        return { action: 'deny' }
      }

      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        mainLog.warn(`[browser-pane] window-open denied id=${instance.id} reason=unsupported_protocol protocol=${parsed.protocol} url=${details.url}`)
        this.promptExternalProtocol(instance, details.url)
        return { action: 'deny' }
      }

      if (!instance.altKeyPressed) {
        const tabId = this.createInstance(undefined, {
          show: false,
          ownerType: 'manual',
          workspaceId: instance.workspaceId,
          embeddedHostWebContentsId: instance.embeddedHostWebContentsId ?? undefined,
          initialUrl: details.url,
        })
        queueMicrotask(() => this.interactedCallback?.(tabId))
        mainLog.info(`[browser-pane] window-open redirected to workspace tab parent=${instance.id} tab=${tabId}`)
        return { action: 'deny' }
      }

      instance.altKeyPressed = false
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 520,
          height: 720,
          minWidth: 420,
          minHeight: 520,
          show: true,
          autoHideMenuBar: true,
          parent: instance.embeddedHostWindow ?? instance.window,
          modal: false,
          webPreferences: {
            partition: SESSION_PARTITION,
            session: pageWc.session,
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
          },
        },
      }
    })

    pageWc.on('focus', () => {
      this.interactedCallback?.(instance.id)
    })

    pageWc.on('blur', () => {
      instance.altKeyPressed = false
    })

    instance.window.on('focus', () => {
      this.interactedCallback?.(instance.id)
    })

    instance.window.on('show', () => {
      if (instance.embeddedHostWindow) return
      instance.isVisible = true
      this.emitStateChange(instance)
      this.reapplyAgentControlVisual(instance)
      this.pushToolbarState(instance)
      this.updateNativeOverlayState(instance)
      if (!instance.themeColor) {
        void this.extractThemeColor(instance)
      }
    })

    instance.window.on('hide', () => {
      if (instance.embeddedHostWindow) return
      instance.isVisible = false
      this.emitStateChange(instance)
      this.updateNativeOverlayState(instance)
    })

    instance.window.on('closed', () => {
      this.finalizeDestroyedInstance(instance, 'closed')
    })
  }

  private toInfo(instance: BrowserInstance): BrowserInstanceInfo {
    return {
      id: instance.id,
      url: instance.currentUrl,
      title: instance.title,
      favicon: instance.favicon,
      isLoading: instance.isLoading,
      canGoBack: instance.canGoBack,
      canGoForward: instance.canGoForward,
      boundSessionId: instance.boundSessionId,
      ownerType: instance.ownerType,
      ownerSessionId: instance.ownerSessionId,
      isVisible: instance.isVisible,
      agentControlActive: !!instance.agentControl?.active,
      themeColor: instance.themeColor,
      workspaceId: instance.workspaceId,
      toolbarMode: instance.embeddedToolbarMode,
    }
  }

  private emitStateChange(instance: BrowserInstance): void {
    if (!this.instances.has(instance.id)) {
      return
    }
    this.stateChangeCallback?.(this.toInfo(instance))
  }
}
