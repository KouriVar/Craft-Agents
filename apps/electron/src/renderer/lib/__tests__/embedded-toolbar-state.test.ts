import { describe, expect, it } from 'bun:test'
import { getEmbeddedToolbarModeTransition } from '../embedded-toolbar-state'

describe('embedded toolbar mode transitions', () => {
  it('resets the pending pin state after fixed -> floating so pinning can run again', () => {
    expect(getEmbeddedToolbarModeTransition(null, 'floating')).toEqual({
      pinPending: false,
      revealed: false,
    })
    expect(getEmbeddedToolbarModeTransition('floating', 'fixed')).toEqual({
      pinPending: true,
      revealed: false,
    })
    expect(getEmbeddedToolbarModeTransition('fixed', 'floating')).toEqual({
      pinPending: false,
      revealed: false,
    })
  })

  it('does not reset hover state for ordinary state updates in the same mode', () => {
    expect(getEmbeddedToolbarModeTransition('floating', 'floating')).toBeNull()
  })
})
