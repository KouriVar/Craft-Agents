/**
 * Explore settings — Explore home display + legacy AI resume prefs.
 *
 * Phase C canonical display switches:
 * - showTodaySection (C)
 * - showSessionComposer (D)
 *
 * Legacy keys remain readable for one-shot migration / diagnostics but no longer
 * drive the Explore home recommendation surfaces.
 */

export type ExploreAiFrequency = 'startup' | '6h' | '12h' | '24h'

export type CognitionGuidanceScope = 'workspace' | 'activeSessions'

export interface ExploreSettings {
  /** Switch C: show PendingQueue + RecentRail on Explore. */
  showTodaySection: boolean
  /** Switch D: show session-mode composer on Explore home. */
  showSessionComposer: boolean
  /**
   * @deprecated Phase C — no longer drives Explore home Brief.
   * Kept for prefs compatibility / diagnostics.
   */
  aiStatusEnabled: boolean
  /** @deprecated Phase C — Brief frequency unused on home. */
  aiFrequency: ExploreAiFrequency
  /** @deprecated Phase C — Brief count unused on home. */
  aiCount: 3 | 5
  /**
   * @deprecated Migrated once into showTodaySection.
   * Do not use to drive UI after Phase C migration.
   */
  proactiveSuggestionsEnabled: boolean
  /** Native task reminders. */
  remindersEnabled: boolean
  /** Local quiet-hours boundaries in HH:mm. Equal values disable quiet hours. */
  quietHoursStart: string
  quietHoursEnd: string
  /**
   * @deprecated Phase C — cognition on Today is gated by privacy.today.useContext (B).
   * One-shot migration may map false → privacy today.useContext=false.
   */
  cognitionGuidanceEnabled: boolean
  /** Optional auto-refresh when loading PendingQueue cognition inputs. */
  cognitionGuidanceAutoRefresh: boolean
  /** Filter guidance to workspace-wide or only sessions in the current task list. */
  cognitionGuidanceScope: CognitionGuidanceScope
  /** Internal: Phase C one-shot migration applied. */
  _phaseCMigrated?: boolean
}

export const DEFAULT_EXPLORE_SETTINGS: ExploreSettings = {
  showTodaySection: true,
  showSessionComposer: true,
  aiStatusEnabled: true,
  aiFrequency: 'startup',
  aiCount: 3,
  proactiveSuggestionsEnabled: true,
  remindersEnabled: true,
  quietHoursStart: '22:00',
  quietHoursEnd: '08:00',
  cognitionGuidanceEnabled: true,
  cognitionGuidanceAutoRefresh: true,
  cognitionGuidanceScope: 'workspace',
  _phaseCMigrated: true,
}

const AI_FREQUENCIES: ExploreAiFrequency[] = ['startup', '6h', '12h', '24h']
const GUIDANCE_SCOPES: CognitionGuidanceScope[] = ['workspace', 'activeSessions']

export interface ExploreSettingsMigrationResult {
  settings: ExploreSettings
  /** True when prefs were rewritten this call. */
  migrated: boolean
  /** Notes for ops log / diagnostics. */
  notes: string[]
}

function normalizeExploreSettings(value: Partial<ExploreSettings> | null | undefined): ExploreSettings {
  if (!value || typeof value !== 'object') return { ...DEFAULT_EXPLORE_SETTINGS }
  return {
    showTodaySection: typeof value.showTodaySection === 'boolean'
      ? value.showTodaySection
      : DEFAULT_EXPLORE_SETTINGS.showTodaySection,
    showSessionComposer: typeof value.showSessionComposer === 'boolean'
      ? value.showSessionComposer
      : DEFAULT_EXPLORE_SETTINGS.showSessionComposer,
    aiStatusEnabled: typeof value.aiStatusEnabled === 'boolean' ? value.aiStatusEnabled : DEFAULT_EXPLORE_SETTINGS.aiStatusEnabled,
    aiFrequency: value.aiFrequency && AI_FREQUENCIES.includes(value.aiFrequency) ? value.aiFrequency : DEFAULT_EXPLORE_SETTINGS.aiFrequency,
    aiCount: value.aiCount === 3 || value.aiCount === 5 ? value.aiCount : DEFAULT_EXPLORE_SETTINGS.aiCount,
    proactiveSuggestionsEnabled: typeof value.proactiveSuggestionsEnabled === 'boolean'
      ? value.proactiveSuggestionsEnabled
      : DEFAULT_EXPLORE_SETTINGS.proactiveSuggestionsEnabled,
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
    cognitionGuidanceScope:
      value.cognitionGuidanceScope && GUIDANCE_SCOPES.includes(value.cognitionGuidanceScope)
        ? value.cognitionGuidanceScope
        : DEFAULT_EXPLORE_SETTINGS.cognitionGuidanceScope,
    _phaseCMigrated: value._phaseCMigrated === true,
  }
}

/**
 * One-shot Phase C migration:
 * - proactiveSuggestionsEnabled=false → showTodaySection=false
 * - missing C/D keys → default true (unless proactive was off)
 * - cognitionGuidanceEnabled=false is recorded; privacy B mapping is applied by caller via privacy RPC
 * - aiStatusEnabled / aiCount / aiFrequency retained but no longer drive home
 */
export function migrateExploreSettingsPhaseC(
  raw: Partial<ExploreSettings> | null | undefined,
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

  notes.push('aiStatusEnabled/aiCount/aiFrequency retained; no longer drive Explore home Brief')
  notes.push('proactiveSuggestionsEnabled/cognitionGuidanceEnabled no longer drive deleted home sections')

  return { settings: next, migrated: true, notes }
}

export async function getExploreSettings(): Promise<ExploreSettings> {
  let value: Partial<ExploreSettings> | null = null
  try {
    const { content } = await window.electronAPI.readPreferences()
    const preferences = JSON.parse(content || '{}') as { explore?: Partial<ExploreSettings> }
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
      explore?: Partial<ExploreSettings> & { _phaseCPrivacyMapped?: boolean }
    }
    if (preferences.explore?._phaseCPrivacyMapped) return
    await window.electronAPI.setPrivacyPolicy({
      workspaceId,
      policy: { today: { useContext: false } },
    })
    await window.electronAPI.writePreferences(JSON.stringify({
      ...preferences,
      explore: { ...preferences.explore, ...settings, _phaseCPrivacyMapped: true },
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
    explore: settings,
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
