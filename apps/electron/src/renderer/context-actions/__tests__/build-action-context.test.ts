import { beforeEach, describe, expect, it } from 'bun:test'
import type { LoadedProject } from '@craft-agent/shared/projects/types'
import type { SessionMeta } from '@/atoms/sessions'
import {
  clearLastActiveProjectId,
  setLastActiveProjectId,
} from '@/lib/last-active-project'
import {
  buildActionContext,
  isAllowCognitionDerived,
} from '../build-action-context'
import type { PrivacyPolicySnapshot } from '../types'

const memory = new Map<string, string>()

function stubLocalStorage() {
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => { memory.set(key, value) },
      removeItem: (key: string) => { memory.delete(key) },
    },
    configurable: true,
    writable: true,
  })
}

function meta(partial: Partial<SessionMeta> & { id: string }): SessionMeta {
  return {
    workspaceId: 'ws-1',
    ...partial,
  }
}

function project(id: string): LoadedProject {
  return {
    config: {
      id,
      slug: id,
      name: id,
      createdAt: 1,
      updatedAt: 1,
    },
    folderPath: `/tmp/${id}`,
    assetsPath: `/tmp/${id}/assets`,
    workspaceRootPath: '/tmp/ws',
    workspaceId: 'ws-1',
  }
}

function privacy(partial: Partial<PrivacyPolicySnapshot> = {}): PrivacyPolicySnapshot {
  return {
    contextAwarenessEnabled: true,
    today: { useContext: true },
    privacyMode: { active: false },
    effectivePrivacyModeActive: false,
    ...partial,
  }
}

describe('buildActionContext', () => {
  beforeEach(() => {
    memory.clear()
    stubLocalStorage()
  })

  it('builds a baseline context without session or project', () => {
    const context = buildActionContext({ workspaceId: 'ws-1' })
    expect(context).toEqual({
      workspaceId: 'ws-1',
      sessionId: undefined,
      projectId: undefined,
      documentId: undefined,
      flags: {
        canContinue: false,
        canArchive: false,
        canCreateLibraryFromSession: false,
        allowCognitionDerived: false,
      },
    })
  })

  it('derives session flags from SessionMeta', () => {
    const session = meta({
      id: 's1',
      isArchived: false,
      taskGoal: 'Ship framework',
    })
    const context = buildActionContext({
      workspaceId: 'ws-1',
      sessionId: 's1',
      session,
    })
    expect(context.sessionId).toBe('s1')
    expect(context.flags.canArchive).toBe(true)
    expect(context.flags.canCreateLibraryFromSession).toBe(true)
    expect(context.flags.canContinue).toBe(true)
  })

  it('disables session flags when sessionId is missing or mismatched', () => {
    const session = meta({ id: 's1', taskGoal: 'Goal' })
    expect(buildActionContext({
      workspaceId: 'ws-1',
      session,
    }).flags).toMatchObject({
      canArchive: false,
      canCreateLibraryFromSession: false,
    })
    expect(buildActionContext({
      workspaceId: 'ws-1',
      sessionId: 'other',
      session,
    }).flags).toMatchObject({
      canArchive: false,
      canCreateLibraryFromSession: false,
    })
  })

  it('does not mark archived sessions as archivable', () => {
    const context = buildActionContext({
      workspaceId: 'ws-1',
      sessionId: 's1',
      session: meta({ id: 's1', isArchived: true }),
    })
    expect(context.flags.canArchive).toBe(false)
  })

  it('resolves projectId from session, then last-active project', () => {
    expect(buildActionContext({
      workspaceId: 'ws-1',
      sessionId: 's1',
      session: meta({ id: 's1', projectId: 'proj_session' }),
      projects: [project('proj_a')],
    }).projectId).toBe('proj_session')

    setLastActiveProjectId('ws-1', 'proj_a')
    expect(buildActionContext({
      workspaceId: 'ws-1',
      projects: [project('proj_a'), project('proj_b')],
    }).projectId).toBe('proj_a')

    clearLastActiveProjectId('ws-1')
    expect(buildActionContext({
      workspaceId: 'ws-1',
      projects: [project('proj_a')],
    }).projectId).toBeUndefined()
  })

  it('does not throw when projects list is empty or project is missing', () => {
    expect(() => buildActionContext({
      workspaceId: 'ws-1',
      projects: [],
    })).not.toThrow()
    expect(() => buildActionContext({
      workspaceId: 'ws-1',
      projectId: 'proj_missing',
      projects: [project('proj_a')],
    })).not.toThrow()
    expect(buildActionContext({
      workspaceId: 'ws-1',
      projectId: 'proj_missing',
    }).projectId).toBe('proj_missing')
  })

  it('sets canContinue from project resume session when current session has no resume data', () => {
    const sessions = [
      meta({
        id: 'resume',
        projectId: 'proj_a',
        taskGoal: 'Continue me',
        lastMessageAt: 200,
      }),
    ]
    const context = buildActionContext({
      workspaceId: 'ws-1',
      sessionId: 'empty',
      session: meta({ id: 'empty', projectId: 'proj_a' }),
      sessions,
      projectId: 'proj_a',
    })
    expect(context.flags.canContinue).toBe(true)
  })

  it('reads sessions from a Map (sessionMetaMapAtom shape)', () => {
    const map = new Map<string, SessionMeta>([
      ['resume', meta({
        id: 'resume',
        projectId: 'proj_a',
        taskGoal: 'Mapped resume',
        lastMessageAt: 1,
      })],
    ])
    const context = buildActionContext({
      workspaceId: 'ws-1',
      projectId: 'proj_a',
      sessions: map,
    })
    expect(context.flags.canContinue).toBe(true)
  })

  it('derives allowCognitionDerived from privacy policy', () => {
    expect(isAllowCognitionDerived(privacy())).toBe(true)
    expect(isAllowCognitionDerived(privacy({
      today: { useContext: false },
    }))).toBe(false)
    expect(isAllowCognitionDerived(privacy({
      privacyMode: { active: true },
    }))).toBe(false)
    expect(isAllowCognitionDerived(privacy({
      effectivePrivacyModeActive: true,
    }))).toBe(false)
    expect(isAllowCognitionDerived(null)).toBe(false)

    expect(buildActionContext({
      workspaceId: 'ws-1',
      privacy: privacy(),
    }).flags.allowCognitionDerived).toBe(true)
    expect(buildActionContext({
      workspaceId: 'ws-1',
      privacy: privacy({ contextAwarenessEnabled: false }),
    }).flags.allowCognitionDerived).toBe(false)
  })
})
