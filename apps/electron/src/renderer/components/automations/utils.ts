/**
 * Shared automation utilities.
 *
 * Cron helpers used by CronBuilder (visual editor) and AutomationInfoPage (info display).
 * Time formatting shared by AutomationsListPanel and AutomationEventTimeline.
 */

import { Cron } from 'croner'

/**
 * Format a timestamp as a compact relative time string (e.g. "3m", "2h", "5d").
 * Used by both AutomationsListPanel (trailing timestamp) and AutomationEventTimeline.
 */
export function formatShortRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (seconds < 60) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  if (hours < 24) return `${hours} 小时前`
  return `${days} 天前`
}

/**
 * Describe a cron expression in human-readable form.
 */
export function describeCron(cron: string): string {
  const parts = cron.trim().split(/\s+/)
  if (parts.length !== 5) return '无效的定时表达式'

  const [minute, hour, dom, month, dow] = parts

  if (cron.trim() === '* * * * *') return '每分钟'
  if (minute.startsWith('*/')) return `每 ${minute.slice(2)} 分钟`
  if (hour === '*' && minute !== '*') return `每小时的 ${minute.padStart(2, '0')} 分执行`
  if (dom === '*' && month === '*') {
    const time = `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`
    if (dow === '*') return `每天 ${time}`
    if (dow === '1-5') return `工作日 ${time}`
    if (dow === '0,6') return `周末 ${time}`
    return `${time}（星期：${dow}）`
  }
  if (month === '*' && dow === '*') {
    const time = `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`
    return `每月 ${dom} 日 ${time}`
  }
  return cron
}

/**
 * Compute the next N run times for a cron expression using croner.
 */
export function computeNextRuns(cron: string, count: number = 3): Date[] {
  try {
    const job = new Cron(cron)
    return job.nextRuns(count)
  } catch {
    return []
  }
}
