import { describe, expect, it } from 'bun:test'
import {
  resolveAccessLogDecisionKey,
  resolveAccessLogDisplay,
  resolveAccessLogPurposeKey,
  resolveAccessLogSourceKey,
} from '../access-log-display'

describe('access-log-display', () => {
  it('maps background cognition sources to activity labels', () => {
    expect(resolveAccessLogSourceKey(['browser'])).toBe('settings.privacy.logSource.browser')
    expect(resolveAccessLogSourceKey(['session'])).toBe('settings.privacy.logSource.session')
    expect(resolveAccessLogSourceKey(['git'])).toBe('settings.privacy.logSource.project')
  })

  it('maps ingest purpose to form-context without exposing raw event types', () => {
    expect(resolveAccessLogPurposeKey('cognition_ingest', 'ingest:browser_page_opened')).toBe(
      'settings.privacy.logPurpose.formContext',
    )
    expect(resolveAccessLogPurposeKey('library_generate', 'library_generate')).toBe(
      'settings.privacy.logPurpose.libraryGenerate',
    )
    expect(resolveAccessLogPurposeKey('today_context', 'today_context')).toBe(
      'settings.privacy.logPurpose.today',
    )
  })

  it('maps decisions including privacy-mode block', () => {
    expect(resolveAccessLogDecisionKey('allow')).toBe('settings.privacy.logDecision.allow')
    expect(resolveAccessLogDecisionKey('deny')).toBe('settings.privacy.logDecision.deny')
    expect(resolveAccessLogDecisionKey('ask')).toBe('settings.privacy.logDecision.ask')
    expect(resolveAccessLogDecisionKey('blocked_by_privacy_mode')).toBe(
      'settings.privacy.logDecision.privacyMode',
    )
  })

  it('composes display keys from metadata only', () => {
    const keys = resolveAccessLogDisplay({
      feature: 'cognition_ingest',
      sources: ['browser'],
      purpose: 'ingest:browser_page_opened',
      decision: 'allow',
    })
    expect(keys).toEqual({
      sourceKey: 'settings.privacy.logSource.browser',
      purposeKey: 'settings.privacy.logPurpose.formContext',
      decisionKey: 'settings.privacy.logDecision.allow',
    })
  })
})
