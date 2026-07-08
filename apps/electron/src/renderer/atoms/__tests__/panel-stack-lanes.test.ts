import { describe, it, expect } from 'bun:test'
import { createStore } from 'jotai'
import {
  panelStackAtom,
  focusedPanelIdAtom,
  pushPanelAtom,
  reconcilePanelStackAtom,
  updateFocusedPanelRouteAtom,
  type PanelStackEntry,
} from '../panel-stack'

function getStack(store: ReturnType<typeof createStore>): PanelStackEntry[] {
  return store.get(panelStackAtom)
}

describe('panel stack single-lane behavior', () => {
  it('replaces the current panel for new panel requests', () => {
    const store = createStore()

    store.set(pushPanelAtom, { route: 'allSessions/session/s1' })
    store.set(pushPanelAtom, { route: 'sources/source/github' })
    store.set(pushPanelAtom, { route: 'settings' })

    const stack = getStack(store)
    expect(stack).toHaveLength(1)
    expect(stack[0].route).toBe('settings')
    expect(stack.every((p) => p.laneId === 'main')).toBe(true)
  })

  it('implicit navigation replaces the visible panel route', () => {
    const store = createStore()

    store.set(pushPanelAtom, { route: 'allSessions/session/s1' })
    store.set(pushPanelAtom, { route: 'sources/source/github' })

    const sourcePanel = getStack(store).find((p) => p.route === 'sources/source/github')
    expect(sourcePanel).toBeDefined()
    store.set(focusedPanelIdAtom, sourcePanel!.id)

    store.set(updateFocusedPanelRouteAtom, 'allSessions/session/s2')

    const stack = getStack(store)
    expect(stack).toHaveLength(1)
    expect(stack[0].route).toBe('allSessions/session/s2')
  })

  it('ignores afterIndex when replacing the current panel', () => {
    const store = createStore()

    store.set(pushPanelAtom, { route: 'allSessions/session/s1' })
    store.set(pushPanelAtom, { route: 'allSessions/session/s2' })

    store.set(pushPanelAtom, { route: 'sources/source/linear', afterIndex: 0 })

    const stack = getStack(store)
    expect(stack).toHaveLength(1)
    expect(stack[0].route).toBe('sources/source/linear')
  })

  it('reconcile collapses restored panel lists to the focused route', () => {
    const store = createStore()

    const changed = store.set(reconcilePanelStackAtom, {
      entries: [
        { route: 'allSessions/session/s1', proportion: 0.5 },
        { route: 'sources/source/github', proportion: 0.5 },
      ],
      focusedIndex: 1,
    })

    expect(changed).toBe(true)

    const stack = getStack(store)
    expect(stack).toHaveLength(1)
    expect(stack[0].route).toBe('sources/source/github')
    const focusedId = store.get(focusedPanelIdAtom)
    expect(focusedId).toBe(stack[0].id)
  })

  it('reconcile no-op keeps focus on the single restored route', () => {
    const store = createStore()

    store.set(reconcilePanelStackAtom, {
      entries: [
        { route: 'allSessions/session/s1', proportion: 0.5 },
        { route: 'sources/source/github', proportion: 0.5 },
      ],
      focusedIndex: 1,
    })

    const stack = getStack(store)
    const focusedId = stack[0].id

    const changed = store.set(reconcilePanelStackAtom, {
      entries: [
        { route: 'allSessions/session/s1', proportion: 0.5 },
        { route: 'sources/source/github', proportion: 0.5 },
      ],
      focusedIndex: 1,
    })

    expect(changed).toBe(false)
    expect(store.get(focusedPanelIdAtom)).toBe(focusedId)
  })
})
