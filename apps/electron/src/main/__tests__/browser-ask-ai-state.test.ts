import { describe, expect, it } from 'bun:test'
import type { SessionEvent } from '@craft-agent/shared/protocol'
import type { BrowserAskAiSnapshot } from '../../shared/types'
import { createBrowserAskAiSnapshot, reduceBrowserAskAiSnapshot } from '../browser-ask-ai-state'

function started(): BrowserAskAiSnapshot {
  return { ...createBrowserAskAiSnapshot('workspace-1', 'Explain this'), sessionId: 'session-1' }
}

describe('browser Ask AI state projection', () => {
  it('streams text and uses the completed text as the canonical answer', () => {
    let state = started()
    state = reduceBrowserAskAiSnapshot(state, { type: 'text_delta', sessionId: 'session-1', delta: 'Hel' })
    state = reduceBrowserAskAiSnapshot(state, { type: 'text_delta', sessionId: 'session-1', delta: 'lo' })
    state = reduceBrowserAskAiSnapshot(state, { type: 'text_complete', sessionId: 'session-1', text: 'Hello!' })
    expect(state.answer).toBe('Hello!')
    expect(state.status).toBe('streaming')
  })

  it('ignores late events from another session', () => {
    const state = started()
    const next = reduceBrowserAskAiSnapshot(state, {
      type: 'text_delta', sessionId: 'old-session', delta: 'private',
    })
    expect(next).toBe(state)
  })

  it('projects tools without exposing input or result data', () => {
    const event: SessionEvent = {
      type: 'tool_start', sessionId: 'session-1', toolName: 'browser_navigate', toolUseId: 'tool-1',
      toolInput: { secret: 'must-not-leak' }, toolDisplayName: 'Researching the web',
    }
    const next = reduceBrowserAskAiSnapshot(started(), event)
    expect(next.activity).toBe('Researching the web')
    expect(JSON.stringify(next)).not.toContain('must-not-leak')
  })

  it('routes approval requests to the full conversation and recovers on completion', () => {
    const request = { type: 'permission_request', sessionId: 'session-1', request: {} } as SessionEvent
    const attention = reduceBrowserAskAiSnapshot(started(), request)
    expect(attention.status).toBe('attention')
    const complete = reduceBrowserAskAiSnapshot(attention, { type: 'complete', sessionId: 'session-1' })
    expect(complete.status).toBe('complete')
  })

  it('surfaces terminal failures and interruptions', () => {
    expect(reduceBrowserAskAiSnapshot(started(), {
      type: 'error', sessionId: 'session-1', error: 'Network unavailable',
    }).error).toBe('Network unavailable')
    expect(reduceBrowserAskAiSnapshot(started(), {
      type: 'interrupted', sessionId: 'session-1',
    }).status).toBe('interrupted')
  })
})
