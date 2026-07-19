import type { SessionEvent } from '@craft-agent/shared/protocol'
import type { BrowserAskAiSnapshot } from '../shared/types'

export function createBrowserAskAiSnapshot(
  workspaceId: string,
  prompt: string,
): BrowserAskAiSnapshot {
  return {
    sessionId: null,
    workspaceId,
    prompt,
    answer: '',
    status: 'starting',
    activity: 'Starting a new conversation…',
    error: null,
    title: null,
  }
}

function typedErrorMessage(event: Extract<SessionEvent, { type: 'typed_error' }>): string {
  const candidate = event.error as unknown as { message?: unknown; title?: unknown }
  if (typeof candidate.message === 'string') return candidate.message
  if (typeof candidate.title === 'string') return candidate.title
  return 'The AI request failed. Open the full conversation for details.'
}

/**
 * Reduce a full session event into the deliberately small, privacy-safe state
 * shown in a browser tab. Tool inputs, tool outputs and approval payloads never
 * cross this boundary.
 */
export function reduceBrowserAskAiSnapshot(
  snapshot: BrowserAskAiSnapshot,
  event: SessionEvent,
): BrowserAskAiSnapshot {
  if (!snapshot.sessionId || event.sessionId !== snapshot.sessionId) return snapshot

  switch (event.type) {
    case 'text_delta':
      return { ...snapshot, answer: snapshot.answer + event.delta, status: 'streaming', activity: 'Writing…' }
    case 'text_complete':
      return {
        ...snapshot,
        answer: event.text || snapshot.answer,
        status: event.isIntermediate ? 'streaming' : snapshot.status,
        activity: event.isIntermediate ? 'Working…' : snapshot.activity,
      }
    case 'tool_start':
      return {
        ...snapshot,
        status: 'streaming',
        activity: event.toolDisplayName || event.toolIntent || 'Using a tool…',
      }
    case 'status':
      return { ...snapshot, status: 'streaming', activity: event.message }
    case 'permission_request':
    case 'credential_request':
    case 'auth_request':
      return {
        ...snapshot,
        status: 'attention',
        activity: 'Action required in the full conversation',
      }
    case 'error':
      return { ...snapshot, status: 'error', activity: null, error: event.error }
    case 'typed_error':
      return { ...snapshot, status: 'error', activity: null, error: typedErrorMessage(event) }
    case 'interrupted':
      return { ...snapshot, status: 'interrupted', activity: null }
    case 'complete':
      return { ...snapshot, status: 'complete', activity: null }
    case 'title_generated':
      return { ...snapshot, title: event.title }
    default:
      return snapshot
  }
}
