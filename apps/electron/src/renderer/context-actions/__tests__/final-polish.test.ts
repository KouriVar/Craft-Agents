import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import type { LoadedProject } from '@craft-agent/shared/projects/types'
import type { SessionMeta } from '@/atoms/sessions'
import { buildActionContext } from '../build-action-context'
import {
  CONTEXT_ACTION_GROUP_ORDER,
  CONTEXT_ACTION_ID_ORDER,
  groupActionsForMenu,
} from '../menu-layout'
import {
  registerDefaultContextActions,
  resetDefaultContextActionsForTests,
} from '../register-defaults'
import { contextActionRegistry } from '../registry'
import type { ContextAction } from '../types'

function meta(partial: Partial<SessionMeta> & { id: string }): SessionMeta {
  return { workspaceId: 'ws-1', ...partial }
}

function project(id: string): LoadedProject {
  return {
    config: { id, slug: id, name: id, createdAt: 1, updatedAt: 1 },
    folderPath: `/tmp/${id}`,
    assetsPath: `/tmp/${id}/assets`,
    workspaceRootPath: '/tmp/ws',
    workspaceId: 'ws-1',
  }
}

function privacy(ok: boolean) {
  return {
    contextAwarenessEnabled: ok,
    today: { useContext: ok },
    privacyMode: { active: !ok },
    effectivePrivacyModeActive: !ok,
  }
}

describe('v0.16.4 final polish', () => {
  beforeEach(() => {
    resetDefaultContextActionsForTests()
    registerDefaultContextActions()
  })

  afterEach(() => {
    resetDefaultContextActionsForTests()
  })

  it('keeps Session → Library → Project group order and hides empty groups', () => {
    expect(CONTEXT_ACTION_GROUP_ORDER).toEqual(['session', 'library', 'project'])

    const context = buildActionContext({
      workspaceId: 'ws-1',
      projectId: 'proj_a',
      documentId: 'doc_1',
      sessionId: 's1',
      session: meta({ id: 's1', projectId: 'proj_a', taskGoal: 'Ship' }),
      projects: [project('proj_a')],
    })
    const available = contextActionRegistry.listForSurface('dropdown', context)
    const groups = groupActionsForMenu(available)

    expect(groups.map((g) => g.group)).toEqual(['session', 'library', 'project'])
    expect(groups.every((g) => g.items.length > 0)).toBe(true)

    // No session → Session group hidden; Project may remain.
    const noSession = buildActionContext({
      workspaceId: 'ws-1',
      projectId: 'proj_a',
      projects: [project('proj_a')],
    })
    const noSessionGroups = groupActionsForMenu(
      contextActionRegistry.listForSurface('dropdown', noSession),
    )
    expect(noSessionGroups.map((g) => g.group)).toEqual(['project'])
    expect(noSessionGroups.some((g) => g.group === 'session')).toBe(false)
    expect(noSessionGroups.some((g) => g.group === 'library')).toBe(false)
  })

  it('keeps stable action order within groups', () => {
    const context = buildActionContext({
      workspaceId: 'ws-1',
      projectId: 'proj_a',
      documentId: 'doc_1',
      sessionId: 's1',
      session: meta({ id: 's1', projectId: 'proj_a', taskGoal: 'Ship' }),
      projects: [project('proj_a')],
    })
    const ids = groupActionsForMenu(
      contextActionRegistry.listForSurface('dropdown', context),
    ).flatMap((g) => g.items.map((a) => a.id))

    expect(ids).toEqual([
      'session.continue',
      'session.archive',
      'library.createFromSession',
      'library.export',
      'project.open',
    ])
    expect(CONTEXT_ACTION_ID_ORDER).toEqual(ids)
  })

  it('does not duplicate actions when registerDefaultContextActions is called repeatedly', () => {
    registerDefaultContextActions()
    registerDefaultContextActions()
    // Even bypassing the flag, Map-keyed register must not create duplicates.
    contextActionRegistry.register(
      contextActionRegistry.get('session.archive') as ContextAction,
    )

    const ids = contextActionRegistry.list().map((a) => a.id)
    expect(ids.length).toBe(new Set(ids).size)
    expect(ids.sort()).toEqual([
      'library.createFromSession',
      'library.export',
      'project.open',
      'session.archive',
      'session.continue',
    ])
  })

  it('handles no-session / no-project / privacy-gated contexts without throwing', () => {
    expect(() => {
      const noSession = buildActionContext({
        workspaceId: 'ws-1',
        projectId: 'proj_a',
        projects: [project('proj_a')],
      })
      const ids = contextActionRegistry.listForSurface('dropdown', noSession).map((a) => a.id)
      expect(ids).toContain('project.open')
      expect(ids).not.toContain('library.createFromSession')
      expect(ids).not.toContain('session.continue')
      expect(ids).not.toContain('session.archive')
    }).not.toThrow()

    expect(() => {
      const noProject = buildActionContext({
        workspaceId: 'ws-1',
        sessionId: 's1',
        session: meta({ id: 's1' }),
        projects: [],
      })
      const ids = contextActionRegistry.listForSurface('dropdown', noProject).map((a) => a.id)
      expect(ids).not.toContain('project.open')
      expect(ids).toContain('library.createFromSession')
    }).not.toThrow()

    // Cognition-gated probe (not a shipped default action) still filters cleanly.
    contextActionRegistry.register({
      id: 'test.cognition',
      group: 'memory',
      labelKey: 'contextActions.memory.save',
      icon: 'Brain',
      surfaces: ['dropdown'],
      isAvailable: (c) => c.flags.allowCognitionDerived,
      run: async () => {},
    })
    const denied = buildActionContext({
      workspaceId: 'ws-1',
      projectId: 'proj_a',
      privacy: privacy(false),
    })
    expect(denied.flags.allowCognitionDerived).toBe(false)
    expect(
      contextActionRegistry.listForSurface('dropdown', denied).map((a) => a.id),
    ).not.toContain('test.cognition')
    // memory group stays out of product menu order even if registered.
    expect(
      groupActionsForMenu(contextActionRegistry.listForSurface('dropdown', denied))
        .map((g) => g.group),
    ).not.toContain('memory')
  })
})
