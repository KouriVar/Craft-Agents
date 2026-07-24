import { describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { TodayStateStore } from '../TodayStateStore'

describe('TodayStateStore', () => {
  it('persists snooze until expiry and indefinite pause', () => {
    const root = mkdtempSync(join(tmpdir(), 'today-state-'))
    try {
      const store = new TodayStateStore(root)
      const now = Date.parse('2026-07-24T12:00:00.000Z')
      store.snooze('s1', now + 60_000, now)
      expect(store.activeSnoozeKeys(now).has('s1')).toBe(true)
      expect(store.activeSnoozeKeys(now + 120_000).has('s1')).toBe(false)

      store.snooze('s2', null, now)
      expect(store.activeSnoozeKeys(now + 86_400_000 * 30).has('s2')).toBe(true)
      store.clearSnooze('s2', now)
      expect(store.activeSnoozeKeys(now).has('s2')).toBe(false)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('stores completeAndArchive idempotency responses', () => {
    const root = mkdtempSync(join(tmpdir(), 'today-state-'))
    try {
      const store = new TodayStateStore(root)
      const response = {
        sessionId: 's1',
        ok: true,
        alreadyCompleted: false,
        steps: [{ step: 'archive' as const, status: 'ok' as const }],
      }
      store.setIdempotency('key-1', response)
      expect(store.getIdempotency('key-1')).toEqual(response)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
