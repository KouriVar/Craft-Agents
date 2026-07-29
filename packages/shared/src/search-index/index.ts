import { existsSync, readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { readVersionedStore, writeVersionedStore } from '../migrations/versioned-json-store.ts'

/** Unified local search never stores inaccessible data in a caller result. */
export type SearchKind = 'session' | 'knowledge' | 'file' | 'project' | 'browser-history' | 'expert' | 'skill' | 'setting-command'
export interface SearchIndexEntry {
  id: string
  kind: SearchKind
  title: string
  text: string
  updatedAt: number
  workspaceId?: string
  /** Undefined is globally visible within its workspace. */
  projectId?: string
}
export interface SearchSourceSnapshot {
  sessions?: Array<{ id: string; title: string; messages?: string[]; updatedAt: number; projectId?: string }>
  projects?: Array<{ id: string; title: string; description?: string; updatedAt: number }>
  browserHistory?: Array<{ id: string; title: string; url: string; visitedAt: number; projectId?: string }>
  experts?: Array<{ id: string; title: string; description?: string; updatedAt: number }>
  skills?: Array<{ id: string; title: string; description?: string; updatedAt: number }>
  settingCommands?: Array<{ id: string; title: string; keywords?: string[] }>
}
interface Store { schemaVersion: 2; entries: SearchIndexEntry[]; updatedAt: number }
export const SEARCH_INDEX_SCHEMA_VERSION = 2 as const
const pathFor = (root: string) => join(root, 'search-index', 'index.json')
const empty = (): Store => ({ schemaVersion: 2, entries: [], updatedAt: Date.now() })
const read = (root: string): Store => readVersionedStore({
  filePath: pathFor(root),
  displayName: '本地搜索索引',
  currentVersion: SEARCH_INDEX_SCHEMA_VERSION,
  empty,
  validate: (value): value is Store => {
    const store = value as Partial<Store>
    return store.schemaVersion === 2 && Array.isArray(store.entries) && typeof store.updatedAt === 'number'
  },
  migrate: (value, fromVersion) => {
    const legacy = value as { entries?: unknown }
    return fromVersion === 1 && Array.isArray(legacy.entries)
      ? { schemaVersion: 2, entries: legacy.entries as SearchIndexEntry[], updatedAt: 0 }
      : null
  },
})
const write = (root: string, s: Store): void => { writeVersionedStore(pathFor(root), { ...s, updatedAt: Date.now() }) }

export function upsertSearchEntry(root: string, entry: SearchIndexEntry): void {
  const store = read(root); store.entries = [...store.entries.filter((x) => x.id !== entry.id), entry]; write(root, store)
}

/** Incremental adapters for every Phase-6 product source. Hosts call this with
 * the records they own; the index never reaches across workspace boundaries. */
export function indexSearchSources(root: string, workspaceId: string, snapshot: SearchSourceSnapshot): void {
  const entries: SearchIndexEntry[] = [
    ...(snapshot.sessions ?? []).map(x => ({ id: `session:${x.id}`, kind: 'session' as const, title: x.title, text: x.messages?.join('\n') ?? '', updatedAt: x.updatedAt, workspaceId, projectId: x.projectId })),
    ...(snapshot.projects ?? []).map(x => ({ id: `project:${x.id}`, kind: 'project' as const, title: x.title, text: x.description ?? '', updatedAt: x.updatedAt, workspaceId })),
    ...(snapshot.browserHistory ?? []).map(x => ({ id: `history:${x.id}`, kind: 'browser-history' as const, title: x.title, text: x.url, updatedAt: x.visitedAt, workspaceId, projectId: x.projectId })),
    ...(snapshot.experts ?? []).map(x => ({ id: `expert:${x.id}`, kind: 'expert' as const, title: x.title, text: x.description ?? '', updatedAt: x.updatedAt, workspaceId })),
    ...(snapshot.skills ?? []).map(x => ({ id: `skill:${x.id}`, kind: 'skill' as const, title: x.title, text: x.description ?? '', updatedAt: x.updatedAt, workspaceId })),
    ...(snapshot.settingCommands ?? []).map(x => ({ id: `setting:${x.id}`, kind: 'setting-command' as const, title: x.title, text: x.keywords?.join(' ') ?? '', updatedAt: 0, workspaceId })),
  ]
  for (const entry of entries) upsertSearchEntry(root, entry)
}
export function removeSearchEntry(root: string, id: string): boolean {
  const store = read(root); const before = store.entries.length; store.entries = store.entries.filter((x) => x.id !== id); if (before !== store.entries.length) write(root, store); return before !== store.entries.length
}
export interface SearchQuery { query: string; workspaceId?: string; projectId?: string; includeGlobal?: boolean; limit?: number }
export function searchLocalIndex(root: string, query: string | SearchQuery, legacyLimit = 20): SearchIndexEntry[] {
  const options = typeof query === 'string' ? { query, limit: legacyLimit } : query
  const terms = options.query.trim().toLowerCase().split(/\s+/).filter(Boolean); if (!terms.length) return []
  return read(root).entries.filter((x) => {
    if (options.workspaceId && x.workspaceId && x.workspaceId !== options.workspaceId) return false
    // A project search may see only that project plus explicitly global records.
    if (options.projectId && x.projectId && x.projectId !== options.projectId) return false
    if (options.projectId && !options.includeGlobal && !x.projectId) return false
    const haystack = `${x.title}\n${x.text}`.toLowerCase(); return terms.every((term) => haystack.includes(term))
  }).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, options.limit ?? 20)
}

/** User-facing grouping for Spotlight-style renderers.  Keep the raw result
 * list flat for keyboard navigation, but expose predictable sections. */
export function groupSearchResults(entries: SearchIndexEntry[]): Array<{ kind: SearchKind; entries: SearchIndexEntry[] }> {
  const groups = new Map<SearchKind, SearchIndexEntry[]>()
  for (const entry of entries) groups.set(entry.kind, [...(groups.get(entry.kind) ?? []), entry])
  return [...groups.entries()].map(([kind, grouped]) => ({ kind, entries: grouped }))
}

export interface SearchRepairResult { ok: boolean; entries: number; recovered: boolean; error?: string }
/** Rewrites valid content after a corrupt/partial atomic-write failure. */
export function repairSearchIndex(root: string): SearchRepairResult {
  const file = pathFor(root)
  try { const store = read(root); write(root, store); return { ok: true, entries: store.entries.length, recovered: !existsSync(file) || store.updatedAt === 0 } }
  catch (error) { return { ok: false, entries: 0, recovered: false, error: error instanceof Error ? error.message : String(error) } }
}

/** Rebuild only Knowledge-owned entries from authoritative files. Other product
 * producers (sessions, browser, skills, settings) keep their incremental rows. */
export function rebuildKnowledgeSearchIndex(root: string, workspaceId: string): SearchRepairResult {
  try {
    const store = read(root)
    const recovered: SearchIndexEntry[] = []
    const knowledge = join(root, 'knowledge')
    const documents = join(knowledge, 'documents')
    if (existsSync(documents)) for (const name of readdirSync(documents)) {
      if (!name.endsWith('.meta.json')) continue
      const meta = JSON.parse(readFileSync(join(documents, name), 'utf8')) as { id: string; title: string; projectId?: string; updatedAt: number; status?: string }
      if (meta.status === 'trashed') continue
      const body = join(documents, `${meta.id}.md`)
      recovered.push({ id: `knowledge:${meta.id}`, kind: 'knowledge', title: meta.title, text: existsSync(body) ? readFileSync(body, 'utf8') : '', updatedAt: meta.updatedAt, workspaceId, projectId: meta.projectId })
    }
    const files = join(knowledge, 'files')
    if (existsSync(files)) for (const name of readdirSync(files)) {
      if (!name.endsWith('.meta.json')) continue
      const meta = JSON.parse(readFileSync(join(files, name), 'utf8')) as { id: string; title: string; projectId?: string; updatedAt: number; extractedTextPath?: string; extraction?: { status?: string }; status?: string }
      if (meta.status === 'trashed' || meta.extraction?.status !== 'extracted' || !meta.extractedTextPath || !existsSync(meta.extractedTextPath)) continue
      recovered.push({ id: `file:${meta.id}`, kind: 'file', title: meta.title, text: readFileSync(meta.extractedTextPath, 'utf8'), updatedAt: meta.updatedAt, workspaceId, projectId: meta.projectId })
    }
    const maps = join(knowledge, 'mindmaps')
    if (existsSync(maps)) for (const name of readdirSync(maps)) {
      if (!name.endsWith('.json')) continue
      const map = JSON.parse(readFileSync(join(maps, name), 'utf8')) as { id: string; title: string; projectId?: string; updatedAt: number; status?: string; nodes?: Array<{ text: string }> }
      if (map.status === 'trashed') continue
      recovered.push({ id: `knowledge:${map.id}`, kind: 'knowledge', title: map.title, text: map.nodes?.map(n => n.text).join('\n') ?? '', updatedAt: map.updatedAt, workspaceId, projectId: map.projectId })
    }
    store.entries = [...store.entries.filter(entry => !(entry.kind === 'knowledge' || entry.kind === 'file')), ...recovered]
    write(root, store); return { ok: true, entries: recovered.length, recovered: true }
  } catch (error) { return { ok: false, entries: 0, recovered: false, error: error instanceof Error ? error.message : String(error) } }
}
