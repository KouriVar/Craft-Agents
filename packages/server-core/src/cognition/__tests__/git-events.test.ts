import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  CognitionService,
  _resetCognitionServiceRegistryForTests,
  emitGitEventsAfterAction,
} from '../index.ts'
import { buildGitCommittedEvent } from '@craft-agent/shared/cognition'

describe('GitEventProvider integration', () => {
  const roots: string[] = []
  afterEach(async () => {
    _resetCognitionServiceRegistryForTests()
    for (const root of roots.splice(0)) {
      try { rmSync(root, { recursive: true, force: true }) } catch { /* ignore */ }
    }
  })

  it('appends git.committed through CognitionService process pipeline', async () => {
    const root = mkdtempSync(join(tmpdir(), 'craft-git-cog-'))
    roots.push(root)
    const svc = new CognitionService({ workspaceDataRoot: root, workspaceId: 'ws' })
    await svc.appendEvent(
      buildGitCommittedEvent({
        workspaceId: 'ws',
        sessionId: 'sess-git',
        branch: 'main',
        commitSha: 'fedcba9876543210',
        message: 'wire git events',
        repoRoot: '/tmp/demo-repo',
      }),
    )
    await svc.flush()
    await svc.processUnprocessedEvents()

    const events = await svc.listEvents({ types: ['git.committed'], sessionId: 'sess-git' })
    expect(events).toHaveLength(1)
    expect(events[0]!.evidenceRefs?.some((r) => r.type === 'git_commit')).toBe(true)

    const observations = await svc.listObservations({ sessionId: 'sess-git' })
    expect(observations.some((o) => o.category === 'result')).toBe(true)
  })

  it('emitGitEventsAfterAction is fail-soft without workspace', async () => {
    await expect(
      emitGitEventsAfterAction({
        dirPath: '/tmp/not-a-real-repo-for-cognition',
        action: { type: 'commit', message: 'x' },
        result: { ok: true, output: 'ok' },
      }),
    ).resolves.toBeUndefined()
  })
})
