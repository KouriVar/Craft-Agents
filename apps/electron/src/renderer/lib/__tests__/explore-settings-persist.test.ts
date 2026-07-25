import { describe, expect, it } from 'bun:test'
import {
  migrateExploreSettingsPhaseC,
  toPersistedExploreSettings,
  type ExploreSettings,
} from '../explore-settings'

describe('explore settings persist (v0.16.8)', () => {
  it('never writes Brief-era or unused scope keys', () => {
    const settings: ExploreSettings = {
      showTodaySection: true,
      showSessionComposer: false,
      remindersEnabled: true,
      quietHoursStart: '22:00',
      quietHoursEnd: '08:00',
      cognitionGuidanceEnabled: true,
      cognitionGuidanceAutoRefresh: false,
      _phaseCMigrated: true,
    }
    const persisted = toPersistedExploreSettings(settings)
    expect(persisted).toEqual({
      showTodaySection: true,
      showSessionComposer: false,
      remindersEnabled: true,
      quietHoursStart: '22:00',
      quietHoursEnd: '08:00',
      cognitionGuidanceEnabled: true,
      cognitionGuidanceAutoRefresh: false,
      _phaseCMigrated: true,
    })
    expect(persisted).not.toHaveProperty('aiStatusEnabled')
    expect(persisted).not.toHaveProperty('aiFrequency')
    expect(persisted).not.toHaveProperty('aiCount')
    expect(persisted).not.toHaveProperty('proactiveSuggestionsEnabled')
    expect(persisted).not.toHaveProperty('cognitionGuidanceScope')
  })

  it('migrates legacy Brief keys without rewriting them', () => {
    const { settings, migrated, notes } = migrateExploreSettingsPhaseC({
      proactiveSuggestionsEnabled: false,
      aiStatusEnabled: true,
      aiFrequency: 'startup',
      aiCount: 3,
      cognitionGuidanceScope: 'workspace',
    })
    expect(migrated).toBe(true)
    expect(settings.showTodaySection).toBe(false)
    expect(settings._phaseCMigrated).toBe(true)
    const persisted = toPersistedExploreSettings(settings)
    expect(persisted).not.toHaveProperty('aiStatusEnabled')
    expect(persisted).not.toHaveProperty('proactiveSuggestionsEnabled')
    expect(persisted).not.toHaveProperty('cognitionGuidanceScope')
    expect(notes.some((n) => n.includes('Brief-era'))).toBe(true)
  })
})
