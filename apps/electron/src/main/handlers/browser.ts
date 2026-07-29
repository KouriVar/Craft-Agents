import {
  RPC_CHANNELS,
  type BrowserPaneBounds,
  type BrowserPaneCreateOptions,
  type BrowserEmptyStateLaunchPayload,
  type BrowserTabMenuRequest,
  type BrowserWorkspaceSnapshot,
  type BrowserSettings,
  type BrowserClearDataRequest,
} from '../../shared/types'
import type { BrowserScreenshotOptions } from '../browser-pane-manager'
import { pushTyped, type RpcServer } from '@craft-agent/server-core/transport'
import type { HandlerDeps } from './handler-deps'

export const HANDLED_CHANNELS = [
  RPC_CHANNELS.browserPane.CREATE,
  RPC_CHANNELS.browserPane.DESTROY,
  RPC_CHANNELS.browserPane.LIST,
  RPC_CHANNELS.browserPane.NAVIGATE,
  RPC_CHANNELS.browserPane.GO_BACK,
  RPC_CHANNELS.browserPane.GO_FORWARD,
  RPC_CHANNELS.browserPane.RELOAD,
  RPC_CHANNELS.browserPane.STOP,
  RPC_CHANNELS.browserPane.FOCUS,
  RPC_CHANNELS.browserPane.SET_EMBEDDED_BOUNDS,
  RPC_CHANNELS.browserPane.SET_EMBEDDED_VISIBLE,
  RPC_CHANNELS.browserPane.SET_EMBEDDED_TOOLBAR_MODE,
  RPC_CHANNELS.browserPane.SET_AUDIO_MUTED,
  RPC_CHANNELS.browserPane.LOAD_WORKSPACE_STATE,
  RPC_CHANNELS.browserPane.SAVE_WORKSPACE_STATE,
  RPC_CHANNELS.browserPane.LIST_BOOKMARKS,
  RPC_CHANNELS.browserPane.ADD_BOOKMARK,
  RPC_CHANNELS.browserPane.UPDATE_BOOKMARK,
  RPC_CHANNELS.browserPane.REMOVE_BOOKMARK,
  RPC_CHANNELS.browserPane.LIST_BOOKMARK_FOLDERS,
  RPC_CHANNELS.browserPane.CREATE_BOOKMARK_FOLDER,
  RPC_CHANNELS.browserPane.RENAME_BOOKMARK_FOLDER,
  RPC_CHANNELS.browserPane.REMOVE_BOOKMARK_FOLDER,
  RPC_CHANNELS.browserPane.IMPORT_BOOKMARKS,
  RPC_CHANNELS.browserPane.EXPORT_BOOKMARKS,
  RPC_CHANNELS.browserPane.LIST_HISTORY,
  RPC_CHANNELS.browserPane.REMOVE_HISTORY_ENTRY,
  RPC_CHANNELS.browserPane.CLEAR_HISTORY,
  RPC_CHANNELS.browserPane.LIST_DOWNLOADS,
  RPC_CHANNELS.browserPane.CLEAR_DOWNLOADS,
  RPC_CHANNELS.browserPane.OPEN_DOWNLOAD,
  RPC_CHANNELS.browserPane.SHOW_DOWNLOAD,
  RPC_CHANNELS.browserPane.PAUSE_DOWNLOAD,
  RPC_CHANNELS.browserPane.RESUME_DOWNLOAD,
  RPC_CHANNELS.browserPane.CANCEL_DOWNLOAD,
  RPC_CHANNELS.browserPane.RETRY_DOWNLOAD,
  RPC_CHANNELS.browserPane.LIST_PERMISSIONS,
  RPC_CHANNELS.browserPane.CLEAR_PERMISSION,
  RPC_CHANNELS.browserPane.GET_SETTINGS,
  RPC_CHANNELS.browserPane.UPDATE_SETTINGS,
  RPC_CHANNELS.browserPane.GET_CACHE_SIZE,
  RPC_CHANNELS.browserPane.CLEAR_DATA,
  RPC_CHANNELS.browserPane.LIST_SITE_DATA,
  RPC_CHANNELS.browserPane.CLEAR_SITE_DATA,
  RPC_CHANNELS.browserPane.CLEAR_ALL_SITE_DATA,
  RPC_CHANNELS.browserPane.LIST_EXTENSIONS,
  RPC_CHANNELS.browserPane.INSTALL_EXTENSION,
  RPC_CHANNELS.browserPane.INSTALL_EXTENSION_FROM_STORE,
  RPC_CHANNELS.browserPane.REMOVE_EXTENSION,
  RPC_CHANNELS.browserPane.OPEN_EXTENSION_ACTION,
  RPC_CHANNELS.browserPane.SHOW_TOOLBAR_MENU,
  RPC_CHANNELS.browserPane.SHOW_TAB_MENU,
  RPC_CHANNELS.browserPane.SET_EXTENSION_PREFERENCE,
  RPC_CHANNELS.browserPane.LAUNCH,
  RPC_CHANNELS.browserPane.SNAPSHOT,
  RPC_CHANNELS.browserPane.CLICK,
  RPC_CHANNELS.browserPane.FILL,
  RPC_CHANNELS.browserPane.SELECT,
  RPC_CHANNELS.browserPane.SCREENSHOT,
  RPC_CHANNELS.browserPane.EVALUATE,
  RPC_CHANNELS.browserPane.SCROLL,
] as const

export function registerBrowserHandlers(server: RpcServer, deps: HandlerDeps): void {
  const { browserPaneManager, platform } = deps
  if (!browserPaneManager) return

  server.handle(RPC_CHANNELS.browserPane.CREATE, (ctx, input?: string | BrowserPaneCreateOptions) => {
    // Stamp the window with the requester's workspace so manual UI-opened
    // tabs stay scoped to the workspace where the user clicked. If
    // ctx.workspaceId is null (no workspace context — e.g. CLI / agent
    // harness), the window stays globally visible (legacy behavior).
    const workspaceId = ctx.workspaceId ?? null

    if (typeof input === 'string') {
      return browserPaneManager.createInstance(input, { workspaceId })
    }

    if (input?.bindToSessionId) {
      if (input.embedded) {
        const id = browserPaneManager.createInstance(input.id, {
          show: input.show,
          workspaceId,
          embeddedHostWebContentsId: ctx.webContentsId ?? undefined,
          initialUrl: input.initialUrl,
          appearance: input.appearance,
        })
        browserPaneManager.bindSession(id, input.bindToSessionId, {
          workspaceId,
        })
        return id
      }
      return browserPaneManager.createForSession(input.bindToSessionId, {
        show: input.show ?? false,
        workspaceId,
      })
    }

    return browserPaneManager.createInstance(input?.id, {
      show: input?.show,
      workspaceId,
      embeddedHostWebContentsId: input?.embedded ? (ctx.webContentsId ?? undefined) : undefined,
      initialUrl: input?.initialUrl,
      appearance: input?.appearance,
    })
  })

  server.handle(RPC_CHANNELS.browserPane.DESTROY, (_ctx, id: string) => {
    browserPaneManager.destroyInstance(id)
  })

  server.handle(RPC_CHANNELS.browserPane.LIST, () => {
    // Return all instances. Workspace isolation is enforced renderer-side
    // (filterInstancesForWorkspace), which knows BOTH the local workspace id
    // and the remote-mirror workspace id for the active workspace. A server-
    // side filter on ctx.workspaceId would miss remote-stamped tabs because
    // ctx.workspaceId is always the local id (set by updateClientWorkspace).
    return browserPaneManager.listInstances()
  })

  server.handle(RPC_CHANNELS.browserPane.NAVIGATE, async (_ctx, id: string, url: string) => {
    try {
      return await browserPaneManager.navigate(id, url)
    } catch (err) {
      platform.logger.error(`[browser-pane] navigate failed for ${id}:`, err)
      throw err
    }
  })

  server.handle(RPC_CHANNELS.browserPane.GO_BACK, async (_ctx, id: string) => {
    try {
      return await browserPaneManager.goBack(id)
    } catch (err) {
      platform.logger.error(`[browser-pane] goBack failed for ${id}:`, err)
      throw err
    }
  })

  server.handle(RPC_CHANNELS.browserPane.GO_FORWARD, async (_ctx, id: string) => {
    try {
      return await browserPaneManager.goForward(id)
    } catch (err) {
      platform.logger.error(`[browser-pane] goForward failed for ${id}:`, err)
      throw err
    }
  })

  server.handle(RPC_CHANNELS.browserPane.RELOAD, (_ctx, id: string) => {
    browserPaneManager.reload(id)
  })

  server.handle(RPC_CHANNELS.browserPane.STOP, (_ctx, id: string) => {
    browserPaneManager.stop(id)
  })

  server.handle(RPC_CHANNELS.browserPane.FOCUS, (_ctx, id: string) => {
    browserPaneManager.focus(id)
  })

  server.handle(RPC_CHANNELS.browserPane.SET_EMBEDDED_BOUNDS, (ctx, id: string, bounds: BrowserPaneBounds) => {
    browserPaneManager.setEmbeddedBounds(id, ctx.webContentsId!, bounds)
  })

  server.handle(RPC_CHANNELS.browserPane.SET_EMBEDDED_VISIBLE, (ctx, id: string, visible: boolean) => {
    browserPaneManager.setEmbeddedVisible(id, ctx.webContentsId!, visible)
  })

  server.handle(RPC_CHANNELS.browserPane.SET_EMBEDDED_TOOLBAR_MODE, (ctx, id: string, mode: 'fixed' | 'floating') => {
    browserPaneManager.setEmbeddedToolbarMode(id, ctx.webContentsId!, mode)
  })

  server.handle(RPC_CHANNELS.browserPane.SET_AUDIO_MUTED, (_ctx, id: string, muted: boolean) => {
    browserPaneManager.setAudioMuted(id, muted)
  })

  server.handle(RPC_CHANNELS.browserPane.LOAD_WORKSPACE_STATE, (ctx) => {
    return browserPaneManager.loadWorkspaceState(ctx.workspaceId ?? '')
  })

  server.handle(RPC_CHANNELS.browserPane.SAVE_WORKSPACE_STATE, (ctx, snapshot: BrowserWorkspaceSnapshot) => {
    browserPaneManager.saveWorkspaceState(ctx.workspaceId ?? '', snapshot)
  })

  server.handle(RPC_CHANNELS.browserPane.LIST_BOOKMARKS, (ctx) => {
    return browserPaneManager.listBookmarks(ctx.workspaceId ?? null)
  })

  server.handle(
    RPC_CHANNELS.browserPane.ADD_BOOKMARK,
    (
      ctx,
      entry: {
        url: string
        title?: string
        favicon?: string | null
        folderId?: string | null
      },
    ) => {
    return browserPaneManager.addBookmark(ctx.workspaceId ?? null, entry)
    },
  )

  server.handle(RPC_CHANNELS.browserPane.UPDATE_BOOKMARK, (ctx, id: string, changes: { title?: string; folderId?: string | null }) => {
    return browserPaneManager.updateBookmark(ctx.workspaceId ?? null, id, changes)
  })

  server.handle(RPC_CHANNELS.browserPane.REMOVE_BOOKMARK, (ctx, idOrUrl: string) => {
    browserPaneManager.removeBookmark(ctx.workspaceId ?? null, idOrUrl)
  })

  server.handle(RPC_CHANNELS.browserPane.LIST_BOOKMARK_FOLDERS, (ctx) => {
    return browserPaneManager.listBookmarkFolders(ctx.workspaceId ?? null)
  })

  server.handle(RPC_CHANNELS.browserPane.CREATE_BOOKMARK_FOLDER, (ctx, name: string) => {
    return browserPaneManager.createBookmarkFolder(ctx.workspaceId ?? null, name)
  })

  server.handle(RPC_CHANNELS.browserPane.RENAME_BOOKMARK_FOLDER, (ctx, id: string, name: string) => {
    return browserPaneManager.renameBookmarkFolder(ctx.workspaceId ?? null, id, name)
  })

  server.handle(RPC_CHANNELS.browserPane.REMOVE_BOOKMARK_FOLDER, (ctx, id: string) => {
    browserPaneManager.removeBookmarkFolder(ctx.workspaceId ?? null, id)
  })

  server.handle(RPC_CHANNELS.browserPane.IMPORT_BOOKMARKS, (ctx) => {
    return browserPaneManager.importBookmarks(ctx.workspaceId ?? null)
  })

  server.handle(RPC_CHANNELS.browserPane.EXPORT_BOOKMARKS, (ctx) => {
    return browserPaneManager.exportBookmarks(ctx.workspaceId ?? null)
  })

  server.handle(RPC_CHANNELS.browserPane.LIST_HISTORY, (ctx, limit?: number) => {
    return browserPaneManager.listHistory(ctx.workspaceId ?? null, limit)
  })

  server.handle(RPC_CHANNELS.browserPane.REMOVE_HISTORY_ENTRY, (ctx, id: string) => {
    browserPaneManager.removeHistoryEntry(ctx.workspaceId ?? null, id)
  })

  server.handle(RPC_CHANNELS.browserPane.CLEAR_HISTORY, (ctx) => {
    browserPaneManager.clearHistory(ctx.workspaceId ?? null)
  })

  server.handle(RPC_CHANNELS.browserPane.LIST_DOWNLOADS, (ctx, limit?: number) => {
    return browserPaneManager.listBrowserDownloads(ctx.workspaceId ?? null, limit)
  })

  server.handle(RPC_CHANNELS.browserPane.CLEAR_DOWNLOADS, (ctx) => {
    browserPaneManager.clearBrowserDownloads(ctx.workspaceId ?? null)
  })

  server.handle(RPC_CHANNELS.browserPane.OPEN_DOWNLOAD, async (ctx, id: string) => {
    await browserPaneManager.openBrowserDownload(ctx.workspaceId ?? null, id)
  })

  server.handle(RPC_CHANNELS.browserPane.SHOW_DOWNLOAD, (ctx, id: string) => {
    browserPaneManager.showBrowserDownload(ctx.workspaceId ?? null, id)
  })

  server.handle(RPC_CHANNELS.browserPane.PAUSE_DOWNLOAD, (ctx, id: string) => {
    browserPaneManager.pauseBrowserDownload(ctx.workspaceId ?? null, id)
  })

  server.handle(RPC_CHANNELS.browserPane.RESUME_DOWNLOAD, (ctx, id: string) => {
    browserPaneManager.resumeBrowserDownload(ctx.workspaceId ?? null, id)
  })

  server.handle(RPC_CHANNELS.browserPane.CANCEL_DOWNLOAD, (ctx, id: string) => {
    browserPaneManager.cancelBrowserDownload(ctx.workspaceId ?? null, id)
  })

  server.handle(RPC_CHANNELS.browserPane.RETRY_DOWNLOAD, (ctx, id: string) => {
    browserPaneManager.retryBrowserDownload(ctx.workspaceId ?? null, id)
  })

  server.handle(RPC_CHANNELS.browserPane.LIST_PERMISSIONS, (_ctx, origin?: string) => {
    return browserPaneManager.listBrowserPermissions(origin)
  })

  server.handle(RPC_CHANNELS.browserPane.CLEAR_PERMISSION, (_ctx, origin: string, permission?: string) => {
    browserPaneManager.clearBrowserPermission(origin, permission)
  })

  server.handle(RPC_CHANNELS.browserPane.GET_SETTINGS, () => browserPaneManager.getBrowserSettings())
  server.handle(RPC_CHANNELS.browserPane.UPDATE_SETTINGS, (_ctx, changes: Partial<BrowserSettings>) => {
    if (!changes || typeof changes !== 'object' || Array.isArray(changes)) throw new Error('Invalid browser settings.')
    return browserPaneManager.updateBrowserSettings(changes)
  })
  server.handle(RPC_CHANNELS.browserPane.GET_CACHE_SIZE, () => browserPaneManager.getBrowserCacheSize())
  server.handle(RPC_CHANNELS.browserPane.CLEAR_DATA, (ctx, request: BrowserClearDataRequest) => {
    if (!request || typeof request !== 'object' || Array.isArray(request)) throw new Error('Invalid clear data request.')
    for (const key of ['history', 'downloads', 'cookiesAndSiteData', 'cache', 'permissions'] as const) {
      if (typeof request[key] !== 'boolean') throw new Error(`Invalid clear data option: ${key}`)
    }
    return browserPaneManager.clearBrowserData(ctx.workspaceId ?? null, request)
  })
  server.handle(RPC_CHANNELS.browserPane.LIST_SITE_DATA, () => browserPaneManager.listBrowserSiteData())
  server.handle(RPC_CHANNELS.browserPane.CLEAR_SITE_DATA, (_ctx, origin: string) => {
    if (typeof origin !== 'string' || origin.length > 2_048) throw new Error('Invalid site origin.')
    return browserPaneManager.clearBrowserSiteData(origin)
  })
  server.handle(RPC_CHANNELS.browserPane.CLEAR_ALL_SITE_DATA, () => browserPaneManager.clearAllBrowserSiteData())

  server.handle(RPC_CHANNELS.browserPane.LIST_EXTENSIONS, () => browserPaneManager.listExtensions())
  server.handle(RPC_CHANNELS.browserPane.INSTALL_EXTENSION, (_ctx, path: string) => browserPaneManager.installExtension(path))
  server.handle(RPC_CHANNELS.browserPane.INSTALL_EXTENSION_FROM_STORE, (_ctx, urlOrId: string) =>
    browserPaneManager.installExtensionFromStore(urlOrId),
  )
  server.handle(RPC_CHANNELS.browserPane.REMOVE_EXTENSION, (_ctx, id: string) => browserPaneManager.removeExtension(id))
  server.handle(RPC_CHANNELS.browserPane.OPEN_EXTENSION_ACTION, (_ctx, extensionId: string, tabId?: string | null) => {
    return browserPaneManager.openExtensionAction(extensionId, tabId)
  })
  server.handle(
    RPC_CHANNELS.browserPane.SHOW_TOOLBAR_MENU,
    (_ctx, kind: 'extensions' | 'permissions', tabId?: string | null) => {
    browserPaneManager.showToolbarMenu(kind, tabId)
    },
  )
  server.handle(RPC_CHANNELS.browserPane.SHOW_TAB_MENU, (ctx, request: BrowserTabMenuRequest) => {
    return browserPaneManager.showTabMenu(ctx.webContentsId!, request)
  })
  server.handle(
    RPC_CHANNELS.browserPane.SET_EXTENSION_PREFERENCE,
    (_ctx, extensionId: string, preference: { pinned?: boolean; hidden?: boolean; order?: number }) => {
    browserPaneManager.setExtensionPreference(extensionId, preference)
    },
  )

  server.handle(RPC_CHANNELS.browserPane.LAUNCH, async (ctx, payload: BrowserEmptyStateLaunchPayload) => {
    try {
      return await browserPaneManager.handleEmptyStateLaunchFromRenderer(ctx.webContentsId!, payload)
    } catch (err) {
      platform.logger.error('[browser-pane] empty-state launch IPC failed:', err)
      throw err
    }
  })

  server.handle(RPC_CHANNELS.browserPane.SNAPSHOT, async (_ctx, id: string) => {
    try {
      return await browserPaneManager.getAccessibilitySnapshot(id)
    } catch (err) {
      platform.logger.error(`[browser-pane] snapshot failed for ${id}:`, err)
      throw err
    }
  })

  server.handle(RPC_CHANNELS.browserPane.CLICK, async (_ctx, id: string, ref: string) => {
    try {
      return await browserPaneManager.clickElement(id, ref)
    } catch (err) {
      platform.logger.error(`[browser-pane] click failed for ${id} ref=${ref}:`, err)
      throw err
    }
  })

  server.handle(RPC_CHANNELS.browserPane.FILL, async (_ctx, id: string, ref: string, value: string) => {
    try {
      return await browserPaneManager.fillElement(id, ref, value)
    } catch (err) {
      platform.logger.error(`[browser-pane] fill failed for ${id} ref=${ref}:`, err)
      throw err
    }
  })

  server.handle(RPC_CHANNELS.browserPane.SELECT, async (_ctx, id: string, ref: string, value: string) => {
    try {
      return await browserPaneManager.selectOption(id, ref, value)
    } catch (err) {
      platform.logger.error(`[browser-pane] select failed for ${id} ref=${ref}:`, err)
      throw err
    }
  })

  server.handle(RPC_CHANNELS.browserPane.SCREENSHOT, async (_ctx, id: string, options?: BrowserScreenshotOptions) => {
    try {
      const result = await browserPaneManager.screenshot(id, options)
      return {
        base64: result.imageBuffer.toString('base64'),
        imageFormat: result.imageFormat,
        metadata: result.metadata,
      }
    } catch (err) {
      platform.logger.error(`[browser-pane] screenshot failed for ${id}:`, err)
      throw err
    }
  })

  server.handle(RPC_CHANNELS.browserPane.EVALUATE, async (_ctx, id: string, expression: string) => {
    try {
      return await browserPaneManager.evaluate(id, expression)
    } catch (err) {
      platform.logger.error(`[browser-pane] evaluate failed for ${id}:`, err)
      throw err
    }
  })

  server.handle(RPC_CHANNELS.browserPane.SCROLL, async (_ctx, id: string, direction: string, amount?: number) => {
    const validDirections = ['up', 'down', 'left', 'right']
    if (!validDirections.includes(direction)) {
      throw new Error(`Invalid scroll direction: ${direction}`)
    }
    try {
      return await browserPaneManager.scroll(id, direction as 'up' | 'down' | 'left' | 'right', amount)
    } catch (err) {
      platform.logger.error(`[browser-pane] scroll failed for ${id}:`, err)
      throw err
    }
  })

  // Forward browser events to all locally-connected renderers. Workspace
  // isolation is enforced renderer-side (filterInstancesForWorkspace), which
  // handles both the local workspace id and the remote-mirror workspace id.
  //
  // We can't route STATE_CHANGED to `{ to: 'workspace', workspaceId }` here
  // because the broadcast routing uses the client's transport-level workspaceId
  // (the local Craft Agents window's id, set by `updateClientWorkspace`),
  // while remote-bridged instances are stamped with the remote server's
  // workspaceId. The two never match, so a workspace-targeted broadcast would
  // silently fail to reach the renderer. Broadcast to all + filter in the
  // renderer is the contract that actually works in both local-only and
  // remote-mirror deployments.
  browserPaneManager.onStateChange((info) => {
    pushTyped(server, RPC_CHANNELS.browserPane.STATE_CHANGED, { to: 'all' }, info)
  })

  browserPaneManager.onRemoved((id) => {
    pushTyped(server, RPC_CHANNELS.browserPane.REMOVED, { to: 'all' }, id)
  })

  browserPaneManager.onInteracted((id) => {
    pushTyped(server, RPC_CHANNELS.browserPane.INTERACTED, { to: 'all' }, id)
  })

  browserPaneManager.onProfileChanged((kind) => {
    pushTyped(server, RPC_CHANNELS.browserPane.PROFILE_CHANGED, { to: 'all' }, kind)
  })
}
