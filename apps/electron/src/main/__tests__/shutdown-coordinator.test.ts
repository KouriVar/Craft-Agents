import { describe, expect, it, mock } from 'bun:test'
import { cleanupApplicationResources, type ShutdownResources } from '../shutdown-coordinator'

function createResources(overrides: Partial<ShutdownResources> = {}) {
  const calls: string[] = []
  const resources: ShutdownResources = {
    sessionManager: {
      flushAllSessions: async () => { calls.push('session-flush') },
      cleanup: async () => { calls.push('session-cleanup') },
    },
    browserPaneManager: { destroyAll: () => { calls.push('browser') } },
    oauthFlowStore: { dispose: () => { calls.push('oauth') } },
    stopModelRefresh: () => { calls.push('models') },
    messagingHandle: { dispose: async () => { calls.push('messaging') } },
    cleanupPowerManager: () => { calls.push('power') },
    releaseServerLock: () => { calls.push('lock') },
    logger: { info: mock(() => {}), error: mock(() => {}) },
    ...overrides,
  }
  return { resources, calls }
}

describe('cleanupApplicationResources', () => {
  it('cleans independent resources when SessionManager was never initialized', async () => {
    const { resources, calls } = createResources({ sessionManager: null })

    const results = await cleanupApplicationResources(resources)

    expect(calls).toEqual(['browser', 'oauth', 'models', 'messaging', 'power', 'lock'])
    expect(results.every((result) => result.ok)).toBe(true)
  })

  it('continues after failures and always reaches lock release', async () => {
    const { resources, calls } = createResources({
      sessionManager: {
        flushAllSessions: async () => {
          calls.push('session-flush')
          throw new Error('flush failed')
        },
        cleanup: async () => { calls.push('session-cleanup') },
      },
      messagingHandle: {
        dispose: async () => {
          calls.push('messaging')
          throw new Error('worker stuck')
        },
      },
    })

    const results = await cleanupApplicationResources(resources)

    expect(calls).toEqual([
      'session-flush', 'session-cleanup', 'browser', 'oauth', 'models', 'messaging', 'power', 'lock',
    ])
    expect(results.filter((result) => !result.ok).map((result) => result.phase)).toEqual([
      'session-flush', 'messaging-dispose',
    ])
    expect(calls.at(-1)).toBe('lock')
  })

  it('runs phases in deterministic shutdown order', async () => {
    const { resources, calls } = createResources()
    await cleanupApplicationResources(resources)
    expect(calls).toEqual([
      'session-flush', 'session-cleanup', 'browser', 'oauth', 'models', 'messaging', 'power', 'lock',
    ])
  })
})
