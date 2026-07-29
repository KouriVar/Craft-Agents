import { describe, expect, it } from 'bun:test'
import { confirmAutomationDraft, inferAutomationDraft, validateAutomationDraft } from '../draft.ts'

describe('v0.20 automation draft', () => {
  it('requires an explicit confirmation after type inference', () => {
    const draft = inferAutomationDraft('每天 9 点汇总项目消息')
    expect(draft.confirmed).toBe(false)
    expect(confirmAutomationDraft(draft).confirmed).toBe(true)
  })
  it('does not allow a page monitor without independent URL/rule/frequency configuration', () => {
    const draft = inferAutomationDraft('监控网页变化并通知我')
    expect(validateAutomationDraft(draft).join(' ')).toContain('URL')
  })
})
