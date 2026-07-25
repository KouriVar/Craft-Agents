/**
 * Project-related browser tabs (v0.16.3 Task 3).
 *
 * Read-time attribution only: tab.ownerSessionId / boundSessionId → Session.projectId.
 * Does not touch browser profile, snapshot schema, or projectId persistence.
 */

import type { SessionMeta } from '@/atoms/sessions'
import type { BrowserWorkspaceTab } from '@/atoms/browser-workspace'

export interface ProjectBrowserTabItem {
  id: string
  title: string
  url: string
  hostname?: string
}

function tabSessionId(tab: BrowserWorkspaceTab): string | null {
  // Prefer ownerSessionId (survives unbind); fall back to live boundSessionId.
  return tab.ownerSessionId || tab.boundSessionId || null
}

export function tabHostname(url: string): string | undefined {
  try {
    const host = new URL(url).hostname
    return host || undefined
  } catch {
    return undefined
  }
}

function isBrowsableTab(tab: BrowserWorkspaceTab): boolean {
  const url = (tab.url ?? '').trim()
  if (!url || url === 'about:blank') return false
  return true
}

/**
 * Live browser tabs that belong to a project via their owning/bound session.
 * Preserves relative order from `tabs`, promotes visible tabs, limits to `limit`.
 */
export function findProjectBrowserTabs(
  tabs: readonly BrowserWorkspaceTab[],
  sessions: Map<string, SessionMeta> | Iterable<SessionMeta>,
  projectId: string,
  options: { limit?: number } = {},
): ProjectBrowserTabItem[] {
  const limit = options.limit ?? 5
  const metaById = sessions instanceof Map
    ? sessions
    : new Map(Array.from(sessions, (meta) => [meta.id, meta]))

  const matched: Array<{ tab: BrowserWorkspaceTab; index: number }> = []
  tabs.forEach((tab, index) => {
    if (!isBrowsableTab(tab)) return
    const sessionId = tabSessionId(tab)
    if (!sessionId) return
    const meta = metaById.get(sessionId)
    if (!meta || meta.projectId !== projectId) return
    matched.push({ tab, index })
  })

  matched.sort((a, b) => {
    const vis = Number(Boolean(b.tab.isVisible)) - Number(Boolean(a.tab.isVisible))
    if (vis !== 0) return vis
    return a.index - b.index
  })

  return matched.slice(0, limit).map(({ tab }) => ({
    id: tab.id,
    title: (tab.title ?? '').trim() || tab.url,
    url: tab.url,
    hostname: tabHostname(tab.url),
  }))
}
