import { describe, expect, it } from 'bun:test'
import type { LoadedProject } from '@craft-agent/shared/projects/types'
import type { BrowserWorkspaceTab } from '@/atoms/browser-workspace'
import type { SessionMeta } from '@/atoms/sessions'
import { buildContextFusionSnapshot } from '@/context-fusion'
import type { ContextFusionSnapshot } from '@/context-fusion/types'
import {
  BROWSER_CONTINUE_CONFIDENCE_BOOST,
  PROJECT_CONTINUE_CONFIDENCE_BOOST,
  buildContextActionSuggestions,
  hasBrowserContinueBoost,
  hasProjectContinueBoost,
} from '../suggestions'

function meta(partial: Partial<SessionMeta> & { id: string }): SessionMeta {
  return { workspaceId: 'ws-1', ...partial }
}

function project(id: string, name: string): LoadedProject {
  return {
    config: {
      id,
      slug: id,
      name,
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

function emptySnapshot(): ContextFusionSnapshot {
  return {
    workspaceId: '',
    sessionId: '',
    session: null,
    project: null,
    browser: {
      relatedTabs: [],
      relatedTabCount: 0,
      hasVisibleRelated: false,
    },
    cognition: {
      allowCognitionDerived: false,
      guidance: [],
      loops: [],
    },
    privacy: {
      contextAwarenessEnabled: false,
      todayUseContext: false,
      privacyModeActive: true,
      allowCognitionDerived: false,
      policy: null,
    },
  }
}

describe('Suggestion Engine fusion phase 2', () => {
  it('maps blocked/waiting cognition loops to session.continue with unresolved reason', () => {
    const session = meta({ id: 's1', messageCount: 1 })
    const snapshot = buildContextFusionSnapshot(
      { workspaceId: 'ws-1', sessionId: 's1' },
      {
        sessions: [session],
        privacy: privacy(true),
        loops: [
          { sessionId: 's1', status: 'blocked', blocker: 'OAuth' },
          { sessionId: 's1', status: 'open', nextAction: 'ignore' },
        ],
      },
    )
    const suggestions = buildContextActionSuggestions(snapshot)
    expect(suggestions).toHaveLength(1)
    expect(suggestions[0]?.actionId).toBe('session.continue')
    expect(suggestions[0]?.reason).toBe('contextSuggestions.reason.unresolvedWork')
  })

  it('maps waiting loops to session.continue', () => {
    const session = meta({ id: 's1' })
    const snapshot = buildContextFusionSnapshot(
      { workspaceId: 'ws-1', sessionId: 's1' },
      {
        sessions: [session],
        privacy: privacy(true),
        loops: [{ sessionId: 's1', status: 'waiting', waitingFor: 'review' }],
      },
    )
    const suggestions = buildContextActionSuggestions(snapshot)
    expect(suggestions[0]?.actionId).toBe('session.continue')
    expect(suggestions[0]?.reason).toBe('contextSuggestions.reason.unresolvedWork')
  })

  it('boosts session.continue confidence when project + goal/checkpoint align', () => {
    const session = meta({
      id: 's1',
      projectId: 'proj_a',
      taskGoal: 'Ship fusion ranking',
    })
    const withoutProject = buildContextFusionSnapshot(
      { workspaceId: 'ws-1', sessionId: 's1' },
      { sessions: [session], privacy: privacy(false) },
    )
    // Force no project slice for baseline confidence.
    withoutProject.project = null
    withoutProject.session = { ...session, projectId: undefined }

    const withProject = buildContextFusionSnapshot(
      { workspaceId: 'ws-1', sessionId: 's1' },
      {
        sessions: [session],
        projects: [project('proj_a', 'Alpha')],
        privacy: privacy(false),
      },
    )

    expect(hasProjectContinueBoost(withProject)).toBe(true)
    expect(hasProjectContinueBoost(withoutProject)).toBe(false)

    const base = buildContextActionSuggestions(withoutProject)
    const boosted = buildContextActionSuggestions(withProject)
    expect(base[0]?.actionId).toBe('session.continue')
    expect(boosted[0]?.actionId).toBe('session.continue')
    expect(boosted[0]!.confidence!).toBeCloseTo(
      (base[0]!.confidence ?? 0) + PROJECT_CONTINUE_CONFIDENCE_BOOST,
      5,
    )
  })

  it('uses browser related tabs as a ranking signal only (no new action)', () => {
    const session = meta({
      id: 's1',
      projectId: 'proj_a',
      taskGoal: 'Research API design',
    })
    const tabs = [
      tab({
        id: 't1',
        ownerSessionId: 's1',
        url: 'https://docs.example.com/api',
        title: 'API docs',
        isVisible: true,
      }),
    ]
    const withTabs = buildContextFusionSnapshot(
      { workspaceId: 'ws-1', sessionId: 's1' },
      {
        sessions: [session],
        projects: [project('proj_a', 'Alpha')],
        browserTabs: tabs,
        privacy: privacy(false),
      },
    )
    const noTabs = buildContextFusionSnapshot(
      { workspaceId: 'ws-1', sessionId: 's1' },
      {
        sessions: [session],
        projects: [project('proj_a', 'Alpha')],
        browserTabs: [],
        privacy: privacy(false),
      },
    )

    expect(hasBrowserContinueBoost(withTabs)).toBe(true)
    expect(hasBrowserContinueBoost(noTabs)).toBe(false)

    const boosted = buildContextActionSuggestions(withTabs)
    const baseline = buildContextActionSuggestions(noTabs)
    expect(boosted.map((s) => s.actionId)).toEqual(baseline.map((s) => s.actionId))
    expect(boosted).toHaveLength(1)
    expect(boosted[0]?.actionId).toBe('session.continue')
    expect(boosted[0]!.confidence!).toBeCloseTo(
      (baseline[0]!.confidence ?? 0) + BROWSER_CONTINUE_CONFIDENCE_BOOST,
      5,
    )
  })

  it('empty snapshot yields no suggestions', () => {
    expect(buildContextActionSuggestions(emptySnapshot())).toEqual([])
  })
})
