/**
 * RecentRail — navigation-only recent sessions + browser tabs.
 * Never feeds PendingQueue / Loops / Guidance.
 */

import type { SessionMeta } from '@/atoms/sessions'
import type { BrowserWorkspaceTab } from '@/atoms/browser-workspace'
import { getSessionTitle } from '@/utils/session'

export interface RecentRailSessionItem {
  kind: 'session'
  id: string
  title: string
  at?: number
}

export interface RecentRailTabItem {
  kind: 'tab'
  id: string
  title: string
  url: string
  at?: number
}

export type RecentRailItem = RecentRailSessionItem | RecentRailTabItem

export function buildRecentRailSessions(
  sessions: SessionMeta[],
  options: { limit?: number; excludeSessionIds?: Iterable<string> } = {},
): RecentRailSessionItem[] {
  const exclude = new Set(options.excludeSessionIds ?? [])
  const limit = options.limit ?? 8
  return sessions
    .filter((session) =>
      !session.hidden
      && !session.isArchived
      && !session.parentSessionId
      && !exclude.has(session.id),
    )
    .slice()
    .sort((a, b) => (b.lastMessageAt ?? 0) - (a.lastMessageAt ?? 0))
    .slice(0, limit)
    .map((session) => ({
      kind: 'session' as const,
      id: session.id,
      title: getSessionTitle(session),
      at: session.lastMessageAt,
    }))
}

export function buildRecentRailTabs(
  tabs: BrowserWorkspaceTab[],
  options: { limit?: number } = {},
): RecentRailTabItem[] {
  const limit = options.limit ?? 8
  // Preserve caller order (MainContentPanel already ranks recent tabs).
  return tabs
    .filter((tab) => {
      const url = (tab.url ?? '').trim()
      if (!url || url === 'about:blank') return false
      return true
    })
    .slice(0, limit)
    .map((tab) => ({
      kind: 'tab' as const,
      id: tab.id,
      title: tab.title.trim() || tab.url,
      url: tab.url,
    }))
}
