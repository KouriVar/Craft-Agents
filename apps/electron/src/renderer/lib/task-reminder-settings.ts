/**
 * Session reminder preferences.
 *
 * v0.20 moves these values out of the removed Explore product surface. The
 * legacy `preferences.explore` object is read only once so existing reminder
 * choices survive the transition; all subsequent writes use `taskReminders`.
 */
export interface TaskReminderSettings {
  remindersEnabled: boolean
  quietHoursStart: string
  quietHoursEnd: string
}

type LegacyExplorePreferences = Partial<TaskReminderSettings>

export const DEFAULT_TASK_REMINDER_SETTINGS: TaskReminderSettings = {
  remindersEnabled: true,
  quietHoursStart: '22:00',
  quietHoursEnd: '08:00',
}

function normalize(value: Partial<TaskReminderSettings> | null | undefined): TaskReminderSettings {
  return {
    remindersEnabled: typeof value?.remindersEnabled === 'boolean' ? value.remindersEnabled : DEFAULT_TASK_REMINDER_SETTINGS.remindersEnabled,
    quietHoursStart: /^\d{2}:\d{2}$/.test(value?.quietHoursStart ?? '') ? value!.quietHoursStart! : DEFAULT_TASK_REMINDER_SETTINGS.quietHoursStart,
    quietHoursEnd: /^\d{2}:\d{2}$/.test(value?.quietHoursEnd ?? '') ? value!.quietHoursEnd! : DEFAULT_TASK_REMINDER_SETTINGS.quietHoursEnd,
  }
}

export async function getTaskReminderSettings(): Promise<TaskReminderSettings> {
  try {
    const { content } = await window.electronAPI.readPreferences()
    const preferences = JSON.parse(content || '{}') as { taskReminders?: Partial<TaskReminderSettings>; explore?: LegacyExplorePreferences }
    if (preferences.taskReminders) return normalize(preferences.taskReminders)
    const settings = normalize(preferences.explore)
    if (preferences.explore) await saveTaskReminderSettings(settings)
    return settings
  } catch {
    return { ...DEFAULT_TASK_REMINDER_SETTINGS }
  }
}

export async function saveTaskReminderSettings(settings: TaskReminderSettings): Promise<void> {
  const { content } = await window.electronAPI.readPreferences()
  const preferences = JSON.parse(content || '{}') as Record<string, unknown>
  delete preferences.explore
  await window.electronAPI.writePreferences(JSON.stringify({
    ...preferences,
    taskReminders: normalize(settings),
    updatedAt: Date.now(),
  }, null, 2))
  window.dispatchEvent(new CustomEvent('craft:task-reminder-settings-changed', { detail: settings }))
}

export function isInQuietHours(settings: Pick<TaskReminderSettings, 'quietHoursStart' | 'quietHoursEnd'>, date = new Date()): boolean {
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
