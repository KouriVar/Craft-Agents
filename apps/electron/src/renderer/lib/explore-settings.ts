/**
 * Explore settings — Explore home display prefs.
 *
 * Canonical switches:
 * - showTodaySection (C)
 * - showSessionComposer (D)
 *
 * Brief-era keys (aiStatusEnabled / aiFrequency / aiCount / proactiveSuggestionsEnabled)
 * are read only for one-shot Phase C migration and are never written back (v0.16.8).
 */

export type ExploreAiFrequency = 'startup' | '6h' | '12h' | '24h'

export interface ExploreSettings {
  /** Switch C: show PendingQueue + RecentRail on Explore. */
  showTodaySection: boolean
  /** Switch D: show session-mode composer on Explore home. */
  showSessionComposer: boolean
  /** Native task reminders. */
  remindersEnabled: boolean
  /** Local quiet-hours boundaries in HH:mm. Equal values disable quiet hours. */
  quietHoursStart: string
  quietHoursEnd: string
  /**
   * @deprecated Phase C — cognition on Today is gated by privacy.today.useContext (B).
   * Kept in-memory for one-shot privacy mapping; not a product toggle.
   */
  cognitionGuidanceEnabled: boolean
  /** Optional auto-refresh when loading PendingQueue cognition inputs. */
  cognitionGuidanceAutoRefresh: boolean
  /** Internal: Phase C one-shot migration applied. */
  _phaseCMigrated?: boolean
}

/** Legacy keys still accepted on read for migration only. */
type LegacyExploreRaw = Partial<ExploreSettings> & {
  aiStatusEnabled?: boolean
  aiFrequency?: ExploreAiFrequency
  aiCount?: 3 | 5
  proactiveSuggestionsEnabled?: boolean
  cognitionGuidanceScope?: 'workspace' | 'activeSessions'
}

export const DEFAULT_EXPLORE_SETTINGS: ExploreSettings = {
  showTodaySection: true,
  showSessionComposer: true,
  remindersEnabled: true,
  quietHoursStart: '22:00',
  quietHoursEnd: '08:00',
  cognitionGuidanceEnabled: true,
  cognitionGuidanceAutoRefresh: true,
  _phaseCMigrated: true,
}

export interface ExploreSettingsMigrationResult {
  settings: ExploreSettings
  /** True when prefs were rewritten this call. */
  migrated: boolean
  /** Notes for ops log / diagnostics. */
  notes: string[]
}

function normalizeExploreSettings(value: LegacyExploreRaw | null | undefined): ExploreSettings {
  if (!value || typeof value !== 'object') return { ...DEFAULT_EXPLORE_SETTINGS }
  return {
    showTodaySection: typeof value.showTodaySection === 'boolean'
      ? value.showTodaySection
      : DEFAULT_EXPLORE_SETTINGS.showTodaySection,
    showSessionComposer: typeof value.showSessionComposer === 'boolean'
      ? value.showSessionComposer
      : DEFAULT_EXPLORE_SETTINGS.showSessionComposer,
    remindersEnabled: typeof value.remindersEnabled === 'boolean'
      ? value.remindersEnabled
      : DEFAULT_EXPLORE_SETTINGS.remindersEnabled,
    quietHoursStart: /^\d{2}:\d{2}$/.test(value.quietHoursStart ?? '')
      ? value.quietHoursStart!
      : DEFAULT_EXPLORE_SETTINGS.quietHoursStart,
    quietHoursEnd: /^\d{2}:\d{2}$/.test(value.quietHoursEnd ?? '')
      ? value.quietHoursEnd!
      : DEFAULT_EXPLORE_SETTINGS.quietHoursEnd,
    cognitionGuidanceEnabled: typeof value.cognitionGuidanceEnabled === 'boolean'
      ? value.cognitionGuidanceEnabled
      : DEFAULT_EXPLORE_SETTINGS.cognitionGuidanceEnabled,
    cognitionGuidanceAutoRefresh: typeof value.cognitionGuidanceAutoRefresh === 'boolean'
      ? value.cognitionGuidanceAutoRefresh
      : DEFAULT_EXPLORE_SETTINGS.cognitionGuidanceAutoRefresh,
    _phaseCMigrated: value._phaseCMigrated === true,
  }
}

/**
 * Persistable explore slice — never includes Brief-era or unused scope keys.
 */
export function toPersistedExploreSettings(
  settings: ExploreSettings,
  extras?: Record<string, unknown>,
): Record<string, unknown> {
  return {
    showTodaySection: settings.showTodaySection,
    showSessionComposer: settings.showSessionComposer,
    remindersEnabled: settings.remindersEnabled,
    quietHoursStart: settings.quietHoursStart,
    quietHoursEnd: settings.quietHoursEnd,
    cognitionGuidanceEnabled: settings.cognitionGuidanceEnabled,
    cognitionGuidanceAutoRefresh: settings.cognitionGuidanceAutoRefresh,
    _phaseCMigrated: settings._phaseCMigrated === true,
    ...extras,
  }
}

/**
 * One-shot Phase C migration:
 * - proactiveSuggestionsEnabled=false → showTodaySection=false
 * - missing C/D keys → default true (unless proactive was off)
 * - cognitionGuidanceEnabled=false is recorded; privacy B mapping is applied by caller via privacy RPC
 */
export function migrateExploreSettingsPhaseC(
  raw: LegacyExploreRaw | null | undefined,
): ExploreSettingsMigrationResult {
  const notes: string[] = []
  const base = normalizeExploreSettings(raw)
  if (base._phaseCMigrated) {
    return { settings: base, migrated: false, notes }
  }

  const next: ExploreSettings = { ...base, _phaseCMigrated: true }

  if (typeof raw?.showTodaySection !== 'boolean') {
    if (raw?.proactiveSuggestionsEnabled === false) {
      next.showTodaySection = false
      notes.push('proactiveSuggestionsEnabled=false → showTodaySection=false')
    } else {
      next.showTodaySection = true
      notes.push('showTodaySection defaulted to true')
    }
  }

  if (typeof raw?.showSessionComposer !== 'boolean') {
    next.showSessionComposer = true
    notes.push('showSessionComposer defaulted to true')
  }

  if (raw?.cognitionGuidanceEnabled === false) {
    notes.push('cognitionGuidanceEnabled=false → map privacy.today.useContext=false (caller)')
  }

  notes.push('Brief-era explore keys are not rewritten (v0.16.8)')
  notes.push('cognitionGuidanceScope removed — unused')

  return { settings: next, migrated: true, notes }
}

export async function getExploreSettings(): Promise<ExploreSettings> {
  let value: LegacyExploreRaw | null = null
  try {
    const { content } = await window.electronAPI.readPreferences()
    const preferences = JSON.parse(content || '{}') as { explore?: LegacyExploreRaw }
    value = preferences.explore ?? null
  } catch {
    value = null
  }

  const { settings, migrated } = migrateExploreSettingsPhaseC(value)
  if (migrated) {
    try {
      await saveExploreSettings(settings)
    } catch {
      // Non-fatal — still return migrated in-memory settings
    }
  }
  return settings
}

/**
 * Apply deferred privacy mapping for cognitionGuidanceEnabled=false once.
 * Call after getExploreSettings when workspaceId is known.
 */
export async function applyExplorePrivacyMigration(
  workspaceId: string,
  settings: ExploreSettings,
): Promise<void> {
  if (!workspaceId) return
  if (settings.cognitionGuidanceEnabled !== false) return
  try {
    const { content } = await window.electronAPI.readPreferences()
    const preferences = JSON.parse(content || '{}') as Record<string, unknown> & {
      explore?: Record<string, unknown> & { _phaseCPrivacyMapped?: boolean }
    }
    if (preferences.explore?._phaseCPrivacyMapped) return
    await window.electronAPI.setPrivacyPolicy({
      workspaceId,
      policy: { today: { useContext: false } },
    })
    await window.electronAPI.writePreferences(JSON.stringify({
      ...preferences,
      explore: toPersistedExploreSettings(settings, { _phaseCPrivacyMapped: true }),
      updatedAt: Date.now(),
    }, null, 2))
  } catch {
    // Non-fatal — privacy page remains source of truth if this fails
  }
}

export async function saveExploreSettings(settings: ExploreSettings): Promise<void> {
  const { content } = await window.electronAPI.readPreferences()
  const preferences = JSON.parse(content || '{}') as Record<string, unknown>
  await window.electronAPI.writePreferences(JSON.stringify({
    ...preferences,
    explore: toPersistedExploreSettings(settings),
    updatedAt: Date.now(),
  }, null, 2))
  window.dispatchEvent(new CustomEvent('craft:explore-settings-changed', { detail: settings }))
}

export function isInQuietHours(settings: Pick<ExploreSettings, 'quietHoursStart' | 'quietHoursEnd'>, date = new Date()): boolean {
  const toMinutes = (value: string) => {
    const [hours, minutes] = value.split(':').map(Number)
    return hours * 60 + minutes
  }
  const start = toMinutes(settings.quietHoursStart)
  const end = toMinutes(settings.quietHoursEnd)
  if (start === end) return false
  const now = date.getHours() * 60 + date.getMinutes()
  return start < end ? now >= start && now < end : now >= start || now < end
}
