import { describe, expect, it } from 'bun:test'
import {
  buildBrowserPageOpenedEvent,
  buildBrowserBookmarkCreatedEvent,
  buildBrowserTabAttachedEvent,
  shouldEmitBrowserPageOpened,
  isNoiseBrowserUrl,
  buildObservationsFromEvent,
  buildLoopDrafts,
  buildEvidenceFingerprint,
  findStaleLoopIds,
  type CognitionLoop,
} from '../index.ts'

describe('browser page filter', () => {
  it('rejects noise urls', () => {
    expect(isNoiseBrowserUrl('about:blank')).toBe(true)
    expect(isNoiseBrowserUrl('https://duckduckgo.com/?q=agents')).toBe(true)
    expect(isNoiseBrowserUrl('https://platform.openai.com/docs/agents')).toBe(false)
  })

  it('emits for session-bound pages', () => {
    expect(shouldEmitBrowserPageOpened({
      url: 'https://platform.openai.com/docs/agents',
      title: 'Agents SDK',
      boundSessionId: 'sess-1',
      ownerType: 'session',
    })).toBe(true)
  })
})

describe('browser event builders + observation', () => {
  it('builds page_opened with host/path evidence only', () => {
    const event = buildBrowserPageOpenedEvent({
      workspaceId: 'ws',
      sessionId: 'sess-1',
      tabId: 'tab-1',
      url: 'https://platform.openai.com/docs/agents?token=secret',
      title: 'OpenAI Agents SDK',
      ownerType: 'session',
      boundSessionId: 'sess-1',
    })
    expect(event).toBeTruthy()
    expect(event!.type).toBe('browser.page_opened')
    expect(event!.payload.hostname).toBe('platform.openai.com')
    expect(JSON.stringify(event)).not.toContain('token=secret')
    expect(event!.evidenceRefs?.[0]?.type).toBe('browser_tab')
  })

  it('maps page_opened and bookmark to context observations', () => {
    const opened = {
      ...buildBrowserPageOpenedEvent({
        sessionId: 's1',
        tabId: 't1',
        url: 'https://docs.example.com/mcp',
        title: 'MCP 文档',
        ownerType: 'session',
        boundSessionId: 's1',
      })!,
      id: 'e1',
      sequence: 1,
    }
    const bookmarked = {
      ...buildBrowserBookmarkCreatedEvent({
        sessionId: 's1',
        bookmarkId: 'b1',
        url: 'https://docs.example.com/agents',
        title: 'Agents SDK',
      })!,
      id: 'e2',
      sequence: 2,
    }
    const obs = [
      ...buildObservationsFromEvent(opened),
      ...buildObservationsFromEvent(bookmarked),
    ]
    expect(obs.every((o) => o.category === 'context')).toBe(true)
    expect(obs.every((o) => o.evidenceFingerprint)).toBe(true)

    // Single page must not create a loop; cluster of 2+ should.
    expect(buildLoopDrafts({ observations: obs.slice(0, 1), events: [opened] })).toHaveLength(0)
    const clustered = buildLoopDrafts({ observations: obs, events: [opened, bookmarked] })
    expect(clustered.some((d) => d.title.includes('调研'))).toBe(true)
  })

  it('tab_attached binds session context observation', () => {
    const event = {
      ...buildBrowserTabAttachedEvent({
        tabId: 't1',
        boundSessionId: 'sess-9',
        url: 'https://example.com/a',
        title: 'Example',
      }),
      id: 'e3',
      sequence: 3,
    }
    const obs = buildObservationsFromEvent(event)
    expect(obs[0]?.sessionId).toBe('sess-9')
    expect(obs[0]?.category).toBe('context')
  })
})

describe('evidence fingerprint + stale loops', () => {
  it('fingerprints are stable for same inputs', () => {
    const a = buildEvidenceFingerprint({ sessionId: 's', eventIds: ['e2', 'e1'], topic: 'MCP', category: 'context' })
    const b = buildEvidenceFingerprint({ sessionId: 's', eventIds: ['e1', 'e2'], topic: 'MCP', category: 'context' })
    expect(a).toBe(b)
  })

  it('marks open loops older than 7 days as stale candidates', () => {
    const now = Date.now()
    const loops: CognitionLoop[] = [
      {
        id: 'l1',
        title: 'old',
        summary: 'old',
        status: 'open',
        importance: 0.5,
        confidence: 0.5,
        observationIds: [],
        evidenceRefs: [],
        firstSeenAt: now - 10 * 24 * 60 * 60 * 1000,
        lastUpdatedAt: now - 10 * 24 * 60 * 60 * 1000,
        schemaVersion: 1,
      },
      {
        id: 'l2',
        title: 'fresh',
        summary: 'fresh',
        status: 'open',
        importance: 0.5,
        confidence: 0.5,
        observationIds: [],
        evidenceRefs: [],
        firstSeenAt: now,
        lastUpdatedAt: now,
        schemaVersion: 1,
      },
      {
        id: 'l3',
        title: 'managed',
        summary: 'managed',
        status: 'open',
        importance: 0.5,
        confidence: 0.5,
        observationIds: [],
        evidenceRefs: [],
        firstSeenAt: now - 10 * 24 * 60 * 60 * 1000,
        lastUpdatedAt: now - 10 * 24 * 60 * 60 * 1000,
        userManaged: true,
        schemaVersion: 1,
      },
    ]
    expect(findStaleLoopIds(loops, now)).toEqual(['l1'])
  })
})
