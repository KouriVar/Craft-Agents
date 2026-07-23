/**
 * BrowserEventProvider — emit browser.* cognition events (fail-soft).
 */

import {
  buildBrowserBookmarkCreatedEvent,
  buildBrowserPageClosedEvent,
  buildBrowserPageOpenedEvent,
  buildBrowserTabAttachedEvent,
  shouldEmitBrowserPageOpened,
  type CognitionEventInput,
} from '@craft-agent/shared/cognition'
import { getWorkspaceByNameOrId } from '@craft-agent/shared/config'
import { createLogger } from '@craft-agent/shared/utils'
import { getCognitionService } from './CognitionService.ts'

const log = createLogger('browser-event-provider')

function appendSafe(
  workspaceDataRoot: string,
  workspaceId: string | undefined,
  input: CognitionEventInput,
): void {
  try {
    getCognitionService(workspaceDataRoot, workspaceId).appendEventSafe(input)
  } catch (error) {
    log.warn('Browser cognition append failed (non-fatal)', {
      type: input.type,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

function resolveWorkspaceRoot(workspaceId?: string | null): { id: string; rootPath: string } | null {
  if (!workspaceId) return null
  const workspace = getWorkspaceByNameOrId(workspaceId)
  if (!workspace?.rootPath) return null
  return { id: workspace.id, rootPath: workspace.rootPath }
}

export function emitBrowserPageOpened(input: {
  workspaceId?: string | null
  tabId: string
  url: string
  title?: string
  ownerType: 'session' | 'manual'
  boundSessionId?: string | null
  agentControlActive?: boolean
  sessionId?: string
  projectId?: string
  trigger?: 'load' | 'spa' | 'agent_navigate'
}): void {
  try {
    if (!shouldEmitBrowserPageOpened({
      url: input.url,
      title: input.title,
      boundSessionId: input.boundSessionId,
      ownerType: input.ownerType,
      agentControlActive: input.agentControlActive,
      workspaceId: input.workspaceId,
    })) return
    const workspace = resolveWorkspaceRoot(input.workspaceId)
    if (!workspace) return
    const event = buildBrowserPageOpenedEvent({
      workspaceId: workspace.id,
      projectId: input.projectId,
      sessionId: input.sessionId || input.boundSessionId || undefined,
      tabId: input.tabId,
      url: input.url,
      title: input.title,
      ownerType: input.ownerType,
      boundSessionId: input.boundSessionId || undefined,
      trigger: input.trigger,
    })
    if (!event) return
    appendSafe(workspace.rootPath, workspace.id, event)
  } catch (error) {
    log.warn('emitBrowserPageOpened failed (non-fatal)', {
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

export function emitBrowserTabAttached(input: {
  workspaceId?: string | null
  tabId: string
  boundSessionId: string
  ownerType?: 'session' | 'manual'
  url?: string
  title?: string
  projectId?: string
}): void {
  try {
    const workspace = resolveWorkspaceRoot(input.workspaceId)
    if (!workspace) return
    appendSafe(
      workspace.rootPath,
      workspace.id,
      buildBrowserTabAttachedEvent({
        workspaceId: workspace.id,
        projectId: input.projectId,
        sessionId: input.boundSessionId,
        tabId: input.tabId,
        boundSessionId: input.boundSessionId,
        ownerType: input.ownerType,
        url: input.url,
        title: input.title,
      }),
    )
  } catch (error) {
    log.warn('emitBrowserTabAttached failed (non-fatal)', {
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

export function emitBrowserBookmarkCreated(input: {
  workspaceId?: string | null
  bookmarkId: string
  url: string
  title?: string
  sessionId?: string
  projectId?: string
}): void {
  try {
    const workspace = resolveWorkspaceRoot(input.workspaceId)
    if (!workspace) return
    const event = buildBrowserBookmarkCreatedEvent({
      workspaceId: workspace.id,
      projectId: input.projectId,
      sessionId: input.sessionId,
      bookmarkId: input.bookmarkId,
      url: input.url,
      title: input.title,
    })
    if (!event) return
    appendSafe(workspace.rootPath, workspace.id, event)
  } catch (error) {
    log.warn('emitBrowserBookmarkCreated failed (non-fatal)', {
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

export function emitBrowserPageClosed(input: {
  workspaceId?: string | null
  tabId: string
  url?: string
  title?: string
  boundSessionId?: string | null
  sessionId?: string
  projectId?: string
}): void {
  try {
    const workspace = resolveWorkspaceRoot(input.workspaceId)
    if (!workspace) return
    // Low priority — only emit when session-bound to keep Ledger quiet.
    if (!input.boundSessionId && !input.sessionId) return
    appendSafe(
      workspace.rootPath,
      workspace.id,
      buildBrowserPageClosedEvent({
        workspaceId: workspace.id,
        projectId: input.projectId,
        sessionId: input.sessionId || input.boundSessionId || undefined,
        tabId: input.tabId,
        url: input.url,
        title: input.title,
        boundSessionId: input.boundSessionId || undefined,
      }),
    )
  } catch (error) {
    log.warn('emitBrowserPageClosed failed (non-fatal)', {
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
