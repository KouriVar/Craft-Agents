import * as storage from '@/lib/local-storage'

export interface PersistedBrowserTab {
  id: string
  url: string
  title: string
  favicon?: string | null
  createdAt?: number
  lastAccessedAt?: number
  pageState?: string | null
  pinned?: boolean
}

export interface PersistedBrowserWorkspace {
  version: 1
  activeTabId: string | null
  tabs: PersistedBrowserTab[]
}

const EMPTY_WORKSPACE: PersistedBrowserWorkspace = {
  version: 1,
  activeTabId: null,
  tabs: [],
}

export function loadBrowserWorkspace(workspaceId: string): PersistedBrowserWorkspace {
  const value = storage.get<PersistedBrowserWorkspace | null>(
    storage.KEYS.browserWorkspace,
    null,
    workspaceId,
  )
  if (!value || value.version !== 1 || !Array.isArray(value.tabs)) return EMPTY_WORKSPACE

  const seen = new Set<string>()
  const tabs = value.tabs.filter((tab) => {
    if (!tab || typeof tab.id !== 'string' || typeof tab.url !== 'string' || seen.has(tab.id)) {
      return false
    }
    seen.add(tab.id)
    return true
  })
  const activeTabId = value.activeTabId && seen.has(value.activeTabId)
    ? value.activeTabId
    : (tabs[0]?.id ?? null)

  return { version: 1, activeTabId, tabs }
}

export function saveBrowserWorkspace(
  workspaceId: string,
  workspace: PersistedBrowserWorkspace,
): void {
  storage.set(storage.KEYS.browserWorkspace, workspace, workspaceId)
}
