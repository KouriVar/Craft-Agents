import { describe, expect, it } from 'bun:test'
import {
  EMPTY_STATE_PROMPT_SAMPLES,
  EMPTY_STATE_PROMPT_SAMPLES_ZH_HANS,
  getEmptyStatePromptSamples,
} from '../empty-state-prompts'

describe('browser empty-state prompt localization', () => {
  it('returns all ten Chinese shortcuts for Chinese locales', () => {
    const prompts = getEmptyStatePromptSamples('zh-Hans')

    expect(prompts).toBe(EMPTY_STATE_PROMPT_SAMPLES_ZH_HANS)
    expect(prompts).toHaveLength(10)
    expect(prompts.every((sample) => /[\u4e00-\u9fff]/.test(sample.short))).toBe(true)
    expect(prompts.every((sample) => /[\u4e00-\u9fff]/.test(sample.full))).toBe(true)
  })

  it('keeps the existing English shortcuts for non-Chinese locales', () => {
    expect(getEmptyStatePromptSamples('en')).toBe(EMPTY_STATE_PROMPT_SAMPLES)
  })
})
