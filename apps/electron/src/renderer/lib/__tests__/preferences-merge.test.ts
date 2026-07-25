import { describe, expect, it } from 'bun:test'
import {
  mergePreferencesFormIntoExisting,
  parsePreferencesObject,
  serializePreferencesForm,
} from '../preferences-merge'

describe('preferences merge (v0.16.8)', () => {
  const form = {
    name: 'Ada',
    timezone: 'Asia/Shanghai',
    city: 'Shanghai',
    country: 'CN',
    notes: 'Hello',
  }

  it('preserves explore, privacy, uiLanguage, and diffViewer when merging', () => {
    const existing = JSON.stringify({
      name: 'Old',
      explore: { showTodaySection: true, showSessionComposer: false },
      privacy: { contextAwarenessEnabled: true },
      uiLanguage: 'zh-Hans',
      diffViewer: { sideBySide: true },
      otherCustom: 42,
    }, null, 2)

    const merged = JSON.parse(mergePreferencesFormIntoExisting(existing, form)) as Record<string, unknown>
    expect(merged.name).toBe('Ada')
    expect(merged.timezone).toBe('Asia/Shanghai')
    expect(merged.location).toEqual({ city: 'Shanghai', country: 'CN' })
    expect(merged.notes).toBe('Hello')
    expect(merged.explore).toEqual({ showTodaySection: true, showSessionComposer: false })
    expect(merged.privacy).toEqual({ contextAwarenessEnabled: true })
    expect(merged.uiLanguage).toBe('zh-Hans')
    expect(merged.diffViewer).toEqual({ sideBySide: true })
    expect(merged.otherCustom).toBe(42)
    expect(typeof merged.updatedAt).toBe('number')
  })

  it('does not wipe unrelated keys when form fields are cleared', () => {
    const existing = JSON.stringify({
      explore: { showTodaySection: true },
      privacy: { today: { useContext: false } },
      uiLanguage: 'en',
      name: 'KeepMeUntilCleared',
    })
    const cleared = {
      name: '',
      timezone: '',
      city: '',
      country: '',
      notes: '',
    }
    const merged = JSON.parse(mergePreferencesFormIntoExisting(existing, cleared)) as Record<string, unknown>
    expect(merged.name).toBeUndefined()
    expect(merged.location).toBeUndefined()
    expect(merged.explore).toEqual({ showTodaySection: true })
    expect(merged.privacy).toEqual({ today: { useContext: false } })
    expect(merged.uiLanguage).toBe('en')
  })

  it('starts from empty object when existing JSON is invalid', () => {
    const merged = JSON.parse(mergePreferencesFormIntoExisting('not-json{', form)) as Record<string, unknown>
    expect(merged.name).toBe('Ada')
    expect(merged.explore).toBeUndefined()
  })

  it('parsePreferencesObject tolerates empty / invalid input', () => {
    expect(parsePreferencesObject('')).toEqual({})
    expect(parsePreferencesObject('[]')).toEqual({})
    expect(parsePreferencesObject('{"a":1}')).toEqual({ a: 1 })
  })

  it('serializePreferencesForm is a form-only fingerprint (no explore leak)', () => {
    const fingerprint = JSON.parse(serializePreferencesForm(form)) as Record<string, unknown>
    expect(fingerprint.name).toBe('Ada')
    expect(fingerprint.explore).toBeUndefined()
    expect(fingerprint.privacy).toBeUndefined()
  })
})
