import { describe, expect, test } from 'bun:test'
import {
  COWART_FOLLOW_UP_MAX_LENGTH,
  isTrustedCowartRuntimeUrl,
  normalizeCowartFollowUpRequest,
} from './cowart-bridge'

describe('Cowart message bridge', () => {
  test('accepts a bounded prompt and strips surrounding whitespace', () => {
    expect(normalizeCowartFollowUpRequest({ prompt: '  update the canvas  ' })).toEqual({
      prompt: 'update the canvas',
    })
  })

  test('rejects malformed and oversized prompts', () => {
    expect(normalizeCowartFollowUpRequest({})).toBeNull()
    expect(normalizeCowartFollowUpRequest({ prompt: 'x'.repeat(COWART_FOLLOW_UP_MAX_LENGTH + 1) })).toBeNull()
  })

  test('only trusts the active loopback runtime URL', () => {
    expect(isTrustedCowartRuntimeUrl(
      'http://127.0.0.1:43217/?runtime=active',
      'active',
      '43217',
    )).toBe(true)
    expect(isTrustedCowartRuntimeUrl('http://localhost:43217/?runtime=active', 'active', '43217')).toBe(false)
    expect(isTrustedCowartRuntimeUrl('http://127.0.0.1:43217/?runtime=other', 'active', '43217')).toBe(false)
    expect(isTrustedCowartRuntimeUrl('https://127.0.0.1:43217/?runtime=active', 'active', '43217')).toBe(false)
  })
})
