import type { DiagnosticBundle } from '@craft-agent/shared/protocol'

interface AppMetricLike {
  type?: string
  memory?: {
    workingSetSize?: number
    peakWorkingSetSize?: number
  }
}

interface MainMemoryLike {
  rss?: number
  heapUsed?: number
  heapTotal?: number
  external?: number
}

interface DiagnosticAppLike {
  getAppMetrics(): AppMetricLike[]
  listenerCount(eventName: string): number
}

const startupMilestones = new Map<string, number>()

function safeKey(value: string | undefined): string {
  if (!value) return 'unknown'
  const normalized = value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^a-z0-9-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
  return normalized.slice(0, 48) || 'unknown'
}

function finiteNonNegative(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0
}

function bytesToMb(value: unknown): number {
  return Math.round((finiteNonNegative(value) / (1024 * 1024)) * 10) / 10
}

function kbToMb(value: unknown): number {
  return Math.round((finiteNonNegative(value) / 1024) * 10) / 10
}

function countSafeKeys(values: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const value of values) {
    const key = safeKey(value)
    counts[key] = (counts[key] ?? 0) + 1
  }
  return counts
}

/** Records a one-shot monotonic startup milestone without timers or polling. */
export function recordStartupMilestone(name: string, uptimeMs = process.uptime() * 1000): void {
  const key = safeKey(name)
  if (!startupMilestones.has(key)) {
    startupMilestones.set(key, Math.max(0, Math.round(uptimeMs)))
  }
}

export function getStartupDiagnostic(): DiagnosticBundle['startup'] {
  return { milestonesMs: Object.fromEntries(startupMilestones) }
}

export function resetStartupMilestonesForTests(): void {
  startupMilestones.clear()
}

/** Converts runtime metrics into privacy-safe aggregates (no PID or command line). */
export function createResourceDiagnostic(options: {
  appMetrics: readonly AppMetricLike[]
  mainMemory: MainMemoryLike
  activeResourceTypes: readonly string[]
  appEventListeners: Record<string, number>
}): DiagnosticBundle['resources'] {
  const processTypes = options.appMetrics.map(metric => safeKey(metric.type))
  const totalWorkingSetKb = options.appMetrics.reduce(
    (total, metric) => total + finiteNonNegative(metric.memory?.workingSetSize),
    0,
  )
  const peakWorkingSetKb = options.appMetrics.reduce(
    (peak, metric) => Math.max(peak, finiteNonNegative(metric.memory?.peakWorkingSetSize)),
    0,
  )
  const listeners = Object.fromEntries(Object.entries(options.appEventListeners).map(([key, count]) => [
    safeKey(key),
    Math.max(0, Math.round(finiteNonNegative(count))),
  ]))

  return {
    electronProcesses: {
      total: options.appMetrics.length,
      byType: countSafeKeys(processTypes),
      totalWorkingSetMb: kbToMb(totalWorkingSetKb),
      largestPeakWorkingSetMb: kbToMb(peakWorkingSetKb),
    },
    mainProcessMemory: {
      rssMb: bytesToMb(options.mainMemory.rss),
      heapUsedMb: bytesToMb(options.mainMemory.heapUsed),
      heapTotalMb: bytesToMb(options.mainMemory.heapTotal),
      externalMb: bytesToMb(options.mainMemory.external),
    },
    activeResources: countSafeKeys(options.activeResourceTypes),
    appEventListeners: listeners,
  }
}

/** Best-effort live collection; diagnostics must still export if a platform API fails. */
export function collectResourceDiagnostic(app: DiagnosticAppLike): DiagnosticBundle['resources'] {
  let appMetrics: AppMetricLike[] = []
  let activeResourceTypes: string[] = []
  try {
    appMetrics = app.getAppMetrics()
  } catch {
    // An empty aggregate is more useful than failing diagnostic export.
  }
  try {
    activeResourceTypes = process.getActiveResourcesInfo()
  } catch {
    // Older Node/Electron runtimes may not expose active resource classes.
  }

  return createResourceDiagnostic({
    appMetrics,
    mainMemory: process.memoryUsage(),
    activeResourceTypes,
    appEventListeners: {
      activate: app.listenerCount('activate'),
      beforeQuit: app.listenerCount('before-quit'),
      openUrl: app.listenerCount('open-url'),
      secondInstance: app.listenerCount('second-instance'),
      windowAllClosed: app.listenerCount('window-all-closed'),
    },
  })
}
