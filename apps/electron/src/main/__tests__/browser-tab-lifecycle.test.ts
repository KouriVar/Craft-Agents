import { describe, expect, it } from 'bun:test'
import { BrowserTabLifecycle, type BrowserTabLifecycleState } from '../browser-tab-lifecycle'

function tab(id: string, currentUrl = 'https://example.com'): BrowserTabLifecycleState {
  return {
    id,
    currentUrl,
    isLoading: false,
    lastCrashAt: 0,
    crashRecoveryAttempts: 0,
    crashed: false,
    crashReason: null,
  }
}

describe('BrowserTabLifecycle', () => {
  it('registers a tab once and rejects duplicate creation', () => {
    const lifecycle = new BrowserTabLifecycle<BrowserTabLifecycleState>()
    const first = tab('tab-a')

    expect(lifecycle.register(first)).toBe(true)
    expect(lifecycle.register(tab('tab-a'))).toBe(false)
    expect(lifecycle.records.get('tab-a')).toBe(first)
  })

  it('rolls back a failed close and accepts state again', () => {
    const lifecycle = new BrowserTabLifecycle<BrowserTabLifecycleState>()
    const current = tab('tab-a')
    lifecycle.register(current)

    expect(lifecycle.beginClose('tab-a')).toBe(current)
    expect(lifecycle.shouldAcceptEvent('tab-a')).toBe(false)
    lifecycle.cancelClose('tab-a')
    expect(lifecycle.shouldAcceptEvent('tab-a')).toBe(true)
    expect(lifecycle.records.get('tab-a')).toBe(current)
  })

  it('finalizes close once and rejects late events', () => {
    const lifecycle = new BrowserTabLifecycle<BrowserTabLifecycleState>()
    const current = tab('tab-a')
    lifecycle.register(current)
    lifecycle.beginClose('tab-a')

    expect(lifecycle.finalizeClose('tab-a', current)).toBe(current)
    expect(lifecycle.finalizeClose('tab-a', current)).toBeUndefined()
    expect(lifecycle.shouldAcceptEvent('tab-a')).toBe(false)
  })

  it('reloads twice, then surfaces recovery after consecutive crashes', () => {
    const lifecycle = new BrowserTabLifecycle<BrowserTabLifecycleState>()
    const current = tab('tab-a')
    lifecycle.register(current)

    expect(lifecycle.recordCrash(current, { reason: 'crashed' }, 10_000)).toBe('reload')
    expect(lifecycle.recordCrash(current, { reason: 'crashed' }, 20_000)).toBe('reload')
    expect(lifecycle.recordCrash(current, { reason: 'crashed' }, 30_000)).toBe('surface-recovery')
    expect(current).toMatchObject({
      crashed: true,
      crashReason: 'crashed',
      crashRecoveryAttempts: 3,
    })
  })

  it('resets the crash window after a quiet minute', () => {
    const lifecycle = new BrowserTabLifecycle<BrowserTabLifecycleState>()
    const current = tab('tab-a')
    lifecycle.register(current)
    lifecycle.recordCrash(current, { reason: 'crashed' }, 10_000)
    lifecycle.recordCrash(current, { reason: 'crashed' }, 80_001)

    expect(current.crashRecoveryAttempts).toBe(1)
    expect(current.crashed).toBe(false)
  })

  it('does not recover non-web tabs or clean exits', () => {
    const lifecycle = new BrowserTabLifecycle<BrowserTabLifecycleState>()
    const current = tab('tab-a', 'about:blank')
    lifecycle.register(current)

    expect(lifecycle.recordCrash(current, { reason: 'clean-exit' }, 10_000)).toBe('ignored')
    expect(lifecycle.recordCrash(current, { reason: 'crashed' }, 20_000)).toBe('surface-recovery')
  })
})
