import { afterEach, describe, expect, it } from 'bun:test'
import { setDismissibleLayerBridge } from '../dismissible-layer-bridge'
import { detectNativeViewPauseReasons, hasOpenOverlay } from '../overlay-detection'

const originalDocument = globalThis.document

afterEach(() => {
  setDismissibleLayerBridge(null)
  try {
    if (originalDocument === undefined) {
      Reflect.deleteProperty(globalThis, 'document')
    } else {
      Object.defineProperty(globalThis, 'document', {
        value: originalDocument,
        writable: true,
        configurable: true,
      })
    }
  } catch {
    // globalThis may be frozen in full suite — best effort cleanup
  }
})

describe('hasOpenOverlay', () => {
  it('returns true when dismissible stack has open layers', () => {
    setDismissibleLayerBridge({
      registerLayer: () => () => {},
      hasOpenLayers: () => true,
      getTopLayer: () => ({ id: 'island-1', type: 'island', priority: 200 }),
      closeTop: () => true,
      handleEscape: () => true,
    })

    Object.defineProperty(globalThis, 'document', {
      value: {
        querySelector: () => null,
      },
      writable: true,
      configurable: true,
    })

    expect(hasOpenOverlay()).toBe(true)
  })

  it('returns true when an island dialog is open', () => {
    Object.defineProperty(globalThis, 'document', {
      value: {
        querySelector: (selector: string) => {
          if (selector.includes('[data-ca-island-dialog="true"][data-state="open"]')) {
            return {}
          }

          return null
        },
      },
      writable: true,
      configurable: true,
    })

    expect(hasOpenOverlay()).toBe(true)
  })

  it('returns false when no overlays are open', () => {
    Object.defineProperty(globalThis, 'document', {
      value: {
        querySelector: () => null,
      },
      writable: true,
      configurable: true,
    })

    expect(hasOpenOverlay()).toBe(false)
  })
})

describe('detectNativeViewPauseReasons', () => {
  it('reports each active semantic owner and excludes tooltips', () => {
    const root = {
      querySelector: (selector: string) => {
        if (selector.includes('dialog-content')) return {}
        if (selector.includes('dropdown-menu-content')) return {}
        if (selector.includes('role="tooltip"')) return null
        return null
      },
    }

    expect(detectNativeViewPauseReasons(root as unknown as Document)).toEqual(['dialog', 'menu'])
  })

  it('returns no owners when only non-blocking content is visible', () => {
    expect(
      detectNativeViewPauseReasons({
        querySelector: () => null,
      } as unknown as Document),
    ).toEqual([])
  })

  it('pauses the native browser surface for navigator-contained menus', () => {
    const root = {
      querySelector: (selector: string) => {
        return selector.includes('context-menu-content') ? {} : null
      },
    }

    expect(detectNativeViewPauseReasons(root as unknown as Document)).toEqual(['menu'])
  })
})
