import { describe, expect, it } from 'bun:test'
import { createStore } from 'jotai'
import {
  browserNativeViewPauseReasonsAtom,
  browserNativeViewsSuspendedAtom,
  updateBrowserNativeViewPauseReasonAtom,
} from '../browser-workspace'

describe('browser native view pause ownership', () => {
  it('stays suspended until every overlapping owner releases', () => {
    const store = createStore()
    store.set(updateBrowserNativeViewPauseReasonAtom, { reason: 'menu', active: true })
    store.set(updateBrowserNativeViewPauseReasonAtom, { reason: 'dialog', active: true })

    expect(store.get(browserNativeViewsSuspendedAtom)).toBe(true)
    expect([...store.get(browserNativeViewPauseReasonsAtom)]).toEqual(['menu', 'dialog'])

    store.set(updateBrowserNativeViewPauseReasonAtom, { reason: 'menu', active: false })
    expect(store.get(browserNativeViewsSuspendedAtom)).toBe(true)

    store.set(updateBrowserNativeViewPauseReasonAtom, { reason: 'dialog', active: false })
    expect(store.get(browserNativeViewsSuspendedAtom)).toBe(false)
  })

  it('is idempotent for repeated acquire and release calls', () => {
    const store = createStore()
    store.set(updateBrowserNativeViewPauseReasonAtom, { reason: 'popover', active: true })
    store.set(updateBrowserNativeViewPauseReasonAtom, { reason: 'popover', active: true })
    expect([...store.get(browserNativeViewPauseReasonsAtom)]).toEqual(['popover'])

    store.set(updateBrowserNativeViewPauseReasonAtom, { reason: 'popover', active: false })
    store.set(updateBrowserNativeViewPauseReasonAtom, { reason: 'popover', active: false })
    expect(store.get(browserNativeViewsSuspendedAtom)).toBe(false)
  })
})
