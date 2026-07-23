import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { restoreSessionFileWatch } from '../session-files-watch'
import { installWindowShim, restoreWindowShim } from '../../../../test/window-shim'

describe('restoreSessionFileWatch', () => {
  const originalConsoleError = console.error

  beforeEach(() => {
    console.error = () => {}
  })

  afterEach(() => {
    console.error = originalConsoleError
    restoreWindowShim()
  })

  it('re-establishes the file watch and reloads files', async () => {
    const calls: string[] = []

    installWindowShim({
      electronAPI: {
        watchSessionFiles: async (sessionId: string) => {
          calls.push(`watch:${sessionId}`)
        },
      },
    })

    await restoreSessionFileWatch('session-1', async () => {
      calls.push('reload')
    })

    expect(calls).toEqual(['watch:session-1', 'reload'])
  })

  it('still reloads files when re-subscribing the watch fails', async () => {
    const calls: string[] = []

    installWindowShim({
      electronAPI: {
        watchSessionFiles: async () => {
          calls.push('watch')
          throw new Error('watch failed')
        },
      },
    })

    await restoreSessionFileWatch('session-2', async () => {
      calls.push('reload')
    })

    expect(calls).toEqual(['watch', 'reload'])
  })
})
