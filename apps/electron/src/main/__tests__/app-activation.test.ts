import { describe, expect, it, mock } from 'bun:test'
import {
  activateExistingOrCreateWindow,
  activateWindow,
  extractDeepLink,
} from '../app-activation'

function createWindow(options: { destroyed?: boolean; minimized?: boolean; visible?: boolean } = {}) {
  return {
    isDestroyed: mock(() => options.destroyed ?? false),
    isMinimized: mock(() => options.minimized ?? false),
    isVisible: mock(() => options.visible ?? true),
    restore: mock(() => {}),
    show: mock(() => {}),
    focus: mock(() => {}),
  }
}

describe('single-instance activation', () => {
  it('extracts a case-insensitive deeplink from Windows-style arguments', () => {
    expect(extractDeepLink(['CraftAgent.exe', '--flag', 'CRAFT-AGENTS://oauth/callback'], 'craft-agents'))
      .toBe('CRAFT-AGENTS://oauth/callback')
  })

  it('restores and reveals an existing window exactly once before focusing', () => {
    const window = createWindow({ minimized: true, visible: false })
    expect(activateWindow(window)).toBe(true)
    expect(window.restore).toHaveBeenCalledTimes(1)
    expect(window.show).toHaveBeenCalledTimes(1)
    expect(window.focus).toHaveBeenCalledTimes(1)
  })

  it('does not act on a destroyed window', () => {
    const window = createWindow({ destroyed: true })
    expect(activateWindow(window)).toBe(false)
    expect(window.restore).not.toHaveBeenCalled()
    expect(window.show).not.toHaveBeenCalled()
    expect(window.focus).not.toHaveBeenCalled()
  })

  it('activates an existing live window without creating a replacement', () => {
    const window = createWindow({ visible: false })
    const createReplacement = mock(() => {})

    expect(activateExistingOrCreateWindow({
      getExistingWindow: () => window,
      createWindow: createReplacement,
    })).toBe(true)

    expect(window.show).toHaveBeenCalledTimes(1)
    expect(createReplacement).not.toHaveBeenCalled()
  })

  it('creates a replacement after the last window was closed', () => {
    const createReplacement = mock(() => {})

    expect(activateExistingOrCreateWindow({
      getExistingWindow: () => null,
      createWindow: createReplacement,
    })).toBe(true)

    expect(createReplacement).toHaveBeenCalledTimes(1)
  })

  it('creates a replacement when the managed window reference is stale', () => {
    const staleWindow = createWindow({ destroyed: true })
    const createReplacement = mock(() => {})

    expect(activateExistingOrCreateWindow({
      getExistingWindow: () => staleWindow,
      createWindow: createReplacement,
    })).toBe(true)

    expect(createReplacement).toHaveBeenCalledTimes(1)
  })
})
