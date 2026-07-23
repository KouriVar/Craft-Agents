import { describe, expect, it } from 'bun:test'
import {
  buildGitBranchSwitchedEvent,
  buildGitCommittedEvent,
  buildGitFailedEvent,
  buildGitChangesPresentEvent,
  buildObservationsFromEvent,
  buildLoopDrafts,
} from '../index.ts'

describe('git event builders', () => {
  it('builds committed event with commit evidence', () => {
    const event = buildGitCommittedEvent({
      sessionId: 'sess-1',
      workspaceId: 'ws',
      repoRoot: '/Users/me/proj/CraftAgent',
      branch: 'my-changes',
      commitSha: 'abc123def456',
      message: 'feat: add git cognition',
    })
    expect(event.type).toBe('git.committed')
    expect(event.source).toBe('git')
    expect(event.payload.commitSha).toBe('abc123def456')
    expect(event.idempotencyKey).toBe('git.committed:abc123def456')
    expect(event.evidenceRefs?.some((r) => r.type === 'git_commit')).toBe(true)
    expect(event.evidenceRefs?.some((r) => r.type === 'git_branch')).toBe(true)
    expect(JSON.stringify(event)).not.toContain('diff')
  })

  it('builds branch switched with previous branch', () => {
    const event = buildGitBranchSwitchedEvent({
      sessionId: 'sess-1',
      repoRoot: '/tmp/repo',
      action: 'checkout',
      branch: 'feature',
      previousBranch: 'main',
    })
    expect(event.type).toBe('git.branch_switched')
    expect(event.payload.previousBranch).toBe('main')
    expect(event.idempotencyKey).toContain('main:feature')
  })

  it('builds failed event without raw stack dumps dominating', () => {
    const event = buildGitFailedEvent({
      action: 'push',
      branch: 'main',
      repoRoot: '/tmp/repo',
      errorCode: 'rejected:non-fast-forward:deadbeef',
    })
    expect(event.type).toBe('git.failed')
    expect(event.payload.errorCode.length).toBeLessThanOrEqual(120)
  })

  it('builds changes_present with dirty count only', () => {
    const event = buildGitChangesPresentEvent({
      sessionId: 'sess-1',
      turnId: 'turn-9',
      branch: 'main',
      dirtyFileCount: 3,
      ahead: 1,
      behind: 0,
      repoRoot: '/tmp/repo',
    })
    expect(event.type).toBe('git.changes_present')
    expect(event.payload.dirtyFileCount).toBe(3)
    expect(event.idempotencyKey).toBe('git.changes_present:sess-1:turn-9')
  })
})

describe('git → observation → loop', () => {
  it('committed becomes result observation (no loop)', () => {
    const event = {
      ...buildGitCommittedEvent({
        sessionId: 's1',
        branch: 'main',
        commitSha: 'abcdef123456',
        message: 'fix',
        repoRoot: '/tmp/r',
      }),
      id: 'e1',
      sequence: 1,
    }
    const observations = buildObservationsFromEvent(event)
    expect(observations.some((o) => o.category === 'result')).toBe(true)
    const drafts = buildLoopDrafts({ observations, events: [event] })
    expect(drafts.every((d) => !d.title.includes('abcdef'))).toBe(true)
  })

  it('changes_present becomes progress observation and open loop', () => {
    const event = {
      ...buildGitChangesPresentEvent({
        sessionId: 's1',
        turnId: 't1',
        branch: 'main',
        dirtyFileCount: 4,
        ahead: 0,
        behind: 0,
        repoRoot: '/tmp/CraftAgent',
      }),
      id: 'e2',
      sequence: 2,
    }
    const observations = buildObservationsFromEvent(event)
    expect(observations.some((o) => o.category === 'progress')).toBe(true)
    const drafts = buildLoopDrafts({ observations, events: [event] })
    expect(drafts.some((d) => d.status === 'open')).toBe(true)
  })

  it('failed becomes blocker observation and blocked loop', () => {
    const event = {
      ...buildGitFailedEvent({
        sessionId: 's1',
        action: 'push',
        branch: 'main',
        errorCode: 'auth_failed',
        repoRoot: '/tmp/r',
      }),
      id: 'e3',
      sequence: 3,
    }
    const observations = buildObservationsFromEvent(event)
    expect(observations.some((o) => o.category === 'blocker')).toBe(true)
    const drafts = buildLoopDrafts({ observations, events: [event] })
    expect(drafts.some((d) => d.status === 'blocked')).toBe(true)
  })
})
