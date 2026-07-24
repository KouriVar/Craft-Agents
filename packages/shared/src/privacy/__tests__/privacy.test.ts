import { describe, expect, it } from 'bun:test'
import {
  createDefaultPrivacyPolicy,
  decide,
  deepMergePrivacyPartial,
  isEntityReadableByPolicy,
  resolvePrivacyPolicy,
  resolveSourcePermission,
  createAccessLogEntry,
  pruneAccessLogEntries,
  accessLogLooksSafe,
  mergeProvenance,
  provenanceFromEvent,
  normalizeProvenanceFields,
} from '../index.ts'
import type { PrivacyPolicy, ResolvedPrivacyPolicy } from '../types.ts'
import type { PrivacyPolicyPatch } from '../policy-resolver.ts'

function resolved(overrides?: PrivacyPolicyPatch & { effectivePrivacyModeActive?: boolean }): ResolvedPrivacyPolicy {
  const base = resolvePrivacyPolicy({ user: overrides })
  if (overrides?.effectivePrivacyModeActive != null) {
    return {
      ...base,
      effectivePrivacyModeActive: overrides.effectivePrivacyModeActive,
      privacyMode: { ...base.privacyMode, active: overrides.effectivePrivacyModeActive },
      policyVersion: base.policyVersion,
    }
  }
  return base
}

describe('privacy defaults & merge', () => {
  it('provides upgrade-friendly defaults', () => {
    const d = createDefaultPrivacyPolicy()
    expect(d.contextAwarenessEnabled).toBe(true)
    expect(d.today.useContext).toBe(true)
    expect(d.sources.session.meta).toBe('allow')
    expect(d.sources.session.body).toBe('ask')
    expect(d.sources.browser.pageContent).toBe('deny')
    expect(d.sources.git.diffContent).toBe('deny')
    expect(d.sources.messaging.wechat).toBe('deny')
    expect(d.sources.automation).toBe('deny')
  })

  it('user overrides defaults; workspace overrides user', () => {
    const user = { sources: { browser: { urlTitle: 'allow' as const, pageContent: 'allow' as const, history: 'deny' as const } } }
    const workspace = { sources: { browser: { urlTitle: 'deny' as const } } }
    const r = resolvePrivacyPolicy({ user, workspace })
    expect(r.sources.browser.urlTitle).toBe('deny')
    expect(r.sources.browser.pageContent).toBe('allow') // inherited from user
    expect(r.resolvedFrom).toContain('user')
    expect(r.resolvedFrom).toContain('workspace')
  })

  it('privacy mode runtime overlays persistent settings', () => {
    const r = resolvePrivacyPolicy({
      user: { contextAwarenessEnabled: true, sources: { git: { statusMeta: 'allow', diffContent: 'deny', mutate: 'ask' } } },
      runtimePrivacyMode: { active: true, pauseAutomations: true, persistAcrossRestart: true },
    })
    expect(r.effectivePrivacyModeActive).toBe(true)
    expect(r.resolvedFrom).toContain('privacy_mode')
    expect(r.sources.git.statusMeta).toBe('allow') // persisted not wiped
  })

  it('deepMerge replaces arrays', () => {
    const merged = deepMergePrivacyPartial(
      { roots: ['/a'], nested: { x: 1 } } as Record<string, unknown>,
      { roots: ['/b'], nested: { y: 2 } },
    )
    expect(merged.roots).toEqual(['/b'])
    expect(merged.nested).toEqual({ x: 1, y: 2 })
  })
})

describe('privacy decide', () => {
  it('ask + background = deny', () => {
    const policy = resolved({
      sources: {
        ...createDefaultPrivacyPolicy().sources,
        session: { meta: 'ask', body: 'deny', attachments: 'deny', archived: 'ask' },
      },
    })
    const d = decide(
      { feature: 'cognition_ingest', source: 'session', aspect: 'meta', mode: 'background' },
      policy,
    )
    expect(d.decision).toBe('deny')
    expect(d.code).toBe('blocked_ask_as_deny')
  })

  it('ask + interactive = ask', () => {
    const policy = resolved({
      sources: {
        ...createDefaultPrivacyPolicy().sources,
        library: { generateWithModel: 'ask', autoDetectSync: false },
      },
    })
    const d = decide(
      { feature: 'library_generate', source: 'library', mode: 'interactive' },
      policy,
    )
    expect(d.decision).toBe('ask')
  })

  it('unknown fail-closed', () => {
    const d = decide(
      { feature: 'cognition_read', source: 'unknown', mode: 'background' },
      resolved(),
    )
    expect(d.decision).toBe('deny')
    expect(d.code).toBe('blocked_by_unknown_source')
  })

  it('privacy mode blocks cognition even when sources allow', () => {
    const d = decide(
      { feature: 'cognition_ingest', source: 'session', aspect: 'meta', mode: 'background' },
      resolved({ effectivePrivacyModeActive: true }),
    )
    expect(d.decision).toBe('deny')
    expect(d.code).toBe('blocked_by_privacy_mode')
  })

  it('master off blocks background cognition; manual_chat still allow', () => {
    const policy = resolved({ contextAwarenessEnabled: false })
    expect(
      decide({ feature: 'cognition_ingest', source: 'git', aspect: 'statusMeta', mode: 'background' }, policy).decision,
    ).toBe('deny')
    expect(decide({ feature: 'manual_chat', mode: 'interactive' }, policy).decision).toBe('allow')
  })

  it('task maps to session.meta; system allows when awareness on', () => {
    const policy = resolved()
    expect(resolveSourcePermission(policy, 'task', 'meta')).toBe('allow')
    expect(
      decide({ feature: 'cognition_ingest', source: 'system', mode: 'background' }, policy).decision,
    ).toBe('allow')
  })

  it('workspace deny wins over user allow', () => {
    const policy = resolvePrivacyPolicy({
      user: { sources: { browser: { urlTitle: 'allow', pageContent: 'deny', history: 'deny' } } },
      workspace: { sources: { browser: { urlTitle: 'deny' } } },
    })
    const d = decide(
      { feature: 'cognition_ingest', source: 'browser', aspect: 'urlTitle', mode: 'background' },
      policy,
    )
    expect(d.decision).toBe('deny')
  })
})

describe('isEntityReadableByPolicy', () => {
  it('hides unknown and denied browser kinds', () => {
    const policy = resolved()
    expect(isEntityReadableByPolicy({ sourceKinds: ['unknown'] }, policy, { forToday: true })).toBe(false)
    expect(isEntityReadableByPolicy({ sourceKinds: ['browser'] }, policy, { forToday: true })).toBe(true)

    const deniedBrowser = resolvePrivacyPolicy({
      user: { sources: { browser: { urlTitle: 'deny', pageContent: 'deny', history: 'deny' } } },
    })
    expect(isEntityReadableByPolicy({ sourceKinds: ['browser'] }, deniedBrowser, { forToday: true })).toBe(false)
  })

  it('mixed sources: any denied → hide whole entity', () => {
    const policy = resolvePrivacyPolicy({
      user: { sources: { browser: { urlTitle: 'deny', pageContent: 'deny', history: 'deny' } } },
    })
    expect(
      isEntityReadableByPolicy({ sourceKinds: ['session', 'browser'] }, policy, { forToday: true }),
    ).toBe(false)
  })

  it('today.useContext off hides cognition-derived reads', () => {
    const policy = resolved({ today: { useContext: false } })
    expect(isEntityReadableByPolicy({ sourceKinds: ['session'] }, policy, { forToday: true })).toBe(false)
  })
})

describe('provenance', () => {
  it('merges event ids and kinds', () => {
    const a = provenanceFromEvent({ id: 'e1', source: 'session' })
    const b = provenanceFromEvent({ id: 'e2', source: 'git' })
    const m = mergeProvenance([a, b, a])
    expect(m.sourceEventIds).toEqual(['e1', 'e2'])
    expect(m.sourceKinds).toEqual(['session', 'git'])
  })

  it('normalize missing → unknown', () => {
    expect(normalizeProvenanceFields(null).sourceKinds).toEqual(['unknown'])
  })
})

describe('access log', () => {
  it('records metadata without huge payloads', () => {
    const policy = resolved()
    const entry = createAccessLogEntry({
      workspaceId: 'ws1',
      policy,
      policyInput: {
        feature: 'cognition_ingest',
        source: 'browser',
        aspect: 'urlTitle',
        mode: 'background',
        purpose: 'browser_page_opened',
      },
      decision: decide(
        { feature: 'cognition_ingest', source: 'browser', aspect: 'urlTitle', mode: 'background' },
        policy,
      ),
    })
    expect(entry.workspaceId).toBe('ws1')
    expect(accessLogLooksSafe(entry)).toBe(true)
  })

  it('prunes by max entries', () => {
    const now = Date.now()
    const entries = Array.from({ length: 5 }, (_, i) =>
      createAccessLogEntry({
        workspaceId: 'ws',
        policy: resolved(),
        policyInput: { feature: 'cognition_ingest', mode: 'background' },
        decision: { decision: 'deny', code: 'deny', reason: 'x' },
        at: now - (5 - i) * 1000,
      }),
    )
    const pruned = pruneAccessLogEntries(entries, { maxEntries: 2, now })
    expect(pruned).toHaveLength(2)
  })
})
