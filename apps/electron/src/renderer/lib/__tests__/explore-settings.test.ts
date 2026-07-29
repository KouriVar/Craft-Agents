import { describe, expect, it } from 'bun:test'
import { isInQuietHours } from '../task-reminder-settings'

function localTime(hours: number, minutes = 0): Date {
  const date = new Date(2026, 6, 22, hours, minutes, 0, 0)
  return date
}

describe('session reminder quiet hours', () => {
  it('supports quiet hours that cross midnight', () => {
    const settings = { quietHoursStart: '22:00', quietHoursEnd: '08:00' }
    expect(isInQuietHours(settings, localTime(23))).toBe(true)
    expect(isInQuietHours(settings, localTime(7, 59))).toBe(true)
    expect(isInQuietHours(settings, localTime(12))).toBe(false)
  })

  it('supports same-day ranges and disables equal boundaries', () => {
    expect(isInQuietHours({ quietHoursStart: '12:00', quietHoursEnd: '14:00' }, localTime(13))).toBe(true)
    expect(isInQuietHours({ quietHoursStart: '12:00', quietHoursEnd: '14:00' }, localTime(15))).toBe(false)
    expect(isInQuietHours({ quietHoursStart: '08:00', quietHoursEnd: '08:00' }, localTime(8))).toBe(false)
  })
})
