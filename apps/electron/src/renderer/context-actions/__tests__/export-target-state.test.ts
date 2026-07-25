import { describe, expect, it } from 'bun:test'
import { buildActionContext } from '../build-action-context'
import {
  beginExportTargetResolve,
  completeExportTargetResolve,
  documentIdForActionContext,
  exportTargetRequestKey,
  initialExportTargetState,
} from '../export-target-state'
import {
  registerDefaultContextActions,
  resetDefaultContextActionsForTests,
} from '../register-defaults'
import { contextActionRegistry } from '../registry'

describe('export target resolve state', () => {
  it('withholds documentId while resolving so export does not flash', () => {
    const resolving = beginExportTargetResolve('ws\0s1\0proj')
    expect(resolving.status).toBe('resolving')
    expect(documentIdForActionContext(resolving)).toBeUndefined()

    const context = buildActionContext({
      workspaceId: 'ws',
      documentId: documentIdForActionContext(resolving),
    })
    resetDefaultContextActionsForTests()
    registerDefaultContextActions()
    expect(
      contextActionRegistry.listForSurface('dropdown', context).map((a) => a.id),
    ).not.toContain('library.export')
  })

  it('exposes documentId only after resolve completes', () => {
    const key = exportTargetRequestKey({ workspaceId: 'ws', sessionId: 's1', projectId: 'p1' })
    let state = beginExportTargetResolve(key)
    state = completeExportTargetResolve(state, key, 'doc_1')
    expect(state.status).toBe('resolved')
    expect(documentIdForActionContext(state)).toBe('doc_1')

    const context = buildActionContext({
      workspaceId: 'ws',
      documentId: documentIdForActionContext(state),
    })
    resetDefaultContextActionsForTests()
    registerDefaultContextActions()
    expect(
      contextActionRegistry.listForSurface('dropdown', context).map((a) => a.id),
    ).toContain('library.export')
  })

  it('ignores stale async results from a previous context', () => {
    const keyA = exportTargetRequestKey({ workspaceId: 'ws', sessionId: 'a' })
    const keyB = exportTargetRequestKey({ workspaceId: 'ws', sessionId: 'b' })
    let state = beginExportTargetResolve(keyA)
    state = beginExportTargetResolve(keyB)
    // Late response for A must not win.
    state = completeExportTargetResolve(state, keyA, 'doc_stale')
    expect(state.status).toBe('resolving')
    expect(documentIdForActionContext(state)).toBeUndefined()

    state = completeExportTargetResolve(state, keyB, 'doc_fresh')
    expect(documentIdForActionContext(state)).toBe('doc_fresh')
  })

  it('hides export when resolve finishes with no target', () => {
    const key = exportTargetRequestKey({ workspaceId: 'ws' })
    let state = beginExportTargetResolve(key)
    state = completeExportTargetResolve(state, key, undefined)
    expect(state).toEqual({
      status: 'resolved',
      documentId: undefined,
      requestKey: key,
    })
    expect(documentIdForActionContext(state)).toBeUndefined()
    expect(documentIdForActionContext(initialExportTargetState())).toBeUndefined()
  })
})
