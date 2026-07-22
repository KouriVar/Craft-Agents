/**
 * Identifies the browser workspace visible in one renderer shell.
 *
 * Both ids matter: a local workspace can mirror a differently-named remote
 * workspace, and browser instances stamped with either id belong to the same
 * visible tab set.
 */
export function getBrowserWorkspaceScopeKey(workspaceId: string | null | undefined, remoteWorkspaceId: string | null | undefined): string {
  return JSON.stringify([workspaceId ?? null, remoteWorkspaceId ?? null])
}

/**
 * Async browser operations may finish after the user changes workspaces. Only
 * their owning scope may update the current renderer tab list or navigation.
 */
export function isBrowserWorkspaceScopeCurrent(requestScopeKey: string, currentScopeKey: string): boolean {
  return requestScopeKey === currentScopeKey
}

/** Coalesces one in-flight request per browser workspace scope. */
export class BrowserWorkspaceRequestGate<T> {
  private readonly pending = new Map<string, Promise<T>>()

  run(scopeKey: string, createRequest: () => Promise<T>): Promise<T> {
    const existing = this.pending.get(scopeKey)
    if (existing) return existing

    const request = createRequest()
    this.pending.set(scopeKey, request)
    const clear = () => {
      if (this.pending.get(scopeKey) === request) {
        this.pending.delete(scopeKey)
      }
    }
    void request.then(clear, clear)
    return request
  }
}

export interface BrowserTabRemovalTransition<T> {
  tabs: T[]
  activeTabId: string | null
  removedActiveTab: boolean
  needsReplacement: boolean
}

/** Stable partition used by the vertical tab list: pinned tabs stay first. */
export function orderBrowserTabsByPinned<T extends { pinned?: boolean }>(tabs: T[]): T[] {
  return [...tabs.filter((tab) => tab.pinned), ...tabs.filter((tab) => !tab.pinned)]
}

/**
 * Computes tab removal and fallback selection without depending on React or IPC.
 * Prefer the previous neighbour, matching established browser tab behaviour.
 */
export function getBrowserTabRemovalTransition<T extends { id: string }>(
  tabs: T[],
  removedTabId: string,
  activeTabId: string | null,
): BrowserTabRemovalTransition<T> {
  const removedIndex = tabs.findIndex((tab) => tab.id === removedTabId)
  if (removedIndex < 0) {
    return {
      tabs,
      activeTabId,
      removedActiveTab: false,
      needsReplacement: false,
    }
  }

  const nextTabs = tabs.filter((tab) => tab.id !== removedTabId)
  const removedActiveTab = activeTabId === removedTabId
  if (!removedActiveTab) {
    return {
      tabs: nextTabs,
      activeTabId,
      removedActiveTab: false,
      needsReplacement: false,
    }
  }

  const fallback = nextTabs[Math.max(0, removedIndex - 1)] ?? nextTabs[0] ?? null
  return {
    tabs: nextTabs,
    activeTabId: fallback?.id ?? null,
    removedActiveTab: true,
    needsReplacement: fallback === null,
  }
}

/**
 * Batch variant used by “close other tabs” and “close tabs below”. The active
 * tab falls back to the nearest surviving previous tab, then the next tab.
 */
export function getBrowserTabsRemovalTransition<T extends { id: string }>(
  tabs: T[],
  removedTabIds: Iterable<string>,
  activeTabId: string | null,
): BrowserTabRemovalTransition<T> {
  const removedIds = new Set(removedTabIds)
  if (removedIds.size === 0 || !tabs.some((tab) => removedIds.has(tab.id))) {
    return {
      tabs,
      activeTabId,
      removedActiveTab: false,
      needsReplacement: false,
    }
  }

  const nextTabs = tabs.filter((tab) => !removedIds.has(tab.id))
  const removedActiveTab = activeTabId !== null && removedIds.has(activeTabId)
  if (!removedActiveTab) {
    return {
      tabs: nextTabs,
      activeTabId,
      removedActiveTab: false,
      needsReplacement: false,
    }
  }

  const activeIndex = tabs.findIndex((tab) => tab.id === activeTabId)
  let fallback: T | null = null
  for (let index = activeIndex - 1; index >= 0; index -= 1) {
    const candidate = tabs[index]
    if (candidate && !removedIds.has(candidate.id)) {
      fallback = candidate
      break
    }
  }
  if (!fallback) {
    fallback = tabs.slice(activeIndex + 1).find((tab) => !removedIds.has(tab.id)) ?? null
  }

  return {
    tabs: nextTabs,
    activeTabId: fallback?.id ?? null,
    removedActiveTab: true,
    needsReplacement: fallback === null,
  }
}

/** Prevents late state events from resurrecting a tab while destroy is pending. */
export class BrowserWorkspaceTabCloseGuard {
  private readonly closingIds = new Set<string>()

  markClosing(id: string): void {
    this.closingIds.add(id)
  }

  cancelClosing(id: string): void {
    this.closingIds.delete(id)
  }

  shouldAcceptState(id: string): boolean {
    return !this.closingIds.has(id)
  }
}
