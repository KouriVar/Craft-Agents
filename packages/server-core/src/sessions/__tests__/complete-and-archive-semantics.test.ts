import { describe, expect, it } from 'bun:test'
import type { CompleteAndArchiveResponse, CompleteAndArchiveStepResult } from '@craft-agent/shared/protocol'

/** Pure helper mirroring UI feedback mapping for partial archive failures. */
function summarizeCompleteAndArchive(result: CompleteAndArchiveResponse): string {
  if (result.ok && result.alreadyCompleted) return 'already'
  if (result.ok) return 'ok'
  const markDone = result.steps.find((s) => s.step === 'mark_done')
  const archive = result.steps.find((s) => s.step === 'archive')
  if (markDone && (markDone.status === 'ok' || markDone.status === 'already_done') && archive?.status === 'failed') {
    return 'done_but_archive_failed'
  }
  return 'failed'
}

function steps(...partial: Array<Partial<CompleteAndArchiveStepResult> & Pick<CompleteAndArchiveStepResult, 'step' | 'status'>>): CompleteAndArchiveStepResult[] {
  return partial.map((s) => ({ ...s }))
}

describe('completeAndArchive response semantics', () => {
  it('marks already completed', () => {
    expect(summarizeCompleteAndArchive({
      sessionId: 's1',
      ok: true,
      alreadyCompleted: true,
      steps: steps(
        { step: 'mark_done', status: 'already_done' },
        { step: 'archive', status: 'already_done' },
      ),
    })).toBe('already')
  })

  it('reports partial failure when archive fails after mark_done', () => {
    expect(summarizeCompleteAndArchive({
      sessionId: 's1',
      ok: false,
      alreadyCompleted: false,
      steps: steps(
        { step: 'mark_done', status: 'ok' },
        { step: 'create_checkpoint', status: 'failed', detail: 'boom' },
        { step: 'resolve_loops', status: 'ok' },
        { step: 'dismiss_guidance', status: 'ok' },
        { step: 'archive', status: 'failed', errorCode: 'archive_failed' },
        { step: 'clear_snooze', status: 'ok' },
      ),
    })).toBe('done_but_archive_failed')
  })

  it('requires archive ok for overall success', () => {
    const result: CompleteAndArchiveResponse = {
      sessionId: 's1',
      ok: false,
      alreadyCompleted: false,
      steps: steps(
        { step: 'mark_done', status: 'ok' },
        { step: 'archive', status: 'failed' },
      ),
    }
    expect(result.ok).toBe(false)
    expect(summarizeCompleteAndArchive(result)).toBe('done_but_archive_failed')
  })
})
