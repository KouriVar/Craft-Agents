/**
 * Deep Link Handler
 *
 * Parses craftagents:// URLs and routes to appropriate actions.
 *
 * URL Formats (workspace is optional - uses active window if omitted):
 *
 * Compound format (hierarchical navigation):
 *   craftagents://allSessions[/session/{sessionId}]            - Session list (all sessions)
 *   craftagents://flagged[/session/{sessionId}]             - Session list (flagged filter)
 *   craftagents://state/{stateId}[/session/{sessionId}]     - Session list (state filter)
 *   craftagents://sources[/source/{sourceSlug}]          - Sources list
 *   craftagents://settings[/{subpage}]                   - Settings (general, shortcuts, preferences)
 *
 * Action format:
 *   craftagents://action/{actionName}[/{id}][?params]
 *   craftagents://workspace/{workspaceId}/action/{actionName}[?params]
 *
 * Actions:
 *   new-chat                  - Create new chat, optional ?input=text&name=name&send=true
 *                               If send=true is provided with input, immediately sends the message
 *   resume-sdk-session/{id}   - Resume Claude Code session by SDK session ID
 *   delete-session/{id}       - Delete session
 *   flag-session/{id}         - Flag session
 *   unflag-session/{id}       - Unflag session
 *
 * Examples:
 *   craftagents://allSessions                               (all sessions view)
 *   craftagents://allSessions/session/abc123                (specific session)
 *   craftagents://settings/shortcuts                     (shortcuts page)
 *   craftagents://sources/source/github                  (github source info)
 *   craftagents://action/new-chat                        (uses active window)
 *   craftagents://action/resume-sdk-session/{sdkId}      (resume Claude Code session)
 *   craftagents://workspace/ws123/allSessions/session/abc123   (targets specific workspace)
 */

import type { BrowserWindow } from 'electron'
import { mainLog } from './logger'
import type { WindowManager } from './window-manager'
import { RPC_CHANNELS } from '../shared/types'
import type { EventSink } from '@craft-agent/server-core/transport'
import { isSettingsTopLevelRouteId } from '../shared/settings-registry'

export interface DeepLinkTarget {
  /** Workspace ID - undefined means use active window */
  workspaceId?: string
  /** Compound route format (e.g., 'allSessions/session/abc123', 'settings/shortcuts') */
  view?: string
  /** Action route (e.g., 'new-chat', 'delete-session') */
  action?: string
  actionParams?: Record<string, string>
  /** Window mode - if set, opens in a new window instead of navigating in existing */
  windowMode?: 'focused' | 'full'
  /** Right sidebar param (e.g., 'files/path/to/file', 'history') */
  rightSidebar?: string
}

export interface DeepLinkResult {
  success: boolean
  error?: string
  windowId?: number
}

/**
 * Trust level of the deep link source.
 * - 'trusted': system/OS deep link (open-url, second-instance, startup) or the
 *   app's own trusted renderer UI (shell.OPEN_URL, internal navigation).
 * - 'untrusted': deep link triggered from web content loaded inside the in-app
 *   browser. Sensitive actions from this source require explicit confirmation.
 */
export type DeepLinkSource = 'trusted' | 'untrusted'

/**
 * Confirmation callback for sensitive deep link actions. Injectable for tests.
 * Returns true if the user approves the action.
 */
export type DeepLinkConfirmFn = (
  target: DeepLinkTarget,
  parentWindow: BrowserWindow | null,
) => Promise<boolean>

/**
 * Actions that mutate state or exercise privilege and must not be triggered
 * silently by untrusted web content.
 */
const SENSITIVE_DEEP_LINK_ACTIONS = new Set(['delete-session', 'delete-source', 'set-mode'])

/**
 * Whether the target represents a sensitive action (state mutation / privilege
 * change / silent agent message send). Pure, unit-testable.
 */
export function isSensitiveDeepLinkAction(target: DeepLinkTarget): boolean {
  const action = target.action
  if (!action) return false
  if (SENSITIVE_DEEP_LINK_ACTIONS.has(action)) return true
  // new-session / new-chat with auto-send silently dispatches an agent message.
  if (
    (action === 'new-session' || action === 'new-chat') &&
    target.actionParams?.send === 'true'
  ) {
    return true
  }
  return false
}

/**
 * Whether this deep link requires explicit user confirmation before executing.
 * Only untrusted sources performing sensitive actions are gated; navigation
 * (view) deep links and trusted sources are never gated.
 */
export function deepLinkNeedsConfirmation(
  target: DeepLinkTarget,
  source: DeepLinkSource,
): boolean {
  return source === 'untrusted' && isSensitiveDeepLinkAction(target)
}

/**
 * Whitelisted permission-mode labels for the confirm dialog. Only known mode
 * values are rendered; any other (attacker-controlled) value is shown as
 * "未知" so the dialog text can never be used to social-engineer the user.
 * Keep in sync with parsePermissionMode (@craft-agent/shared/agent/mode-types).
 */
const PERMISSION_MODE_LABELS: Record<string, string> = {
  safe: 'Explore（只读）',
  ask: 'Ask to Edit（询问）',
  'allow-all': 'Execute（全自动）',
  explore: 'Explore（只读）',
  execute: 'Execute（全自动）',
  'ask-to-edit': 'Ask to Edit（询问）',
}

/**
 * Human-readable description of the sensitive action, used in the confirm
 * dialog. External parameters are mapped through a whitelist — never echoed
 * raw — so untrusted web content cannot inject misleading dialog text.
 */
export function describeSensitiveDeepLinkAction(target: DeepLinkTarget): string {
  switch (target.action) {
    case 'delete-session':
      return '删除一个会话'
    case 'delete-source':
      return '删除一个数据来源'
    case 'set-mode': {
      const mode = target.actionParams?.mode
      const label = mode ? PERMISSION_MODE_LABELS[mode.toLowerCase()] : undefined
      return label ? `切换权限模式（${label}）` : '切换权限模式（未知）'
    }
    case 'new-session':
    case 'new-chat':
      return '新建会话并自动发送一条消息给 Agent'
    default:
      return target.action ?? '未知操作'
  }
}

/**
 * Default confirmation: native main-process modal attached to the target window.
 * Cannot be bypassed by the requesting web page. Defaults to "cancel".
 */
async function defaultConfirmSensitiveDeepLink(
  target: DeepLinkTarget,
  parentWindow: BrowserWindow | null,
): Promise<boolean> {
  // Lazy import keeps the module top-level free of electron value imports so it
  // stays importable from unit tests without a full electron mock.
  const { dialog } = await import('electron')
  const options = {
    type: 'warning' as const,
    buttons: ['取消', '允许'],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
    title: '确认操作',
    message: '网页请求执行敏感操作',
    detail: `一个网页正在请求：${describeSensitiveDeepLinkAction(target)}。\n\n只有在你信任该来源时才允许。`,
  }
  const result = parentWindow
    ? await dialog.showMessageBox(parentWindow, options)
    : await dialog.showMessageBox(options)
  return result.response === 1
}

/**
 * Navigation payload sent to renderer via IPC
 */
export interface DeepLinkNavigation {
  /** Compound route format (e.g., 'allSessions/session/abc123', 'settings/shortcuts') */
  view?: string
  /** Action route (e.g., 'new-chat', 'delete-session') */
  action?: string
  actionParams?: Record<string, string>
}

/**
 * Parse window mode from URL search params
 */
function parseWindowMode(parsed: URL): 'focused' | 'full' | undefined {
  const windowParam = parsed.searchParams.get('window')
  if (windowParam === 'focused' || windowParam === 'full') {
    return windowParam
  }
  return undefined
}

/**
 * Parse right sidebar param from URL search params
 */
function parseRightSidebar(parsed: URL): string | undefined {
  return parsed.searchParams.get('sidebar') || undefined
}

/**
 * Parse a deep link URL into structured target
 */
export function parseDeepLink(url: string): DeepLinkTarget | null {
  try {
    const parsed = new URL(url)

    if (parsed.protocol !== 'craftagents:') {
      return null
    }

    // For custom protocols, the hostname contains the first path segment
    // e.g., craftagents://workspace/ws123 → hostname='workspace', pathname='/ws123'
    // e.g., craftagents://allSessions/chat/abc → hostname='allSessions', pathname='/chat/abc'
    const host = parsed.hostname
    const pathParts = parsed.pathname.split('/').filter(Boolean)
    const windowMode = parseWindowMode(parsed)
    const rightSidebar = parseRightSidebar(parsed)

    // craftagents://auth-callback?... (OAuth callbacks - return null to let existing handler process)
    if (host === 'auth-callback') {
      return null
    }

    // Compound route prefixes
    const COMPOUND_ROUTE_PREFIXES = [
      'allSessions', 'flagged', 'state', 'sources', 'settings', 'skills', 'automations'
    ]

    // craftagents://allSessions/..., craftagents://settings/..., etc. (compound routes)
    if (COMPOUND_ROUTE_PREFIXES.includes(host)) {
      // Reconstruct the full compound route from host + pathname (+ hash for settings sections)
      let viewRoute = pathParts.length > 0 ? `${host}/${pathParts.join('/')}` : host
      if (host === 'settings' && parsed.hash) {
        viewRoute += parsed.hash
      }
      return {
        workspaceId: undefined,
        view: viewRoute,
        windowMode,
        rightSidebar,
      }
    }

    // Top-level settings aliases / pages: craftagents://appearance, //privacy, …
    if (isSettingsTopLevelRouteId(host)) {
      let viewRoute = `settings/${host}`
      if (parsed.hash) viewRoute += parsed.hash
      return {
        workspaceId: undefined,
        view: viewRoute,
        windowMode,
        rightSidebar,
      }
    }

    // craftagents://workspace/{workspaceId}/... (with workspace targeting)
    if (host === 'workspace') {
      const workspaceId = pathParts[0]
      if (!workspaceId) return null

      const result: DeepLinkTarget = { workspaceId, windowMode, rightSidebar }

      // Check what type of route follows the workspace ID
      const routeType = pathParts[1]

      // Parse compound routes: /workspace/{id}/{compoundRoute}
      // e.g., /workspace/ws123/allSessions/session/abc123
      if (routeType && COMPOUND_ROUTE_PREFIXES.includes(routeType)) {
        const viewRoute = pathParts.slice(1).join('/')
        result.view = viewRoute
        return result
      }

      // Parse /action/{actionName}/...
      if (routeType === 'action') {
        result.action = pathParts[2]
        result.actionParams = {}
        // Handle path-based ID (e.g., /action/delete-session/{sessionId})
        if (pathParts[3]) {
          result.actionParams.id = pathParts[3]
        }
        parsed.searchParams.forEach((value, key) => {
          // Skip the window and sidebar params - they're handled separately
          if (key !== 'window' && key !== 'sidebar') {
            result.actionParams![key] = value
          }
        })
        return result
      }

      return result
    }

    // craftagents://action/... (no workspace - uses active window)
    if (host === 'action') {
      const result: DeepLinkTarget = {
        workspaceId: undefined,
        action: pathParts[0],
        actionParams: {},
        windowMode,
        rightSidebar,
      }

      if (pathParts[1]) {
        result.actionParams!.id = pathParts[1]
      }

      parsed.searchParams.forEach((value, key) => {
        // Skip the window and sidebar params - they're handled separately
        if (key !== 'window' && key !== 'sidebar') {
          result.actionParams![key] = value
        }
      })

      return result
    }

    return null
  } catch (error) {
    mainLog.error('[DeepLink] Failed to parse URL:', url, error)
    return null
  }
}

/**
 * Wait for window's renderer to signal ready
 */
function waitForWindowReady(window: BrowserWindow): Promise<void> {
  return new Promise((resolve) => {
    if (window.webContents.isLoading()) {
      window.webContents.once('did-finish-load', () => {
        // TIMING NOTE: This 100ms delay allows React to mount and register
        // IPC listeners before we send the deep link. `did-finish-load` fires
        // when the HTML is loaded, but React's useEffect hooks haven't run yet.
        // A proper handshake (renderer signals "ready") would be cleaner but
        // adds complexity for minimal gain - this delay is sufficient for all
        // practical cases and only affects reload scenarios.
        setTimeout(resolve, 100)
      })
    } else {
      resolve()
    }
  })
}

/**
 * Build a deep link URL without the window query parameter
 */
function buildDeepLinkWithoutWindowParam(url: string): string {
  const parsed = new URL(url)
  parsed.searchParams.delete('window')
  return parsed.toString()
}

/**
 * Re-entrancy guard: only one sensitive-action confirmation may be in flight
 * at a time. Prevents a malicious web page from stacking native confirm
 * dialogs by rapidly triggering craftagents:// sensitive deep links. A
 * concurrent request arriving while a confirm is already open is rejected
 * (treated as declined) instead of opening a second dialog.
 */
let sensitiveConfirmInFlight = false

/**
 * Handle a deep link by navigating to the target
 */
export async function handleDeepLink(
  url: string,
  windowManager: WindowManager,
  sink?: EventSink,
  resolveClientId?: (webContentsId: number) => string | undefined,
  preferredClientId?: string,
  options?: { source?: DeepLinkSource; confirm?: DeepLinkConfirmFn },
): Promise<DeepLinkResult> {
  const target = parseDeepLink(url)

  if (!target) {
    // Return success for null targets (like auth-callback) - they're handled elsewhere
    if (url.includes('auth-callback')) {
      return { success: true }
    }
    return { success: false, error: 'Invalid deep link URL' }
  }

  mainLog.info('[DeepLink] Handling:', target)

  // Gate sensitive actions from untrusted sources (in-app browser web content).
  // Navigation-only deep links and trusted sources are never gated.
  const source: DeepLinkSource = options?.source ?? 'trusted'
  if (deepLinkNeedsConfirmation(target, source)) {
    if (sensitiveConfirmInFlight) {
      mainLog.warn(
        '[DeepLink] Sensitive action confirm already in progress; rejecting concurrent request:',
        target.action,
      )
      return { success: false, error: 'Sensitive deep link action was declined' }
    }
    sensitiveConfirmInFlight = true
    try {
      const parentWindow =
        windowManager.getFocusedWindow() ?? windowManager.getLastActiveWindow() ?? null
      const confirm = options?.confirm ?? defaultConfirmSensitiveDeepLink
      const approved = await confirm(target, parentWindow)
      if (!approved) {
        mainLog.warn('[DeepLink] Sensitive action declined by user:', target.action)
        return { success: false, error: 'Sensitive deep link action was declined' }
      }
    } finally {
      sensitiveConfirmInFlight = false
    }
  }

  // If windowMode is set, create a new window instead of navigating in existing
  if (target.windowMode) {
    mainLog.info('[DeepLink] windowMode detected:', target.windowMode)
    // Get workspaceId from target or from current window
    let wsId = target.workspaceId
    if (!wsId) {
      const focusedWindow = windowManager.getFocusedWindow()
      mainLog.info('[DeepLink] focusedWindow:', focusedWindow?.id)
      if (focusedWindow) {
        wsId = windowManager.getWorkspaceForWindow(focusedWindow.webContents.id) ?? undefined
        mainLog.info('[DeepLink] wsId from focused window:', wsId)
      }
      if (!wsId) {
        const allWindows = windowManager.getAllWindows()
        mainLog.info('[DeepLink] allWindows count:', allWindows.length)
        if (allWindows.length > 0) {
          wsId = allWindows[0].workspaceId
          mainLog.info('[DeepLink] wsId from first window:', wsId)
        }
      }
    }

    if (!wsId) {
      mainLog.error('[DeepLink] No workspace available for new window')
      return { success: false, error: 'No workspace available for new window' }
    }

    // Build URL without window param for navigation inside the new window
    const navUrl = buildDeepLinkWithoutWindowParam(url)
    mainLog.info('[DeepLink] Creating new window with navUrl:', navUrl)

    const window = windowManager.createWindow({
      workspaceId: wsId,
      focused: target.windowMode === 'focused',
      initialDeepLink: navUrl,
    })
    mainLog.info('[DeepLink] Window created:', window.webContents.id)

    return { success: true, windowId: window.webContents.id }
  }

  // 1. Get target window (existing behavior for non-window-mode links)
  let window: BrowserWindow | null = null

  if (target.workspaceId) {
    // Workspace specified - focus or create window for that workspace
    window = windowManager.focusOrCreateWindow(target.workspaceId)
  } else {
    // No workspace - use focused window or last active
    window = windowManager.getFocusedWindow() ?? windowManager.getLastActiveWindow()

    if (!window) {
      // No windows at all - can't navigate without a workspace
      return { success: false, error: 'No active window to navigate' }
    }

    // Focus the window
    if (window.isMinimized()) {
      window.restore()
    }
    window.focus()
  }

  // 2. Wait for window to be ready (renderer loaded)
  await waitForWindowReady(window)

  // 3. Send navigation command to renderer
  if (target.view || target.action) {
    const navigation: DeepLinkNavigation = {
      view: target.view,
      action: target.action,
      actionParams: target.actionParams,
    }
    const wsId = target.workspaceId ?? windowManager.getWorkspaceForWindow(window.webContents.id)
    const resolvedClientId = resolveClientId?.(window.webContents.id)

    // Prefer the resolved target window client. Only use preferredClientId as
    // fallback when no resolver was provided (legacy call sites).
    const clientId = resolvedClientId ?? (!resolveClientId ? preferredClientId : undefined)

    if (sink && clientId) {
      sink(RPC_CHANNELS.deeplink.NAVIGATE, { to: 'client', clientId }, navigation)
    } else if (sink && wsId) {
      sink(RPC_CHANNELS.deeplink.NAVIGATE, { to: 'workspace', workspaceId: wsId }, navigation)
    }
  }

  return { success: true, windowId: window.isDestroyed() ? -1 : window.webContents.id }
}
