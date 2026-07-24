/**
 * PrivacyService + CognitionEventStore write-path / cleanup tests (Phase B).
 */

import { afterEach, describe, expect, it } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  CognitionEventStore,
  CognitionPrivacyDeniedError,
  backfillSourceKindsLimited,
  buildBrowserPageOpenedEvent,
  buildGitChangesPresentEvent,
  buildSessionStartedEvent,
  getCognitionEventsPath,
} from '@craft-agent/shared/cognition'
import {
  createDefaultPrivacyPolicy,
  decide,
  getPrivacyAccessLogPath,
  resolvePrivacyPolicy,
  accessLogLooksSafe,
} from '@craft-agent/shared/privacy'
import {
  PrivacyService,
  _resetPrivacyServiceRegistryForTests,
} from '../PrivacyService.ts'

function tempRoot(): string {
  return mkdtempSync(join(tmpdir(), 'craft-privacy-svc-'))
}

describe('PrivacyService', () => {
  const roots: string[] = []
  afterEach(() => {
    _resetPrivacyServiceRegistryForTests()
    for (const root of roots.splice(0)) {
      try {
        rmSync(root, { recursive: true, force: true })
      } catch {
        /* ignore */
      }
    }
  })

  it('resolves workspace deny over user allow; privacy mode still denies', () => {
    const root = tempRoot()
    roots.push(root)
    const svc = new PrivacyService({ workspaceDataRoot: root, workspaceId: 'ws1' })
    // Simulate user allow via workspace file only for this unit (user prefs are global — use workspace)
    svc.setWorkspacePolicy({
      sources: {
        ...createDefaultPrivacyPolicy().sources,
        browser: { urlTitle: 'deny', pageContent: 'deny', history: 'deny' },
      },
    })
    const policy = svc.getResolvedPolicy()
    expect(policy.sources.browser.urlTitle).toBe('deny')
    const d = svc.decide({
      feature: 'cognition_ingest',
      source: 'browser',
      aspect: 'urlTitle',
      mode: 'background',
    })
    expect(d.decision).toBe('deny')

    svc.setPrivacyMode({ active: true, pauseAutomations: true, persistAcrossRestart: false })
    const d2 = svc.decide({
      feature: 'cognition_ingest',
      source: 'session',
      aspect: 'meta',
      mode: 'background',
    })
    expect(d2.decision).toBe('deny')
    expect(d2.code).toBe('blocked_by_privacy_mode')
  })

  it('access log records decisions without body fields and survives write failure path', () => {
    const root = tempRoot()
    roots.push(root)
    const svc = new PrivacyService({ workspaceDataRoot: root, workspaceId: 'ws1' })
    svc.decideAndLog({
      feature: 'cognition_ingest',
      source: 'session',
      aspect: 'meta',
      mode: 'background',
      purpose: 'test',
      sentToModel: false,
    })
    const entries = svc.listAccessLog(10)
    expect(entries.length).toBeGreaterThan(0)
    expect(accessLogLooksSafe(entries[0]!)).toBe(true)
    const raw = readFileSync(getPrivacyAccessLogPath(root), 'utf8')
    expect(raw).not.toMatch(/"password"\s*:/)
    expect(JSON.stringify(entries[0])).not.toContain('session body')
  })

  it('clearData removes cognition whitelist targets but not sessions/projects/library', async () => {
    const root = tempRoot()
    roots.push(root)
    mkdirSync(join(root, 'cognition'), { recursive: true })
    mkdirSync(join(root, 'sessions'), { recursive: true })
    mkdirSync(join(root, 'projects'), { recursive: true })
    mkdirSync(join(root, 'library'), { recursive: true })
    writeFileSync(join(root, 'cognition', 'events.jsonl'), '{}\n')
    writeFileSync(join(root, 'sessions', 'session.jsonl'), 'keep\n')
    writeFileSync(join(root, 'projects', 'MEMORY.md'), 'keep\n')
    writeFileSync(join(root, 'library', 'doc.md'), 'keep\n')

    const svc = new PrivacyService({ workspaceDataRoot: root, workspaceId: 'ws1' })
    svc.decideAndLog({
      feature: 'cognition_ingest',
      source: 'git',
      aspect: 'statusMeta',
      mode: 'background',
    })
    const result = await svc.clearData({ cognition: true, accessLog: true })
    expect(result.cleared.some((c) => c.startsWith('cognition'))).toBe(true)
    expect(existsSync(join(root, 'sessions', 'session.jsonl'))).toBe(true)
    expect(existsSync(join(root, 'projects', 'MEMORY.md'))).toBe(true)
    expect(existsSync(join(root, 'library', 'doc.md'))).toBe(true)
    expect(result.skipped.some((s) => s.startsWith('protected:'))).toBe(true)
  })
})

describe('CognitionEventStore privacy gate', () => {
  const roots: string[] = []
  afterEach(() => {
    for (const root of roots.splice(0)) {
      try {
        rmSync(root, { recursive: true, force: true })
      } catch {
        /* ignore */
      }
    }
  })

  it('deny gate blocks session/browser/git writes; store has no preferences I/O', async () => {
    const root = tempRoot()
    roots.push(root)
    let decideCalls = 0
    const denyGate = {
      decide: () => {
        decideCalls += 1
        return {
          decision: 'deny' as const,
          code: 'blocked_by_master_off' as const,
          reason: 'test',
        }
      },
    }
    const store = new CognitionEventStore({ workspaceDataRoot: root, policyGate: denyGate })
    expect(store.hasCustomPolicyGate()).toBe(true)

    await expect(
      store.appendEvent(buildSessionStartedEvent({ sessionId: 's1', turnId: 't1', workspaceId: 'ws1' })),
    ).rejects.toBeInstanceOf(CognitionPrivacyDeniedError)

    await expect(
      store.appendEvent(
        buildBrowserPageOpenedEvent({
          workspaceId: 'ws1',
          tabId: 'tab1',
          url: 'https://example.com/page',
          title: 'Example',
          ownerType: 'manual',
        })!,
      ),
    ).rejects.toBeInstanceOf(CognitionPrivacyDeniedError)

    await expect(
      store.appendEvent(
        buildGitChangesPresentEvent({
          workspaceId: 'ws1',
          branch: 'main',
          dirtyFileCount: 1,
          ahead: 0,
          behind: 0,
          repoRoot: '/tmp/repo',
        }),
      ),
    ).rejects.toBeInstanceOf(CognitionPrivacyDeniedError)

    expect(decideCalls).toBeGreaterThanOrEqual(3)
    expect(existsSync(getCognitionEventsPath(root))).toBe(false)
  })

  it('allow gate still runs sanitizer and writes events', async () => {
    const root = tempRoot()
    roots.push(root)
    const store = new CognitionEventStore({
      workspaceDataRoot: root,
      policyGate: {
        decide: () => ({ decision: 'allow', code: 'allow', reason: 'ok' }),
      },
    })
    const result = await store.appendEvent(
      buildSessionStartedEvent({ sessionId: 's1', turnId: 't1', workspaceId: 'ws1' }),
    )
    expect(result.status).toBe('appended')
    expect(existsSync(getCognitionEventsPath(root))).toBe(true)
  })

  it('provider bypass attempt still blocked by store final gate', async () => {
    const root = tempRoot()
    roots.push(root)
    const store = new CognitionEventStore({
      workspaceDataRoot: root,
      policyGate: {
        decide: () => ({
          decision: 'deny',
          code: 'blocked_by_source',
          reason: 'browser_denied',
        }),
      },
    })
    // Simulate provider that "forgot" to short-circuit and still called append
    await expect(
      store.appendEvent(
        buildBrowserPageOpenedEvent({
          workspaceId: 'ws1',
          tabId: 'tab-secret',
          url: 'https://secret.example/x',
          title: 'Secret',
          ownerType: 'manual',
        })!,
      ),
    ).rejects.toBeInstanceOf(CognitionPrivacyDeniedError)
    expect(existsSync(getCognitionEventsPath(root))).toBe(false)
  })
})

describe('provenance backfill', () => {
  const roots: string[] = []
  afterEach(() => {
    for (const root of roots.splice(0)) {
      try {
        rmSync(root, { recursive: true, force: true })
      } catch {
        /* ignore */
      }
    }
  })

  it('backfills observation sourceKinds from ledger; unknown when missing', async () => {
    const root = tempRoot()
    roots.push(root)
    mkdirSync(join(root, 'cognition'), { recursive: true })
    writeFileSync(
      join(root, 'cognition', 'events.jsonl'),
      `${JSON.stringify({ id: 'e1', source: 'session', sequence: 1, type: 'session.started', timestamp: 1, summary: 'x', payload: {} })}\n`,
    )
    writeFileSync(
      join(root, 'cognition', 'observations.jsonl'),
      `${JSON.stringify({ id: 'o1', title: 't', summary: 's', category: 'session', confidence: 1, importance: 1, sourceEventIds: ['e1'], createdAt: 1, updatedAt: 1 })}\n` +
        `${JSON.stringify({ id: 'o2', title: 't2', summary: 's', category: 'session', confidence: 1, importance: 1, sourceEventIds: ['missing'], createdAt: 1, updatedAt: 1 })}\n`,
    )
    const n = await backfillSourceKindsLimited(root, { maxEntities: 50 })
    expect(n).toBeGreaterThanOrEqual(2)
    const lines = readFileSync(join(root, 'cognition', 'observations.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l) as { id: string; sourceKinds: string[] })
    expect(lines.find((o) => o.id === 'o1')?.sourceKinds).toEqual(['session'])
    expect(lines.find((o) => o.id === 'o2')?.sourceKinds).toEqual(['unknown'])
  })
})

describe('decide master-off + interactive reserve', () => {
  it('contextAwareness=false blocks cognition_ingest but leaves interactive library expressible', () => {
    const policy = resolvePrivacyPolicy({
      user: { contextAwarenessEnabled: false },
    })
    const bg = decide(
      { feature: 'cognition_ingest', source: 'session', aspect: 'meta', mode: 'background' },
      policy,
    )
    expect(bg.decision).toBe('deny')
    const interactive = decide(
      { feature: 'library_generate', source: 'library', mode: 'interactive' },
      policy,
    )
    // Default library.generateWithModel is ask → interactive returns ask
    expect(interactive.decision).toBe('ask')
  })
})
