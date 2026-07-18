/**
 * Identifies the browser workspace visible in one renderer shell.
 *
 * Both ids matter: a local workspace can mirror a differently-named remote
 * workspace, and browser instances stamped with either id belong to the same
 * visible tab set.
 */
export function getBrowserWorkspaceScopeKey(
  workspaceId: string | null | undefined,
  remoteWorkspaceId: string | null | undefined,
): string {
  return JSON.stringify([workspaceId ?? null, remoteWorkspaceId ?? null])
}

/**
 * Async browser operations may finish after the user changes workspaces. Only
 * their owning scope may update the current renderer tab list or navigation.
 */
export function isBrowserWorkspaceScopeCurrent(
  requestScopeKey: string,
  currentScopeKey: string,
): boolean {
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
