import { describe, expect, it } from 'bun:test'
import type { LoadedProject } from '@craft-agent/shared/projects/types'
import type { BrowserWorkspaceTab } from '@/atoms/browser-workspace'
import type { SessionMeta } from '@/atoms/sessions'
import { buildContextFusionSnapshot } from '../context-provider'
import { adaptCognition } from '../adapters/cognition'
import { adaptBrowser } from '../adapters/browser'
import { adaptProject } from '../adapters/project'
import { adaptSession } from '../adapters/session'

function meta(partial: Partial<SessionMeta> & { id: string }): SessionMeta {
  return { workspaceId: 'ws-1', ...partial }
}

function project(id: string, name = id): LoadedProject {
  return {
    config: {
      id,
      slug: id,
      name,
      workingDirectory: `/tmp/${id}`,
      createdAt: 1,
      updatedAt: 1,
    },
    folderPath: `/tmp/${id}`,
    assetsPath: `/tmp/${id}/assets`,
    workspaceRootPath: '/tmp/ws',
    workspaceId: 'ws-1',
  }
}

function tab(partial: Partial<BrowserWorkspaceTab> & { id: string }): BrowserWorkspaceTab {
  return {
    url: 'https://example.com/docs',
    title: 'Docs',
    favicon: null,
    isLoading: false,
    canGoBack: false,
    canGoForward: false,
    boundSessionId: null,
    ownerType: 'session',
    ownerSessionId: null,
    isVisible: true,
    agentControlActive: false,
    themeColor: null,
    workspaceId: 'ws-1',
    ...partial,
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

describe('Context Fusion Layer (v0.16.6)', () => {
  it('session snapshot resolves SessionMeta from the session map', () => {
    const session = meta({
      id: 's1',
      projectId: 'proj_a',
      taskGoal: 'Ship fusion',
      messageCount: 4,
    })
    const adapted = adaptSession(new Map([['s1', session]]), 's1')
    expect(adapted?.id).toBe('s1')
    expect(adapted?.taskGoal).toBe('Ship fusion')

    const snapshot = buildContextFusionSnapshot(
      { workspaceId: 'ws-1', sessionId: 's1' },
      { sessions: [session], projects: [project('proj_a', 'Alpha')], privacy: privacy(false) },
    )
    expect(snapshot.session?.id).toBe('s1')
    expect(snapshot.sessionId).toBe('s1')
  })

  it('project resolve prefers session.projectId over last-active', () => {
    const session = meta({ id: 's1', projectId: 'proj_b' })
    const projects = [project('proj_a', 'A'), project('proj_b', 'Beta')]
    const slice = adaptProject('ws-1', session, projects)
    expect(slice).toEqual({
      id: 'proj_b',
      name: 'Beta',
      slug: 'proj_b',
      workingDirectory: '/tmp/proj_b',
    })

    const snapshot = buildContextFusionSnapshot(
      { workspaceId: 'ws-1', sessionId: 's1' },
      { sessions: [session], projects, privacy: privacy(false) },
    )
    expect(snapshot.project?.id).toBe('proj_b')
    expect(snapshot.project?.name).toBe('Beta')
  })

  it('browser attribution uses findProjectBrowserTabs (ownerSessionId → project)', () => {
    const session = meta({ id: 's1', projectId: 'proj_a' })
    const sessions = new Map([['s1', session]])
    const projectSlice = adaptProject('ws-1', session, [project('proj_a')])
    const tabs = [
      tab({
        id: 't1',
        ownerSessionId: 's1',
        title: 'Spec',
        url: 'https://example.com/spec',
        isVisible: true,
      }),
      tab({
        id: 't2',
        ownerSessionId: 'other',
        title: 'Other',
        url: 'https://other.test',
      }),
      tab({ id: 't3', url: 'about:blank', ownerSessionId: 's1' }),
    ]

    const browser = adaptBrowser({ tabs, sessions, project: projectSlice })
    expect(browser.relatedTabCount).toBe(1)
    expect(browser.hasVisibleRelated).toBe(true)
    expect(browser.relatedTabs[0]?.id).toBe('t1')
    expect(browser.relatedTabs[0]?.hostname).toBe('example.com')

    const snapshot = buildContextFusionSnapshot(
      { workspaceId: 'ws-1', sessionId: 's1' },
      {
        sessions,
        projects: [project('proj_a')],
        browserTabs: tabs,
        privacy: privacy(false),
      },
    )
    expect(snapshot.browser.relatedTabCount).toBe(1)
  })

  it('privacy gate: cognition disabled clears guidance and loops', () => {
    const gated = adaptCognition({
      privacy: privacy(false),
      guidance: [{ type: 'continue', targetSessionId: 's1', confidence: 0.9 }],
      loops: [{ sessionId: 's1', status: 'blocked', blocker: 'OAuth' }],
      sessionId: 's1',
    })
    expect(gated.allowCognitionDerived).toBe(false)
    expect(gated.guidance).toEqual([])
    expect(gated.loops).toEqual([])

    const snapshot = buildContextFusionSnapshot(
      { workspaceId: 'ws-1', sessionId: 's1' },
      {
        sessions: [meta({ id: 's1', projectId: 'proj_a' })],
        projects: [project('proj_a')],
        privacy: privacy(false),
        guidance: [{ type: 'resume', targetSessionId: 's1' }],
        loops: [{ sessionId: 's1', status: 'waiting', waitingFor: 'review' }],
      },
    )
    expect(snapshot.privacy.allowCognitionDerived).toBe(false)
    expect(snapshot.cognition.allowCognitionDerived).toBe(false)
    expect(snapshot.cognition.guidance).toEqual([])
    expect(snapshot.cognition.loops).toEqual([])
  })

  it('cognition enabled keeps session-scoped guidance and loops', () => {
    const snapshot = buildContextFusionSnapshot(
      { workspaceId: 'ws-1', sessionId: 's1' },
      {
        sessions: [meta({ id: 's1' })],
        privacy: privacy(true),
        guidance: [
          { type: 'continue', targetSessionId: 's1', title: 'Keep going' },
          { type: 'continue', targetSessionId: 'other', title: 'Skip me' },
        ],
        loops: [
          { sessionId: 's1', status: 'open', nextAction: 'Fix tests' },
          { sessionId: 'other', status: 'blocked' },
        ],
      },
    )
    expect(snapshot.privacy.allowCognitionDerived).toBe(true)
    expect(snapshot.cognition.guidance).toHaveLength(1)
    expect(snapshot.cognition.guidance[0]?.title).toBe('Keep going')
    expect(snapshot.cognition.loops).toHaveLength(1)
    expect(snapshot.cognition.loops[0]?.nextAction).toBe('Fix tests')
  })
})
