import { describe, expect, it } from 'bun:test'
import type { SessionMeta } from '@/atoms/sessions'
import type { ContextFusionSnapshot, FusionGitSlice } from '@/context-fusion/types'
import {
  GIT_DIRTY_CONTINUE_CONFIDENCE_BOOST,
  GIT_DIVERGENCE_CONTINUE_CONFIDENCE_BOOST,
  GIT_REPO_CONTINUE_CONFIDENCE_BOOST,
  buildContextActionSuggestions,
  hasGitDirtyContinueBoost,
  hasGitDivergenceContinueBoost,
  hasGitRepoContinueBoost,
} from '../suggestions'

function meta(partial: Partial<SessionMeta> & { id: string }): SessionMeta {
  return { workspaceId: 'ws-1', ...partial }
}

function baseSnapshot(git: FusionGitSlice | null | undefined): ContextFusionSnapshot {
  return {
    workspaceId: 'ws-1',
    sessionId: 's1',
    session: meta({
      id: 's1',
      taskGoal: 'Continue coding',
      workingDirectory: '/repo',
    }),
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
    git,
  }
}

function repoGit(partial: Partial<FusionGitSlice> = {}): FusionGitSlice {
  return {
    isRepository: true,
    root: '/repo',
    branch: 'main',
    dirtyCount: 0,
    stagedCount: 0,
    ahead: 0,
    behind: 0,
    hasPullRequest: false,
    resolvedFrom: 'session',
    ...partial,
  }
}

describe('Suggestion Engine git ranking (v0.16.7)', () => {
  it('empty/missing git snapshot does not change continue confidence vs null git', () => {
    const withUndefinedGit = baseSnapshot(undefined)
    delete (withUndefinedGit as { git?: FusionGitSlice | null }).git
    const withNullGit = baseSnapshot(null)

    const a = buildContextActionSuggestions(withUndefinedGit)
    const b = buildContextActionSuggestions(withNullGit)
    expect(a.map((s) => s.actionId)).toEqual(['session.continue'])
    expect(b.map((s) => s.actionId)).toEqual(['session.continue'])
    expect(a[0]?.confidence).toBe(b[0]?.confidence)
    expect(a[0]?.confidence).toBe(0.85)
  })

  it('non-repository git slice does not boost', () => {
    const snapshot = baseSnapshot({
      isRepository: false,
      dirtyCount: 0,
      stagedCount: 0,
      ahead: 0,
      behind: 0,
      hasPullRequest: false,
      resolvedFrom: 'session',
    })
    expect(hasGitDirtyContinueBoost(snapshot)).toBe(false)
    expect(hasGitRepoContinueBoost(snapshot)).toBe(false)
    const suggestions = buildContextActionSuggestions(snapshot)
    expect(suggestions[0]?.confidence).toBe(0.85)
  })

  it('dirty files boost continue confidence', () => {
    const clean = baseSnapshot(repoGit({ dirtyCount: 0, branch: undefined }))
    const dirty = baseSnapshot(repoGit({ dirtyCount: 3, branch: undefined }))
    // Isolate dirty boost: no branch → no repo-existence boost
    expect(hasGitDirtyContinueBoost(dirty)).toBe(true)
    expect(hasGitRepoContinueBoost(dirty)).toBe(false)

    const baseConf = buildContextActionSuggestions(clean)[0]!.confidence!
    const dirtyConf = buildContextActionSuggestions(dirty)[0]!.confidence!
    expect(dirtyConf).toBeCloseTo(baseConf + GIT_DIRTY_CONTINUE_CONFIDENCE_BOOST, 5)
  })

  it('ahead/behind boosts continue confidence as divergence signal', () => {
    const synced = baseSnapshot(repoGit({ ahead: 0, behind: 0, branch: undefined }))
    const diverged = baseSnapshot(repoGit({ ahead: 2, behind: 1, branch: undefined }))
    expect(hasGitDivergenceContinueBoost(diverged)).toBe(true)

    const baseConf = buildContextActionSuggestions(synced)[0]!.confidence!
    const divConf = buildContextActionSuggestions(diverged)[0]!.confidence!
    expect(divConf).toBeCloseTo(baseConf + GIT_DIVERGENCE_CONTINUE_CONFIDENCE_BOOST, 5)
  })

  it('branch presence acts as repository-existence ranking signal', () => {
    const noBranch = baseSnapshot(repoGit({ branch: undefined }))
    const withBranch = baseSnapshot(repoGit({ branch: 'feat/x' }))
    expect(hasGitRepoContinueBoost(withBranch)).toBe(true)
    expect(hasGitRepoContinueBoost(noBranch)).toBe(false)

    const baseConf = buildContextActionSuggestions(noBranch)[0]!.confidence!
    const repoConf = buildContextActionSuggestions(withBranch)[0]!.confidence!
    expect(repoConf).toBeCloseTo(baseConf + GIT_REPO_CONTINUE_CONFIDENCE_BOOST, 5)
  })

  it('git boosts do not introduce new action ids', () => {
    const snapshot = baseSnapshot(repoGit({
      dirtyCount: 2,
      ahead: 1,
      behind: 0,
      branch: 'main',
    }))
    const ids = buildContextActionSuggestions(snapshot).map((s) => s.actionId)
    expect(ids).toEqual(['session.continue'])
  })
})
