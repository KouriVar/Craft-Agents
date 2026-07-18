import { describe, expect, it } from 'bun:test'
import {
  BrowserWorkspaceRequestGate,
  BrowserWorkspaceTabCloseGuard,
  getBrowserTabRemovalTransition,
  getBrowserWorkspaceScopeKey,
  isBrowserWorkspaceScopeCurrent,
} from '../browser-workspace-lifecycle'

describe('browser workspace lifecycle scope', () => {
  it('keeps requests in the same local and remote workspace scope', () => {
    const request = getBrowserWorkspaceScopeKey('local-a', 'remote-a')

    expect(isBrowserWorkspaceScopeCurrent(
      request,
      getBrowserWorkspaceScopeKey('local-a', 'remote-a'),
    )).toBe(true)
  })

  it('rejects a completion after the local workspace changes', () => {
    const request = getBrowserWorkspaceScopeKey('local-a', null)

    expect(isBrowserWorkspaceScopeCurrent(
      request,
      getBrowserWorkspaceScopeKey('local-b', null),
    )).toBe(false)
  })

  it('treats a changed remote mirror as a different browser scope', () => {
    const request = getBrowserWorkspaceScopeKey('local-a', 'remote-a')

    expect(isBrowserWorkspaceScopeCurrent(
      request,
      getBrowserWorkspaceScopeKey('local-a', 'remote-b'),
    )).toBe(false)
  })

  it('does not collide missing ids with literal string values', () => {
    expect(getBrowserWorkspaceScopeKey(null, null)).not.toBe(
      getBrowserWorkspaceScopeKey('null', null),
    )
  })

  it('coalesces concurrent requests only within the same workspace scope', async () => {
    const gate = new BrowserWorkspaceRequestGate<string>()
    let requests = 0
    let resolveFirst!: (value: string) => void
    const scopeA = getBrowserWorkspaceScopeKey('local-a', null)
    const scopeB = getBrowserWorkspaceScopeKey('local-b', null)
    const first = gate.run(scopeA, () => {
      requests += 1
      return new Promise<string>((resolve) => { resolveFirst = resolve })
    })
    const duplicate = gate.run(scopeA, async () => {
      requests += 1
      return 'duplicate'
    })
    const otherWorkspace = gate.run(scopeB, async () => {
      requests += 1
      return 'workspace-b'
    })

    expect(duplicate).toBe(first)
    expect(requests).toBe(2)
    expect(await otherWorkspace).toBe('workspace-b')
    resolveFirst('workspace-a')
    expect(await first).toBe('workspace-a')
  })

  it('allows a new request after the previous request settles', async () => {
    const gate = new BrowserWorkspaceRequestGate<number>()
    const scope = getBrowserWorkspaceScopeKey('local-a', null)
    let requests = 0

    expect(await gate.run(scope, async () => ++requests)).toBe(1)
    expect(await gate.run(scope, async () => ++requests)).toBe(2)
  })

  it('selects the previous neighbour when the active tab is removed', () => {
    const transition = getBrowserTabRemovalTransition(
      [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      'b',
      'b',
    )

    expect(transition.tabs.map((tab) => tab.id)).toEqual(['a', 'c'])
    expect(transition.activeTabId).toBe('a')
    expect(transition.removedActiveTab).toBe(true)
    expect(transition.needsReplacement).toBe(false)
  })

  it('requests a replacement when the last active tab is removed', () => {
    expect(getBrowserTabRemovalTransition([{ id: 'only' }], 'only', 'only')).toMatchObject({
      tabs: [],
      activeTabId: null,
      removedActiveTab: true,
      needsReplacement: true,
    })
  })

  it('keeps the active tab when a background tab is removed', () => {
    expect(getBrowserTabRemovalTransition([{ id: 'a' }, { id: 'b' }], 'b', 'a')).toMatchObject({
      activeTabId: 'a',
      removedActiveTab: false,
      needsReplacement: false,
    })
  })

  it('rejects late state while close is pending and accepts it after rollback', () => {
    const guard = new BrowserWorkspaceTabCloseGuard()
    guard.markClosing('tab-a')
    expect(guard.shouldAcceptState('tab-a')).toBe(false)
    expect(guard.shouldAcceptState('tab-b')).toBe(true)

    guard.cancelClosing('tab-a')
    expect(guard.shouldAcceptState('tab-a')).toBe(true)
  })
})
