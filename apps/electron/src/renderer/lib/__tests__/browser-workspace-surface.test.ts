import { describe, expect, it } from 'bun:test'
import { shouldShowEmbeddedBrowserSurface } from '../browser-workspace-surface'

describe('browser workspace surface visibility', () => {
  it('shows the native surface for a healthy tab, including the internal new-tab page', () => {
    expect(shouldShowEmbeddedBrowserSurface({
      nativeViewsSuspended: false,
      isCrashed: false,
    })).toBe(true)
  })

  it('hides the native surface while overlays suspend native views', () => {
    expect(shouldShowEmbeddedBrowserSurface({
      nativeViewsSuspended: true,
      isCrashed: false,
    })).toBe(false)
  })

  it('hides a crashed native surface so the recovery UI remains actionable', () => {
    expect(shouldShowEmbeddedBrowserSurface({
      nativeViewsSuspended: false,
      isCrashed: true,
    })).toBe(false)
  })
})
