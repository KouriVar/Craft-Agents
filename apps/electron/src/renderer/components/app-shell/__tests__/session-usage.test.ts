import { describe, expect, it } from 'bun:test'
import {
  formatTokenCount,
  formatUsd,
  getContextUsage,
  resolveModelName,
  resolvePricingKind,
} from '../session-usage'

describe('session usage presentation', () => {
  it('formats compact token counts and small USD estimates', () => {
    expect(formatTokenCount(47_200)).toBe('47.2K')
    expect(formatTokenCount(1_000_000)).toBe('1M')
    expect(formatUsd(0.004321)).toBe('$0.0043')
    expect(formatUsd(0.00001)).toBe('<$0.0001')
  })

  it('calculates bounded context usage', () => {
    expect(getContextUsage({
      inputTokens: 47_000,
      outputTokens: 0,
      totalTokens: 47_000,
      contextTokens: 0,
      contextWindow: 258_000,
      costUsd: 0,
    })).toEqual({ used: 47_000, window: 258_000, percent: 18, remainingPercent: 82 })
  })

  it('distinguishes dynamic pricing contexts', () => {
    expect(resolvePricingKind({ providerType: 'pi', piAuthProvider: 'deepseek', authType: 'api_key' } as any)).toBe('deepseek-standard')
    expect(resolvePricingKind({ providerType: 'pi', piAuthProvider: 'openai-codex', authType: 'oauth' } as any)).toBe('subscription')
    expect(resolvePricingKind({ providerType: 'pi_compat', authType: 'none' } as any)).toBe('custom')
  })

  it('uses the connection model catalog when available', () => {
    expect(resolveModelName('pi/deepseek-v4-pro', {
      models: [{ id: 'pi/deepseek-v4-pro', name: 'DeepSeek V4 Pro' }],
    } as any)).toBe('DeepSeek V4 Pro')
  })
})
