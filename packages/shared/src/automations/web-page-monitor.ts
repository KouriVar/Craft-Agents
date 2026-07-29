import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { createDynamicItem } from '../dynamic/index.ts'
import { readVersionedStore, writeVersionedStore } from '../migrations/versioned-json-store.ts'
import type { AutomationMatcher } from './types.ts'

export interface WebPageMonitorTarget { id: string; name?: string; monitor: NonNullable<AutomationMatcher['webMonitor']> }
export interface WebPageMonitorState { hash?: string; summary?: string; lastCheckedAt?: number; failures: number; nextAllowedAt?: number }
interface Store { schemaVersion: 1; monitors: Record<string, WebPageMonitorState> }
const statePath = (root: string) => join(root, 'automation-web-monitors.json')
const read = (root: string): Store => readVersionedStore({
  filePath: statePath(root),
  displayName: '网页监控状态',
  currentVersion: 1,
  empty: () => ({ schemaVersion: 1, monitors: {} }),
  validate: (value): value is Store => {
    const store = value as Partial<Store>
    return store.schemaVersion === 1 && !!store.monitors && typeof store.monitors === 'object' && !Array.isArray(store.monitors)
  },
  migrateLegacy: (value) => {
    const legacy = value as { version?: unknown; monitors?: unknown }
    return legacy.version === 1 && legacy.monitors && typeof legacy.monitors === 'object'
      ? { schemaVersion: 1, monitors: legacy.monitors as Record<string, WebPageMonitorState> }
      : null
  },
})
const write = (root: string, value: Store) => writeVersionedStore(statePath(root), value)
const delayAfterFailure = (n: number) => Math.min(60 * 60_000, 60_000 * 2 ** Math.min(n, 5))

/** Background monitor with persisted snapshots, frequency control and exponential failure backoff. */
export class WebPageMonitorService {
  private timer: ReturnType<typeof setInterval> | undefined
  private running = false
  constructor(private readonly options: { workspaceRoot: string; workspaceId: string; targets: () => WebPageMonitorTarget[]; onChanged: (target: WebPageMonitorTarget, state: WebPageMonitorState) => Promise<void>; fetchText?: (url: string) => Promise<string>; now?: () => number }) {}
  start(): void { if (!this.timer) { void this.tick(); this.timer = setInterval(() => void this.tick(), 60_000) } }
  stop(): void { if (this.timer) clearInterval(this.timer); this.timer = undefined }
  async tick(): Promise<void> {
    if (this.running) return
    this.running = true
    try { for (const target of this.options.targets()) await this.check(target) } finally { this.running = false }
  }
  async check(target: WebPageMonitorTarget): Promise<void> {
    const now = this.options.now?.() ?? Date.now(); const store = read(this.options.workspaceRoot); const previous = store.monitors[target.id] ?? { failures: 0 }
    if (previous.nextAllowedAt && previous.nextAllowedAt > now) return
    if (previous.lastCheckedAt !== undefined && now - previous.lastCheckedAt < target.monitor.frequencyMinutes * 60_000) return
    try {
      const text = await (this.options.fetchText ? this.options.fetchText(target.monitor.url) : fetch(target.monitor.url).then(async response => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.text() }))
      const summary = text.replace(/\s+/g, ' ').trim().slice(0, 16_000); const hash = createHash('sha256').update(summary).digest('hex')
      const next: WebPageMonitorState = { hash, summary, lastCheckedAt: now, failures: 0 }
      store.monitors[target.id] = next; write(this.options.workspaceRoot, store)
      if (previous.hash && previous.hash !== hash) await this.options.onChanged(target, next)
    } catch (error) {
      const failures = previous.failures + 1; const next = { ...previous, failures, lastCheckedAt: now, nextAllowedAt: now + delayAfterFailure(failures) }
      store.monitors[target.id] = next; write(this.options.workspaceRoot, store)
      console.warn(`[WebPageMonitor] ${target.id} failed (${failures}); retry after ${new Date(next.nextAllowedAt!).toISOString()}`, error)
      createDynamicItem(this.options.workspaceRoot, { kind: 'automation', title: 'Web page monitor failed', body: `${target.name ?? target.id}: ${error instanceof Error ? error.message : String(error)}`, automationId: target.id, requiresAction: false, priority: 'high' })
    }
  }
}
