/**
 * Preferences merge helpers (v0.16.8).
 *
 * `preferences:write` replaces the whole file — callers must read existing JSON,
 * merge the form patch, then write, so explore / privacy / uiLanguage / diffViewer
 * (and any other keys) are never wiped.
 */

export interface PreferencesFormPatch {
  name: string
  timezone: string
  city: string
  country: string
  notes: string
}

function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return { ...(value as Record<string, unknown>) }
  }
  return {}
}

/** Parse preferences.json content; invalid JSON → empty object. */
export function parsePreferencesObject(content: string | null | undefined): Record<string, unknown> {
  if (!content?.trim()) return {}
  try {
    return asObject(JSON.parse(content))
  } catch {
    return {}
  }
}

/**
 * Merge the Preferences page form fields into an existing preferences object.
 * Preserves every key not owned by this form (explore, privacy, uiLanguage, …).
 */
export function mergePreferencesFormIntoExisting(
  existingContent: string | null | undefined,
  form: PreferencesFormPatch,
): string {
  const next = parsePreferencesObject(existingContent)

  if (form.name.trim()) next.name = form.name.trim()
  else delete next.name

  if (form.timezone.trim()) next.timezone = form.timezone.trim()
  else delete next.timezone

  if (form.notes.trim()) next.notes = form.notes.trim()
  else delete next.notes

  const city = form.city.trim()
  const country = form.country.trim()
  if (city || country) {
    const location: Record<string, string> = {}
    if (city) location.city = city
    if (country) location.country = country
    next.location = location
  } else {
    delete next.location
  }

  next.updatedAt = Date.now()
  return JSON.stringify(next, null, 2)
}

/** Form-only fingerprint for dirty checks (does not include unrelated prefs keys). */
export function serializePreferencesForm(form: PreferencesFormPatch): string {
  return mergePreferencesFormIntoExisting('{}', form)
}
