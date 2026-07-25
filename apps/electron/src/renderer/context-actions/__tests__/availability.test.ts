import { beforeEach, describe, expect, it } from 'bun:test'
import type { SessionMeta } from '@/atoms/sessions'
import { buildActionContext } from '../build-action-context'
import { ContextActionRegistry } from '../registry'
import type { ContextAction, PrivacyPolicySnapshot } from '../types'

function meta(partial: Partial<SessionMeta> & { id: string }): SessionMeta {
  return {
    workspaceId: 'ws-1',
    ...partial,
  }
}

function privacy(ok: boolean): PrivacyPolicySnapshot {
  return {
    contextAwarenessEnabled: ok,
    today: { useContext: ok },
    privacyMode: { active: !ok },
    effectivePrivacyModeActive: !ok,
  }
}

function registerDefaults(registry: ContextActionRegistry): void {
  const stub = async () => {}
  const defs: ContextAction[] = [
    {
      id: 'session.archive',
      group: 'session',
      labelKey: 'contextActions.session.archive',
      icon: 'Archive',
      surfaces: ['dropdown', 'command-menu'],
      isAvailable: (c) => Boolean(c.sessionId) && c.flags.canArchive,
      run: stub,
    },
    {
      id: 'session.continue',
      group: 'session',
      labelKey: 'contextActions.session.continue',
      icon: 'Play',
      surfaces: ['dropdown', 'command-menu'],
      isAvailable: (c) => c.flags.canContinue,
      run: stub,
    },
    {
      id: 'library.createFromSession',
      group: 'library',
      labelKey: 'contextActions.library.createFromSession',
      icon: 'FileText',
      surfaces: ['dropdown', 'command-menu'],
      isAvailable: (c) => c.flags.canCreateLibraryFromSession,
      run: stub,
    },
    {
      id: 'project.open',
      group: 'project',
      labelKey: 'contextActions.project.open',
      icon: 'FolderKanban',
      surfaces: ['dropdown', 'command-menu'],
      isAvailable: (c) => Boolean(c.projectId),
      run: stub,
    },
    {
      id: 'memory.save',
      group: 'memory',
      labelKey: 'contextActions.memory.save',
      icon: 'Brain',
      surfaces: ['dropdown', 'command-menu'],
      // Memory save needs a project; cognition-gated suggestion path also checks privacy.
      isAvailable: (c) => Boolean(c.projectId) && c.flags.allowCognitionDerived,
      run: stub,
    },
  ]
  for (const def of defs) registry.register(def)
}

describe('ContextAction availability', () => {
  let registry: ContextActionRegistry

  beforeEach(() => {
    registry = new ContextActionRegistry()
    registerDefaults(registry)
  })

  it('hides session actions when there is no session', () => {
    const context = buildActionContext({ workspaceId: 'ws-1' })
    const ids = registry.listForSurface('dropdown', context).map((a) => a.id)
    expect(ids).not.toContain('session.archive')
    expect(ids).not.toContain('library.createFromSession')
    expect(ids).not.toContain('session.continue')
  })

  it('shows session actions when session meta is present', () => {
    const context = buildActionContext({
      workspaceId: 'ws-1',
      sessionId: 's1',
      session: meta({ id: 's1', taskGoal: 'Continue', projectId: 'proj_a' }),
      privacy: privacy(true),
    })
    const ids = registry.listForSurface('dropdown', context).map((a) => a.id)
    expect(ids).toContain('session.archive')
    expect(ids).toContain('library.createFromSession')
    expect(ids).toContain('session.continue')
    expect(ids).toContain('project.open')
  })

  it('does not throw and hides project/memory actions without a project', () => {
    const context = buildActionContext({
      workspaceId: 'ws-1',
      sessionId: 's1',
      session: meta({ id: 's1' }),
      projects: [],
      privacy: privacy(true),
    })
    expect(context.projectId).toBeUndefined()
    expect(() => registry.listForSurface('dropdown', context)).not.toThrow()
    const ids = registry.listForSurface('dropdown', context).map((a) => a.id)
    expect(ids).not.toContain('project.open')
    expect(ids).not.toContain('memory.save')
  })

  it('filters cognition-gated actions when privacy denies cognition', () => {
    const allowed = buildActionContext({
      workspaceId: 'ws-1',
      projectId: 'proj_a',
      privacy: privacy(true),
    })
    expect(registry.listForSurface('dropdown', allowed).map((a) => a.id)).toContain('memory.save')

    const denied = buildActionContext({
      workspaceId: 'ws-1',
      projectId: 'proj_a',
      privacy: privacy(false),
    })
    expect(denied.flags.allowCognitionDerived).toBe(false)
    expect(registry.listForSurface('dropdown', denied).map((a) => a.id)).not.toContain('memory.save')
    // Non-cognition project action still available
    expect(registry.listForSurface('dropdown', denied).map((a) => a.id)).toContain('project.open')
  })
})
