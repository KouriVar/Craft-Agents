import { describe, expect, it } from 'bun:test'
import type { SessionMeta } from '@/atoms/sessions'
import type { CognitionGuidanceDto, CognitionLoopDto } from '@craft-agent/shared/protocol'
import { buildPendingQueue } from '../../components/explore/pending-queue'
import { buildRecentRailSessions, buildRecentRailTabs } from '../../components/explore/recent-rail'
import { migrateExploreSettingsPhaseC } from '../explore-settings'

function session(partial: Partial<SessionMeta> & { id: string }): SessionMeta {
  return {
    name: partial.name ?? partial.id,
    preview: partial.preview ?? '',
    createdAt: partial.createdAt ?? 1,
    lastMessageAt: partial.lastMessageAt ?? 1,
    ...partial,
  } as SessionMeta
}

describe('buildPendingQueue', () => {
  const now = Date.parse('2026-07-24T12:00:00.000Z')

  it('does not enqueue recent-only sessions', () => {
    const items = buildPendingQueue({
      sessions: [
        session({
          id: 's-recent',
          lastMessageAt: now - 60_000,
          name: 'Just chatting',
        }),
      ],
      now,
      allowCognitionDerived: true,
    })
    expect(items).toEqual([])
  })

  it('ranks overdue above checkpoint nextSteps', () => {
    const items = buildPendingQueue({
      sessions: [
        session({
          id: 's-next',
          name: 'Has next steps',
          taskCheckpoints: [{
            id: 'c1',
            createdAt: now,
            source: 'manual',
            outcome: 'completed',
            summary: 'ok',
            nextSteps: ['Do the thing'],
          }],
        }),
        session({
          id: 's-overdue',
          name: 'Overdue task',
          taskDueAt: now - 3_600_000,
        }),
      ],
      now,
    })
    expect(items[0]?.sessionId).toBe('s-overdue')
    expect(items[1]?.sessionId).toBe('s-next')
  })

  it('dedupes same session from multiple sources and merges reasons', () => {
    const items = buildPendingQueue({
      sessions: [
        session({
          id: 's1',
          name: 'Merged',
          taskDueAt: now - 1000,
          taskCheckpoints: [{
            id: 'c1',
            createdAt: now,
            source: 'manual',
            outcome: 'completed',
            summary: 'ok',
            nextSteps: ['Continue'],
          }],
        }),
      ],
      guidance: [{
        id: 'g1',
        type: 'continue',
        title: 'Keep going',
        reason: 'open loop',
        action: 'Open session',
        importance: 0.8,
        confidence: 0.7,
        sourceObservationIds: [],
        sourceLoopIds: [],
        targetSessionId: 's1',
        createdAt: now,
      } as CognitionGuidanceDto],
      loops: [{
        id: 'l1',
        title: 'Loop',
        summary: 'open',
        status: 'open',
        importance: 0.6,
        confidence: 0.6,
        observationIds: [],
        firstSeenAt: now,
        lastUpdatedAt: now,
        sessionId: 's1',
      } as CognitionLoopDto],
      now,
      allowCognitionDerived: true,
    })
    expect(items).toHaveLength(1)
    expect(items[0]?.id).toBe('s1')
    expect(items[0]?.reasonCodes).toContain('overdue')
    expect(items[0]?.reasonCodes).toContain('checkpoint_next_steps')
    expect(items[0]?.reasonCodes).toContain('guidance')
    expect(items[0]?.reasonCodes).toContain('open_loop')
    expect(items[0]?.sources).toContain('guidance')
    expect(items[0]?.sources).toContain('loop')
  })

  it('skips cognition-derived items when allowCognitionDerived is false', () => {
    const items = buildPendingQueue({
      sessions: [
        session({
          id: 's-reminder',
          name: 'Reminder',
          taskReminderAt: now - 1000,
        }),
      ],
      guidance: [{
        id: 'g1',
        type: 'continue',
        title: 'Hidden',
        reason: 'x',
        action: 'y',
        importance: 1,
        confidence: 1,
        sourceObservationIds: [],
        sourceLoopIds: [],
        createdAt: now,
      } as CognitionGuidanceDto],
      loops: [{
        id: 'l1',
        title: 'Hidden loop',
        summary: 'open',
        status: 'open',
        importance: 1,
        confidence: 1,
        observationIds: [],
        firstSeenAt: now,
        lastUpdatedAt: now,
      } as CognitionLoopDto],
      allowCognitionDerived: false,
      now,
    })
    expect(items).toHaveLength(1)
    expect(items[0]?.sessionId).toBe('s-reminder')
    expect(items[0]?.reasonCodes).toContain('reminder')
  })

  it('respects snooze keys and allows re-entry after expiry', () => {
    const sessions = [
      session({
        id: 's-snooze',
        name: 'Snoozed',
        taskDueAt: now - 1000,
      }),
    ]
    const snoozed = buildPendingQueue({
      sessions,
      snoozedKeys: ['s-snooze'],
      now,
    })
    expect(snoozed).toHaveLength(0)

    const after = buildPendingQueue({
      sessions,
      snoozedKeys: [],
      now: now + 86_400_000,
    })
    expect(after).toHaveLength(1)
  })

  it('keeps loop-only items under loop: id when no session', () => {
    const items = buildPendingQueue({
      sessions: [],
      loops: [{
        id: 'loop-1',
        title: 'Standalone',
        summary: 'open',
        status: 'blocked',
        importance: 0.9,
        confidence: 0.8,
        observationIds: [],
        firstSeenAt: now,
        lastUpdatedAt: now,
      } as CognitionLoopDto],
      allowCognitionDerived: true,
      now,
    })
    expect(items).toHaveLength(1)
    expect(items[0]?.id).toBe('loop:loop-1')
  })
})

describe('RecentRail', () => {
  it('filters archived/hidden sessions and about:blank tabs', () => {
    const sessions = buildRecentRailSessions([
      session({ id: 'ok', name: 'OK', lastMessageAt: 3 }),
      session({ id: 'arch', name: 'Arch', isArchived: true, lastMessageAt: 9 }),
      session({ id: 'hid', name: 'Hid', hidden: true, lastMessageAt: 8 }),
    ])
    expect(sessions.map((s) => s.id)).toEqual(['ok'])

    const tabs = buildRecentRailTabs([
      { id: 't1', url: 'https://example.com', title: 'Example' },
      { id: 't2', url: 'about:blank', title: 'New' },
    ] as any)
    expect(tabs.map((t) => t.id)).toEqual(['t1'])
  })

  it('does not put recent items into pending queue by itself', () => {
    const recent = buildRecentRailSessions([
      session({ id: 'r1', name: 'Recent chat', lastMessageAt: Date.now() }),
    ])
    const pending = buildPendingQueue({
      sessions: [session({ id: 'r1', name: 'Recent chat', lastMessageAt: Date.now() })],
    })
    expect(recent).toHaveLength(1)
    expect(pending).toHaveLength(0)
  })
})

describe('explore settings Phase C migration', () => {
  it('maps proactiveSuggestionsEnabled=false to showTodaySection=false once', () => {
    const { settings, migrated, notes } = migrateExploreSettingsPhaseC({
      proactiveSuggestionsEnabled: false,
      aiStatusEnabled: true,
    })
    expect(migrated).toBe(true)
    expect(settings.showTodaySection).toBe(false)
    expect(settings.showSessionComposer).toBe(true)
    expect(settings._phaseCMigrated).toBe(true)
    expect(notes.some((n) => n.includes('proactiveSuggestionsEnabled'))).toBe(true)
  })

  it('does not remigrate when already migrated', () => {
    const { migrated } = migrateExploreSettingsPhaseC({
      showTodaySection: true,
      showSessionComposer: false,
      _phaseCMigrated: true,
      proactiveSuggestionsEnabled: false,
    })
    expect(migrated).toBe(false)
  })
})
