import { describe, expect, it, mock } from 'bun:test'
import type { BrowserAskAiSnapshot } from '../../../../shared/types'
import { launchBrowserAskAiSession } from '../browser-ask-ai-launcher'

function snapshot(sessionId: string | null): BrowserAskAiSnapshot {
  return {
    sessionId,
    workspaceId: 'workspace-1',
    prompt: '为什么天空是蓝色的？',
    answer: '',
    status: 'starting',
    activity: null,
    error: null,
    title: null,
  }
}

describe('launchBrowserAskAiSession', () => {
  it('resets the reusable launcher only after the session page opens', async () => {
    const order: string[] = []
    const startAskAi = mock(async () => {
      order.push('start')
      return snapshot('session-1')
    })
    const openAskAiSession = mock(async () => {
      order.push('open')
    })

    await launchBrowserAskAiSession({
      api: { startAskAi, openAskAiSession },
      prompt: '为什么天空是蓝色的？',
      token: 'token-1',
      unavailableMessage: 'Unavailable',
      onOpened: () => { order.push('reset') },
    })

    expect(order).toEqual(['start', 'open', 'reset'])
    expect(startAskAi).toHaveBeenCalledWith({ prompt: '为什么天空是蓝色的？', token: 'token-1' })
  })

  it('keeps the launcher retryable when opening the session fails', async () => {
    const onOpened = mock(() => {})
    const error = new Error('Unable to open session')

    await expect(launchBrowserAskAiSession({
      api: {
        startAskAi: async () => snapshot('session-1'),
        openAskAiSession: async () => { throw error },
      },
      prompt: 'Question',
      token: 'token-1',
      unavailableMessage: 'Unavailable',
      onOpened,
    })).rejects.toBe(error)

    expect(onOpened).not.toHaveBeenCalled()
  })

  it('does not navigate or reset when session creation has no id', async () => {
    const openAskAiSession = mock(async () => {})
    const onOpened = mock(() => {})

    await expect(launchBrowserAskAiSession({
      api: { startAskAi: async () => snapshot(null), openAskAiSession },
      prompt: 'Question',
      token: 'token-1',
      unavailableMessage: 'Unavailable',
      onOpened,
    })).rejects.toThrow('Unavailable')

    expect(openAskAiSession).not.toHaveBeenCalled()
    expect(onOpened).not.toHaveBeenCalled()
  })
})
