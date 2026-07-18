import { describe, expect, it } from 'bun:test'
import { fitWindowBoundsToWorkAreas, sanitizeWindowState } from '../window-restore'

describe('window state sanitization', () => {
  it('keeps valid windows and removes malformed entries', () => {
    expect(sanitizeWindowState({
      windows: [
        { type: 'main', workspaceId: 'alpha', bounds: { x: -1200, y: 20, width: 1000, height: 700 }, focused: true },
        { type: 'main', workspaceId: '', bounds: { x: 0, y: 0, width: 1000, height: 700 } },
        { type: 'main', workspaceId: 'bad-size', bounds: { x: 0, y: 0, width: Number.NaN, height: 700 } },
      ],
      lastFocusedWorkspaceId: 'alpha',
    })).toEqual({
      windows: [
        { type: 'main', workspaceId: 'alpha', bounds: { x: -1200, y: 20, width: 1000, height: 700 }, focused: true },
      ],
      lastFocusedWorkspaceId: 'alpha',
    })
  })

  it('rejects a non-object or a state without a windows array', () => {
    expect(sanitizeWindowState(null)).toBeNull()
    expect(sanitizeWindowState({ windows: 'invalid' })).toBeNull()
  })
})

describe('cross-platform window bounds restore', () => {
  const primary = { x: 0, y: 0, width: 1920, height: 1040 }
  const secondary = { x: -1280, y: 0, width: 1280, height: 984 }

  it('preserves bounds that still fit the current display topology', () => {
    const saved = { x: -1200, y: 40, width: 1000, height: 700 }
    expect(fitWindowBoundsToWorkAreas(saved, [primary, secondary])).toEqual(saved)
  })

  it('moves a window from a removed monitor back to the primary work area', () => {
    expect(fitWindowBoundsToWorkAreas(
      { x: 2500, y: -900, width: 1400, height: 900 },
      [primary],
    )).toEqual({ x: 520, y: 0, width: 1400, height: 900 })
  })

  it('shrinks oversized bounds for a low-resolution VM without going offscreen', () => {
    expect(fitWindowBoundsToWorkAreas(
      { x: 100, y: 100, width: 1600, height: 1200 },
      [{ x: 0, y: 0, width: 1024, height: 728 }],
    )).toEqual({ x: 0, y: 0, width: 1024, height: 728 })
  })
})
