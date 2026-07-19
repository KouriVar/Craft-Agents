export interface BrowserTabLifecycleState {
  id: string
  currentUrl: string
  isLoading: boolean
  lastCrashAt: number
  crashRecoveryAttempts: number
  crashed: boolean
  crashReason: string | null
}

export type BrowserTabCrashTransition = 'ignored' | 'reload' | 'surface-recovery'

/**
 * Owns the state transitions for BrowserPaneManager's live browser tabs.
 * Electron view creation and cleanup remain in the manager facade; this class
 * keeps duplicate registration, close/event ordering, and crash recovery pure
 * enough to exercise without an Electron runtime.
 */
export class BrowserTabLifecycle<T extends BrowserTabLifecycleState> {
  private readonly tabs = new Map<string, T>()
  private readonly closingIds = new Set<string>()

  get records(): Map<string, T> {
    return this.tabs
  }

  register(tab: T): boolean {
    if (this.tabs.has(tab.id)) return false
    this.tabs.set(tab.id, tab)
    return true
  }

  has(id: string): boolean {
    return this.tabs.has(id)
  }

  beginClose(id: string): T | undefined {
    const tab = this.tabs.get(id)
    if (tab) this.closingIds.add(id)
    return tab
  }

  cancelClose(id: string): void {
    this.closingIds.delete(id)
  }

  isClosing(id: string): boolean {
    return this.closingIds.has(id)
  }

  finalizeClose(id: string, expected?: T): T | undefined {
    const current = this.tabs.get(id)
    if (!current || (expected && current !== expected)) return undefined
    this.closingIds.delete(id)
    this.tabs.delete(id)
    return current
  }

  shouldAcceptEvent(id: string): boolean {
    return this.tabs.has(id) && !this.closingIds.has(id)
  }

  markLoadStarted(tab: T): void {
    if (!this.shouldAcceptEvent(tab.id)) return
    tab.isLoading = true
    tab.crashed = false
    tab.crashReason = null
  }

  recordCrash(
    tab: T,
    details: { reason: string },
    now: number,
  ): BrowserTabCrashTransition {
    if (!this.shouldAcceptEvent(tab.id) || details.reason === 'clean-exit' || details.reason === 'killed') {
      return 'ignored'
    }

    tab.crashRecoveryAttempts = now - tab.lastCrashAt < 60_000
      ? tab.crashRecoveryAttempts + 1
      : 1
    tab.lastCrashAt = now
    tab.isLoading = false
    tab.crashReason = details.reason

    if (tab.crashRecoveryAttempts <= 2 && /^https?:/i.test(tab.currentUrl)) {
      tab.crashed = false
      return 'reload'
    }

    tab.crashed = true
    return 'surface-recovery'
  }
}
