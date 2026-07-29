import { join } from 'path'
import { randomUUID } from 'crypto'
import { readVersionedStore, writeVersionedStore } from '../migrations/versioned-json-store.ts'

export type DynamicItemKind = 'reminder' | 'automation' | 'cognition' | 'connection' | 'permission' | 'system'
export type DynamicItemPriority = 'low' | 'normal' | 'high'
export interface DynamicItem {
  id: string
  kind: DynamicItemKind
  title: string
  body?: string
  createdAt: number
  readAt?: number
  clearedAt?: number
  /** Permission, security and failure items remain until explicitly handled. */
  requiresAction: boolean
  priority: DynamicItemPriority
  projectId?: string
  automationId?: string
  source?: { sessionId?: string; runId?: string; projectId?: string; requestId?: string }
}
export interface DynamicMuteRules {
  projectIds: string[]
  automationIds: string[]
  kinds: DynamicItemKind[]
}
interface DynamicStore { schemaVersion: 1; items: DynamicItem[]; muteRules: DynamicMuteRules }
export const DYNAMIC_STORE_SCHEMA_VERSION = 1 as const
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000
const emptyStore = (): DynamicStore => ({ schemaVersion: 1, items: [], muteRules: { projectIds: [], automationIds: [], kinds: [] } })
const pathFor = (workspaceRoot: string) => join(workspaceRoot, 'dynamic', 'items.json')
function read(workspaceRoot: string): DynamicStore {
  return readVersionedStore({
    filePath: pathFor(workspaceRoot),
    displayName: '动态中心',
    currentVersion: DYNAMIC_STORE_SCHEMA_VERSION,
    empty: emptyStore,
    validate: (value): value is DynamicStore => {
      const store = value as Partial<DynamicStore>
      return store.schemaVersion === 1
        && Array.isArray(store.items)
        && !!store.muteRules
        && Array.isArray(store.muteRules.projectIds)
        && Array.isArray(store.muteRules.automationIds)
        && Array.isArray(store.muteRules.kinds)
    },
  })
}
function write(workspaceRoot: string, store: DynamicStore): void { writeVersionedStore(pathFor(workspaceRoot), store) }
function muted(item: Omit<DynamicItem, 'id' | 'createdAt' | 'requiresAction' | 'priority'>, rules: DynamicMuteRules): boolean {
  return !item.kind || rules.kinds.includes(item.kind) || (!!item.projectId && rules.projectIds.includes(item.projectId)) || (!!item.automationId && rules.automationIds.includes(item.automationId))
}
export function createDynamicItem(workspaceRoot: string, input: Omit<DynamicItem, 'id' | 'createdAt'>): DynamicItem | null {
  const store = read(workspaceRoot)
  if (!input.requiresAction && muted(input, store.muteRules)) return null
  const item: DynamicItem = { ...input, id: `dyn_${randomUUID().replace(/-/g, '').slice(0, 16)}`, createdAt: Date.now() }
  store.items.unshift(item); write(workspaceRoot, store); return item
}
export function listDynamicItems(workspaceRoot: string, filter: 'all' | 'actionable' | 'automation' | 'system' = 'all'): DynamicItem[] {
  const items = read(workspaceRoot).items.filter((item) => !item.clearedAt)
  return items.filter((item) => filter === 'all' || (filter === 'actionable' && item.requiresAction && !item.readAt) || (filter === 'automation' && item.kind === 'automation') || (filter === 'system' && ['system', 'connection', 'permission'].includes(item.kind)))
}
export function markDynamicRead(workspaceRoot: string, id: string, currentTime = Date.now()): boolean { const store = read(workspaceRoot); const item = store.items.find((x) => x.id === id); if (!item) return false; item.readAt ??= currentTime; write(workspaceRoot, store); return true }
export function clearDynamicItem(workspaceRoot: string, id: string, currentTime = Date.now()): boolean { const store = read(workspaceRoot); const item = store.items.find((x) => x.id === id); if (!item || item.requiresAction) return false; item.clearedAt = currentTime; write(workspaceRoot, store); return true }
/** An approval/rejection handler calls this after the protected operation is resolved. */
export function resolveDynamicAction(workspaceRoot: string, id: string, currentTime = Date.now()): boolean { const store = read(workspaceRoot); const item = store.items.find((x) => x.id === id); if (!item) return false; item.requiresAction = false; item.readAt ??= currentTime; item.clearedAt = currentTime; write(workspaceRoot, store); return true }
export function getDynamicItem(workspaceRoot: string, id: string): DynamicItem | undefined { return read(workspaceRoot).items.find((item) => item.id === id && !item.clearedAt) }
export function setDynamicMuteRules(workspaceRoot: string, rules: DynamicMuteRules): void { const store = read(workspaceRoot); store.muteRules = rules; write(workspaceRoot, store) }
export function getDynamicMuteRules(workspaceRoot: string): DynamicMuteRules { return read(workspaceRoot).muteRules }
export function purgeExpiredDynamicItems(workspaceRoot: string, currentTime = Date.now()): number { const store = read(workspaceRoot); const before = store.items.length; store.items = store.items.filter((item) => item.requiresAction || currentTime - item.createdAt < RETENTION_MS); if (store.items.length !== before) write(workspaceRoot, store); return before - store.items.length }
export { RETENTION_MS as DYNAMIC_ITEM_RETENTION_MS }
