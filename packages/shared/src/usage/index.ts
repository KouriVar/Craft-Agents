import { join } from 'path'
import { readVersionedStore, writeVersionedStore } from '../migrations/versioned-json-store.ts'

export type UsageEventKind = 'session' | 'connector' | 'skill' | 'expert' | 'automation' | 'knowledge'
export interface UsageEvent { kind: UsageEventKind; targetId: string; occurredAt: number; projectId?: string }
interface UsageStore { schemaVersion: 1; events: UsageEvent[] }
export const USAGE_STORE_SCHEMA_VERSION = 1 as const
const pathFor = (root: string) => join(root, 'usage', 'events.json')
const read = (root: string): UsageStore => readVersionedStore({
  filePath: pathFor(root),
  displayName: '本地使用情况',
  currentVersion: USAGE_STORE_SCHEMA_VERSION,
  empty: () => ({ schemaVersion: 1, events: [] }),
  validate: (value): value is UsageStore => {
    const store = value as Partial<UsageStore>
    return store.schemaVersion === 1 && Array.isArray(store.events)
  },
})
const write = (root: string, store: UsageStore): void => { writeVersionedStore(pathFor(root), store) }
export function recordUsage(root: string, event: UsageEvent): void { const store = read(root); store.events.push(event); write(root, store) }
export function summarizeUsage(root: string, since = 0): Record<UsageEventKind, number> { const out: Record<UsageEventKind, number> = { session: 0, connector: 0, skill: 0, expert: 0, automation: 0, knowledge: 0 }; for (const e of read(root).events) if (e.occurredAt >= since) out[e.kind] += 1; return out }
export function purgeUsageBefore(root: string, before: number): number { const store = read(root); const count = store.events.length; store.events = store.events.filter((x) => x.occurredAt >= before); if (count !== store.events.length) write(root, store); return count - store.events.length }
