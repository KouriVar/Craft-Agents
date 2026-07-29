import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import { getDefaultStore } from 'jotai'
import { sessionMetaMapAtom, type SessionMeta } from '@/atoms/sessions'
import { buildContextFusionSnapshot } from '@/context-fusion'
import { buildActionContext } from '../build-action-context'
import {
  registerDefaultContextActions,
  resetDefaultContextActionsForTests,
} from '../register-defaults'
import { contextActionRegistry } from '../registry'
import { bindContextActionHost } from '../runtime-host'
import {
  LONG_SESSION_MESSAGE_COUNT,
  buildContextActionSuggestions,
  filterAvailableSuggestions,
  resolveContextActionSuggestions,
  resolveSuggestionsFromFusion,
} from '../suggestions'

function meta(partial: Partial<SessionMeta> & { id: string }): SessionMeta {
  return { workspaceId: 'ws-1', ...partial }
}

function privacy(ok: boolean) {
  return {
    contextAwarenessEnabled: ok,
    today: { useContext: ok },
    privacyMode: { active: !ok },
    effectivePrivacyModeActive: !ok,
  }
}

function fusionFor(
  session: SessionMeta,
  options: {
    privacyOk?: boolean
    guidance?: Array<{ type: string; targetSessionId?: string; confidence?: number; score?: number }>
    loops?: Array<{ sessionId?: string; status?: string; blocker?: string }>
  } = {},
) {
  return buildContextFusionSnapshot(
    { workspaceId: 'ws-1', sessionId: session.id },
    {
      sessions: [session],
      privacy: privacy(options.privacyOk ?? true),
      guidance: options.guidance,
      loops: options.loops,
    },
  )
}

describe('Context Suggestion Engine (fusion input)', () => {
  const sendMessage = mock((_id: string, _message: string) => {})
  const startLibrary = mock(async (_id: string) => {})
  const savedWindow = (globalThis as { window?: unknown }).window

  beforeEach(() => {
    resetDefaultContextActionsForTests()
    registerDefaultContextActions()
    sendMessage.mockReset()
    startLibrary.mockReset()
    bindContextActionHost({
      sendMessage,
      startLibraryFromSession: startLibrary,
    })
    ;(globalThis as { window?: unknown }).window = {
      electronAPI: {},
      dispatchEvent: () => true,
    }
  })

  afterEach(() => {
    bindContextActionHost(null)
    resetDefaultContextActionsForTests()
    if (savedWindow === undefined) {
      Reflect.deleteProperty(globalThis, 'window')
    } else {
      ;(globalThis as { window?: unknown }).window = savedWindow
    }
  })

  it('ranks session.continue above library.createFromSession from fusion snapshot', () => {
    const session = meta({
      id: 's1',
      taskGoal: 'Ship suggestions',
      messageCount: LONG_SESSION_MESSAGE_COUNT + 2,
      taskCheckpoints: [{
        id: 'cp1',
        createdAt: 1,
        source: 'auto',
        outcome: 'interrupted',
        summary: 'Paused',
        nextSteps: ['Write tests'],
      }],
    })
    const snapshot = fusionFor(session)
    const suggestions = buildContextActionSuggestions(snapshot, { hasLibraryDocument: false })
    expect(suggestions.map((s) => s.actionId)).toEqual([
      'session.continue',
      'library.createFromSession',
    ])
  })

  it('suggests library.createFromSession for long sessions without a document', () => {
    const session = meta({ id: 's1', messageCount: LONG_SESSION_MESSAGE_COUNT })
    const suggestions = buildContextActionSuggestions(fusionFor(session), {
      hasLibraryDocument: false,
    })
    expect(suggestions.map((s) => s.actionId)).toEqual(['library.createFromSession'])
  })

  it('does not suggest library when a document already exists', () => {
    const session = meta({ id: 's1', messageCount: LONG_SESSION_MESSAGE_COUNT + 4 })
    const suggestions = buildContextActionSuggestions(fusionFor(session), {
      hasLibraryDocument: true,
    })
    expect(suggestions).toEqual([])
  })

  it('maps cognition guidance from fusion when privacy allows', () => {
    const session = meta({ id: 's1', messageCount: 1 })
    const snapshot = fusionFor(session, {
      privacyOk: true,
      guidance: [{ type: 'continue', targetSessionId: 's1', confidence: 0.9, score: 600 }],
    })
    expect(snapshot.cognition.allowCognitionDerived).toBe(true)
    const suggestions = buildContextActionSuggestions(snapshot)
    expect(suggestions.map((s) => s.actionId)).toEqual(['session.continue'])
  })

  it('privacy gate: fusion clears cognition so guidance cannot suggest', () => {
    const session = meta({ id: 's1', messageCount: 1 })
    const snapshot = fusionFor(session, {
      privacyOk: false,
      guidance: [
        { type: 'resume', targetSessionId: 's1', confidence: 0.95 },
        { type: 'resolve_blocker', targetSessionId: 's1' },
      ],
    })
    expect(snapshot.cognition.guidance).toEqual([])
    expect(buildContextActionSuggestions(snapshot)).toEqual([])
  })

  it('empty state: no resume data and short session yields no suggestions', () => {
    const session = meta({ id: 's1', messageCount: 2 })
    expect(resolveSuggestionsFromFusion(fusionFor(session), { sessions: [session] })).toEqual([])
  })

  it('filterAvailableSuggestions drops unknown or unavailable actions', () => {
    const session = meta({ id: 's1', isArchived: true, messageCount: 2 })
    const context = buildActionContext({
      workspaceId: 'ws-1',
      sessionId: 's1',
      session,
    })
    const filtered = filterAvailableSuggestions(
      [
        { actionId: 'session.continue', confidence: 1 },
        { actionId: 'does.not.exist', confidence: 1 },
      ],
      context,
    )
    expect(filtered).toEqual([])
  })

  it('resolveSuggestionsFromFusion + registry.run executes the primary action', async () => {
    const session = meta({
      id: 's1',
      taskGoal: 'Finish engine',
      lastMessageAt: 10,
    })
    getDefaultStore().set(sessionMetaMapAtom, new Map([['s1', session]]))
    const snapshot = fusionFor(session)
    const suggestions = resolveSuggestionsFromFusion(snapshot, { sessions: [session] })
    expect(suggestions[0]?.actionId).toBe('session.continue')
    const context = buildActionContext({
      workspaceId: 'ws-1',
      sessionId: 's1',
      session,
      sessions: [session],
    })
    await contextActionRegistry.run(suggestions[0]!.actionId, context)
    expect(sendMessage).toHaveBeenCalledTimes(1)
    expect(sendMessage.mock.calls[0]?.[0]).toBe('s1')
  })

  it('legacy resolveContextActionSuggestions still works for Badge bridge', async () => {
    const session = meta({
      id: 's1',
      messageCount: LONG_SESSION_MESSAGE_COUNT,
    })
    const context = buildActionContext({
      workspaceId: 'ws-1',
      sessionId: 's1',
      session,
    })
    const suggestions = resolveContextActionSuggestions({
      context,
      session,
      hasLibraryDocument: false,
    })
    expect(suggestions[0]?.actionId).toBe('library.createFromSession')
    await contextActionRegistry.run(suggestions[0]!.actionId, context)
    expect(startLibrary).toHaveBeenCalledWith('s1')
  })
})
