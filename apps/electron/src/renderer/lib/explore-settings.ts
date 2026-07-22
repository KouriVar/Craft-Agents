/**
 * Explore settings — controls the unified entry's AI work-resume area.
 *
 * Phase 1 persists the preferences; the actual AI generation lands in Phase 2.
 * Stored in the user-level preferences file.
 */
export type ExploreAiFrequency = 'startup' | '6h' | '12h' | '24h'

export interface ExploreSettings {
  /** Whether to generate/show the "continue work" AI suggestions on the Explore home. */
  aiStatusEnabled: boolean
  /** How often to regenerate suggestions. */
  aiFrequency: ExploreAiFrequency
  /** How many suggestion cards to show. */
  aiCount: 3 | 5
  /** Rule-based Today recommendations and checkpoint-informed ranking. */
  proactiveSuggestionsEnabled: boolean
  /** Native task reminders. */
  remindersEnabled: boolean
  /** Local quiet-hours boundaries in HH:mm. Equal values disable quiet hours. */
  quietHoursStart: string
  quietHoursEnd: string
}

export const DEFAULT_EXPLORE_SETTINGS: ExploreSettings = {
  aiStatusEnabled: true,
  aiFrequency: 'startup',
  aiCount: 3,
  proactiveSuggestionsEnabled: true,
  remindersEnabled: true,
  quietHoursStart: '22:00',
  quietHoursEnd: '08:00',
}

const AI_FREQUENCIES: ExploreAiFrequency[] = ['startup', '6h', '12h', '24h']

export async function getExploreSettings(): Promise<ExploreSettings> {
  let value: Partial<ExploreSettings> | null = null
  try {
    const { content } = await window.electronAPI.readPreferences()
    const preferences = JSON.parse(content || '{}') as { explore?: Partial<ExploreSettings> }
    value = preferences.explore ?? null
  } catch {
    value = null
  }
  if (!value || typeof value !== 'object') return { ...DEFAULT_EXPLORE_SETTINGS }
  return {
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
