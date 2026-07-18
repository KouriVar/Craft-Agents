import { afterEach, describe, expect, it } from 'bun:test'
import { setDismissibleLayerBridge } from '../dismissible-layer-bridge'
import { detectNativeViewPauseReasons, hasOpenOverlay } from '../overlay-detection'

const originalDocument = globalThis.document

afterEach(() => {
  setDismissibleLayerBridge(null)
  ;(globalThis as unknown as { document: Document | undefined }).document = originalDocument
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

    ;(globalThis as unknown as { document: { querySelector: (_selector: string) => null } }).document = {
      querySelector: () => null,
    }

    expect(hasOpenOverlay()).toBe(true)
  })

  it('returns true when an island dialog is open', () => {
    ;(globalThis as unknown as { document: { querySelector: (selector: string) => object | null } }).document = {
      querySelector: (selector: string) => {
        if (selector.includes('[data-ca-island-dialog="true"][data-state="open"]')) {
          return {}
        }

        return null
      },
    }

    expect(hasOpenOverlay()).toBe(true)
  })

  it('returns false when no overlays are open', () => {
    ;(globalThis as unknown as { document: { querySelector: (_selector: string) => null } }).document = {
      querySelector: () => null,
    }

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
    expect(detectNativeViewPauseReasons({ querySelector: () => null } as unknown as Document)).toEqual([])
  })
})
