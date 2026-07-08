import { describe, expect, it } from 'bun:test'
import { resolveBranchNewPanelOption } from '../branching'

describe('ChatDisplay branching navigation option', () => {
  it('defaults to staying in the current panel when options are missing', () => {
    expect(resolveBranchNewPanelOption(undefined)).toBe(false)
  })

  it('respects explicit newPanel=false', () => {
    expect(resolveBranchNewPanelOption({ newPanel: false })).toBe(false)
  })

  it('respects explicit newPanel=true', () => {
    expect(resolveBranchNewPanelOption({ newPanel: true })).toBe(true)
  })
})
