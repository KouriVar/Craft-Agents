import { beforeEach, describe, expect, it } from 'bun:test'
import { ContextActionRegistry } from '../registry'
import type { ActionContext, ContextAction } from '../types'

function ctx(partial: Partial<ActionContext> & { workspaceId: string }): ActionContext {
  return {
    flags: {
      canContinue: false,
      canArchive: false,
      canCreateLibraryFromSession: false,
      allowCognitionDerived: false,
      ...partial.flags,
    },
    ...partial,
  }
}

function action(
  partial: Partial<ContextAction> & Pick<ContextAction, 'id' | 'isAvailable' | 'run'>,
): ContextAction {
  return {
    group: 'session',
    labelKey: `test.${partial.id}`,
    icon: 'Archive',
    surfaces: ['dropdown', 'command-menu'],
    ...partial,
  }
}

describe('ContextActionRegistry', () => {
  let registry: ContextActionRegistry

  beforeEach(() => {
    registry = new ContextActionRegistry()
  })

  it('registers, lists, and unregisters actions', () => {
    const run = async () => {}
    registry.register(action({
      id: 'session.archive',
      isAvailable: () => true,
      run,
    }))
    expect(registry.list().map((a) => a.id)).toEqual(['session.archive'])
    expect(registry.get('session.archive')?.labelKey).toBe('test.session.archive')

    registry.unregister('session.archive')
    expect(registry.list()).toEqual([])
    expect(registry.get('session.archive')).toBeUndefined()
  })

  it('rejects empty action ids', () => {
    expect(() => registry.register(action({
      id: '   ',
      isAvailable: () => true,
      run: async () => {},
    }))).toThrow(/non-empty/)
  })

  it('run executes with payload and respects availability', async () => {
    const calls: Array<{ payload?: Record<string, unknown> }> = []
    registry.register(action({
      id: 'library.export',
      isAvailable: (c) => Boolean(c.documentId),
      run: async (_c, payload) => {
        calls.push({ payload })
      },
    }))

    const withDoc = ctx({ workspaceId: 'ws', documentId: 'doc_1' })
    await registry.run('library.export', withDoc, { format: 'markdown' })
    expect(calls).toEqual([{ payload: { format: 'markdown' } }])

    await expect(registry.run('library.export', ctx({ workspaceId: 'ws' }))).rejects.toThrow(
      /not available/,
    )
    await expect(registry.run('missing.action', withDoc)).rejects.toThrow(/Unknown/)
  })

  it('listForSurface filters by surface and isAvailable', () => {
    registry.register(action({
      id: 'session.archive',
      surfaces: ['dropdown'],
      isAvailable: (c) => c.flags.canArchive,
      run: async () => {},
    }))
    registry.register(action({
      id: 'project.open',
      surfaces: ['dropdown', 'context-menu'],
      isAvailable: (c) => Boolean(c.projectId),
      run: async () => {},
    }))
    registry.register(action({
      id: 'session.continue',
      surfaces: ['command-menu'],
      isAvailable: () => true,
      run: async () => {},
    }))

    const available = ctx({
      workspaceId: 'ws',
      projectId: 'proj_a',
      flags: { canArchive: true, canContinue: false, canCreateLibraryFromSession: false, allowCognitionDerived: false },
    })
    expect(registry.listForSurface('dropdown', available).map((a) => a.id)).toEqual([
      'session.archive',
      'project.open',
    ])

    const noSession = ctx({
      workspaceId: 'ws',
      projectId: 'proj_a',
      flags: { canArchive: false, canContinue: false, canCreateLibraryFromSession: false, allowCognitionDerived: false },
    })
    expect(registry.listForSurface('dropdown', noSession).map((a) => a.id)).toEqual([
      'project.open',
    ])
  })

  it('clear removes all registrations', () => {
    registry.register(action({
      id: 'a',
      isAvailable: () => true,
      run: async () => {},
    }))
    registry.clear()
    expect(registry.list()).toEqual([])
  })
})
