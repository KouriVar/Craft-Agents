import { describe, expect, it } from 'bun:test'
import { homedir } from 'os'
import { join } from 'path'
import {
  CognitionSanitizeError,
  sanitizeCognitionEventInput,
  sanitizePath,
  sanitizeUrl,
  buildSessionStoppedEvent,
  buildCheckpointCreatedEvent,
  buildSessionModelChangedEvent,
  mapProcessingReasonToStopReason,
  COGNITION_SCHEMA_VERSION,
} from '../index.ts'

describe('cognition event builders', () => {
  it('builds session.stopped completed/failed/interrupted with shared shape', () => {
    for (const reason of ['completed', 'failed', 'interrupted'] as const) {
      const event = buildSessionStoppedEvent({
        sessionId: 'sess-1',
        turnId: 'turn-1',
        reason,
        checkpointId: 'cp-1',
        nextSteps: ['Run tests'],
        blockers: ['Waiting on OAuth'],
      })
      expect(event.type).toBe('session.stopped')
      expect(event.payload.reason).toBe(reason)
      expect(event.idempotencyKey).toBe('session.stopped:sess-1:turn-1')
      expect(event.subject).toEqual({ kind: 'session_task', id: 'sess-1' })
      expect(event.schemaVersion).toBe(COGNITION_SCHEMA_VERSION)
    }
  })

  it('builds checkpoint auto/manual with distinct idempotency keys', () => {
    const auto = buildCheckpointCreatedEvent({
      sessionId: 'sess-1',
      checkpointId: 'cp-a',
      source: 'auto',
      outcome: 'completed',
      turnId: 'turn-1',
    })
    const manual = buildCheckpointCreatedEvent({
      sessionId: 'sess-1',
      checkpointId: 'cp-m',
      source: 'manual',
      outcome: 'completed',
    })
    expect(auto.type).toBe('checkpoint.created')
    expect(auto.idempotencyKey).toBe('checkpoint.auto:sess-1:cp-a')
    expect(manual.idempotencyKey).toBe('checkpoint.manual:sess-1:cp-m')
  })

  it('builds model changed event', () => {
    const event = buildSessionModelChangedEvent({
      sessionId: 'sess-1',
      model: 'claude-sonnet-4',
      previousModel: 'claude-haiku',
      revision: 42,
    })
    expect(event.type).toBe('session.model_changed')
    expect(event.idempotencyKey).toBe('session.model_changed:sess-1:claude-sonnet-4:42')
  })

  it('maps processing reasons to stop reasons', () => {
    expect(mapProcessingReasonToStopReason('complete')).toBe('completed')
    expect(mapProcessingReasonToStopReason('error')).toBe('failed')
    expect(mapProcessingReasonToStopReason('interrupted')).toBe('interrupted')
    expect(mapProcessingReasonToStopReason('timeout')).toBe('cancelled')
  })
})

describe('cognition sanitizer', () => {
  it('removes URL query, hash, and credentials', () => {
    expect(sanitizeUrl('https://user:pass@example.com/docs/api?token=secret#frag')).toBe(
      'https://example.com/docs/api',
    )
  })

  it('redacts home absolute paths to basename', () => {
    const homeFile = join(homedir(), 'secret', 'notes.md')
    expect(sanitizePath(homeFile)).toBe('notes.md')
  })

  it('converts in-workspace paths to relative', () => {
    const root = '/tmp/craft-ws-data'
    expect(sanitizePath('/tmp/craft-ws-data/sessions/a/file.ts', root)).toBe('sessions/a/file.ts')
  })

  it('rejects path escape with ..', () => {
    expect(() => sanitizePath('../etc/passwd', '/tmp/ws')).toThrow(CognitionSanitizeError)
  })

  it('strips token-like fields and rejects diff payloads', () => {
    expect(() =>
      sanitizeCognitionEventInput({
        type: 'session.stopped',
        source: 'session',
        timestamp: Date.now(),
        schemaVersion: 1,
        summary: 'done',
        payload: { reason: 'completed', turnId: 't1', diff: '+++ secret' },
      } as never),
    ).toThrow(/diff\/patch/)
  })

  it('clears authorization-like keys from nested payload', () => {
    const sanitized = sanitizeCognitionEventInput({
      type: 'session.created',
      source: 'session',
      timestamp: Date.now(),
      schemaVersion: 1,
      summary: 'Session created',
      sessionId: 's1',
      payload: {
        name: 'Demo',
        authorization: 'Bearer sk-abcdefghijklmnopqrstuvwxyz',
        cookie: 'session=abc',
      },
    } as never)
    const payload = sanitized.payload as Record<string, unknown>
    expect(payload.authorization).toBeUndefined()
    expect(payload.cookie).toBeUndefined()
    expect(payload.name).toBe('Demo')
  })

  it('truncates long summary text', () => {
    const sanitized = sanitizeCognitionEventInput({
      type: 'session.created',
      source: 'session',
      timestamp: Date.now(),
      schemaVersion: 1,
      summary: 'x'.repeat(2000),
      sessionId: 's1',
      payload: { name: 'Demo' },
    } as never)
    expect(sanitized.summary.length).toBeLessThanOrEqual(480)
  })

  it('rejects oversized payloads', () => {
    expect(() =>
      sanitizeCognitionEventInput({
        type: 'session.created',
        source: 'session',
        timestamp: Date.now(),
        schemaVersion: 1,
        summary: 'big',
        sessionId: 's1',
        payload: { name: 'y'.repeat(40_000) },
      } as never),
    ).toThrow(/max size/)
  })
})
