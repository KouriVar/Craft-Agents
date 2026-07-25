import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import { getDefaultStore } from 'jotai'
import { sessionMetaMapAtom, type SessionMeta } from '@/atoms/sessions'
import {
  registerDefaultContextActions,
  resetDefaultContextActionsForTests,
} from '../register-defaults'
import { contextActionRegistry } from '../registry'
import { bindContextActionHost } from '../runtime-host'
import { buildActionContext } from '../build-action-context'

function meta(partial: Partial<SessionMeta> & { id: string }): SessionMeta {
  return {
    workspaceId: 'ws-1',
    ...partial,
  }
}

describe('default ContextAction handlers', () => {
  const sendMessage = mock((_id: string, _message: string) => {})
  const startLibrary = mock(async (_id: string) => {})
  const sessionCommand = mock(async (_id: string, _cmd: unknown) => {})

  beforeEach(() => {
    resetDefaultContextActionsForTests()
    registerDefaultContextActions()
    sendMessage.mockReset()
    startLibrary.mockReset()
    sessionCommand.mockReset()
    bindContextActionHost({
      sendMessage,
      startLibraryFromSession: startLibrary,
    })

    ;(globalThis as { window?: unknown }).window = {
      electronAPI: { sessionCommand },
      dispatchEvent: () => true,
    }

    const store = getDefaultStore()
    const map = new Map<string, SessionMeta>([
      ['s1', meta({
        id: 's1',
        projectId: 'proj_a',
        taskGoal: 'Ship handlers',
        lastMessageAt: 10,
      })],
    ])
    store.set(sessionMetaMapAtom, map)
  })

  afterEach(() => {
    bindContextActionHost(null)
    resetDefaultContextActionsForTests()
  })

  it('registers the default Context Actions (without memory.save)', () => {
    expect(contextActionRegistry.list().map((a) => a.id).sort()).toEqual([
      'library.createFromSession',
      'library.export',
      'project.open',
      'session.archive',
      'session.continue',
    ])
  })

  it('session.archive calls sessionCommand', async () => {
    const context = buildActionContext({
      workspaceId: 'ws-1',
      sessionId: 's1',
      session: meta({ id: 's1' }),
    })
    await contextActionRegistry.run('session.archive', context)
    expect(sessionCommand).toHaveBeenCalledWith('s1', { type: 'archive' })
  })

  it('library.createFromSession delegates to host', async () => {
    const context = buildActionContext({
      workspaceId: 'ws-1',
      sessionId: 's1',
      session: meta({ id: 's1' }),
    })
    await contextActionRegistry.run('library.createFromSession', context)
    expect(startLibrary).toHaveBeenCalledWith('s1')
  })

  it('session.continue sends resume prompt via host', async () => {
    const context = buildActionContext({
      workspaceId: 'ws-1',
      sessionId: 's1',
      session: meta({ id: 's1', taskGoal: 'Ship handlers', projectId: 'proj_a' }),
      sessions: getDefaultStore().get(sessionMetaMapAtom),
      projectId: 'proj_a',
    })
    expect(context.flags.canContinue).toBe(true)
    await contextActionRegistry.run('session.continue', context)
    expect(sendMessage).toHaveBeenCalledTimes(1)
    expect(sendMessage.mock.calls[0]?.[0]).toBe('s1')
    expect(String(sendMessage.mock.calls[0]?.[1]).length).toBeGreaterThan(0)
  })

  it('hides session actions when no session is in context', () => {
    const context = buildActionContext({ workspaceId: 'ws-1' })
    const ids = contextActionRegistry.listForSurface('dropdown', context).map((a) => a.id)
    expect(ids).not.toContain('session.archive')
    expect(ids).not.toContain('library.createFromSession')
  })
})
