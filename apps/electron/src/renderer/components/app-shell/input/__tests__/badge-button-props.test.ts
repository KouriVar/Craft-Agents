import { describe, expect, it, mock } from 'bun:test'
import {
  mergeBadgeRefs,
  resolveBadgeButtonAttributes,
} from '../badge-button-props'

describe('badge-button-props (Trigger forwarding)', () => {
  it('merges multiple refs onto the same node', () => {
    const a: { current: HTMLButtonElement | null } = { current: null }
    const b: { current: HTMLButtonElement | null } = { current: null }
    const merged = mergeBadgeRefs(a, b)
    const node = { tag: 'button' } as unknown as HTMLButtonElement
    merged(node)
    expect(a.current).toBe(node)
    expect(b.current).toBe(node)
    merged(null)
    expect(a.current).toBeNull()
    expect(b.current).toBeNull()
  })

  it('lands Radix trigger accessibility props on the button attribute bag', () => {
    const resolved = resolveBadgeButtonAttributes({
      label: 'Actions',
      forwarded: {
        'data-state': 'open',
        'aria-expanded': true,
        'aria-haspopup': 'menu',
        tabIndex: 0,
      },
    })
    expect(resolved.buttonProps['data-state']).toBe('open')
    expect(resolved.buttonProps['aria-expanded']).toBe(true)
    expect(resolved.buttonProps['aria-haspopup']).toBe('menu')
    expect(resolved.buttonProps.tabIndex).toBe(0)
    expect(resolved.ariaLabel).toBe('Actions')
  })

  it('prefers an explicit aria-label from the trigger over the badge label', () => {
    const resolved = resolveBadgeButtonAttributes({
      label: 'Actions',
      forwarded: { 'aria-label': 'Open context actions' },
    })
    expect(resolved.ariaLabel).toBe('Open context actions')
  })

  it('composes onClick so Trigger handlers still run', () => {
    const triggerClick = mock(() => {})
    const ownClick = mock(() => {})
    const resolved = resolveBadgeButtonAttributes({
      label: 'Actions',
      onClick: ownClick,
      forwarded: { onClick: triggerClick },
    })
    const event = { type: 'click' } as unknown as Parameters<typeof resolved.composedOnClick>[0]
    resolved.composedOnClick(event)
    expect(triggerClick).toHaveBeenCalledTimes(1)
    expect(ownClick).toHaveBeenCalledTimes(1)
  })

  it('forwards disabled from the trigger when provided', () => {
    const resolved = resolveBadgeButtonAttributes({
      label: 'Actions',
      disabled: false,
      forwarded: { disabled: true },
    })
    expect(resolved.disabled).toBe(true)
  })
})
