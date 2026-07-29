import { join } from 'path'
import { randomUUID } from 'crypto'
import { readVersionedStore, writeVersionedStore } from '../migrations/versioned-json-store.ts'

export interface ExpertProfile {
  id: string
  name: string
  description?: string
  systemPrompt?: string
  model?: string
  connectionSlug?: string
  avatar?: string
  collaborationRule?: string
  connectorIds: string[]
  skillSlugs: string[]
  memoryRule?: 'inherit' | 'project-only' | 'none'
  createdAt: number
  updatedAt: number
}
export interface ExpertInput extends Omit<ExpertProfile, 'id' | 'createdAt' | 'updatedAt'> {}
export interface CapabilityAssignment { scope: 'global' | 'project' | 'expert'; scopeId?: string; skillSlugs: string[]; connectorIds: string[] }
interface Store { schemaVersion: 1; experts: ExpertProfile[]; assignments: CapabilityAssignment[] }
export const EXPERT_STORE_SCHEMA_VERSION = 1 as const
const storePath = (root: string) => join(root, 'experts', 'experts.json')
const read = (root: string): Store => readVersionedStore({
  filePath: storePath(root),
  displayName: '专家与能力分配',
  currentVersion: EXPERT_STORE_SCHEMA_VERSION,
  empty: () => ({ schemaVersion: 1, experts: [], assignments: [] }),
  validate: (value): value is Store => {
    const store = value as Partial<Store>
    return store.schemaVersion === 1 && Array.isArray(store.experts) && Array.isArray(store.assignments)
  },
})
const write = (root: string, store: Store): void => { writeVersionedStore(storePath(root), store) }
export function listExperts(root: string): ExpertProfile[] { return read(root).experts }
export function getExpert(root: string, id: string): ExpertProfile | null { return read(root).experts.find((x) => x.id === id) ?? null }
export function createExpert(root: string, input: ExpertInput): ExpertProfile { const store = read(root); const time = Date.now(); const expert = { ...input, id: `expert_${randomUUID().replace(/-/g, '').slice(0, 16)}`, createdAt: time, updatedAt: time }; store.experts.push(expert); write(root, store); return expert }
export function updateExpert(root: string, id: string, patch: Partial<ExpertInput>): ExpertProfile | null { const store = read(root); const expert = store.experts.find((x) => x.id === id); if (!expert) return null; Object.assign(expert, patch, { updatedAt: Date.now() }); write(root, store); return expert }
/** Copy never retains the source identity, so assignments and sessions cannot alias it. */
export function duplicateExpert(root: string, id: string, name?: string): ExpertProfile | null {
  const source = getExpert(root, id)
  if (!source) return null
  const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...input } = source
  return createExpert(root, { ...input, name: name?.trim() || `${source.name} Copy`, connectorIds: [...source.connectorIds], skillSlugs: [...source.skillSlugs] })
}
/** Invalid persisted ids intentionally degrade to the generic assistant. */
export function resolveExpert(root: string, id?: string | null): ExpertProfile | null {
  return id ? getExpert(root, id) : null
}
export function deleteExpert(root: string, id: string): boolean { const store = read(root); const before = store.experts.length; store.experts = store.experts.filter((x) => x.id !== id); store.assignments = store.assignments.filter((x) => !(x.scope === 'expert' && x.scopeId === id)); if (before === store.experts.length) return false; write(root, store); return true }
export function setCapabilityAssignment(root: string, assignment: CapabilityAssignment): void { const store = read(root); const key = `${assignment.scope}:${assignment.scopeId ?? ''}`; store.assignments = [...store.assignments.filter((x) => `${x.scope}:${x.scopeId ?? ''}` !== key), assignment]; write(root, store) }
export function getCapabilityAssignment(root: string, scope: CapabilityAssignment['scope'], scopeId?: string): CapabilityAssignment { return read(root).assignments.find((item) => item.scope === scope && item.scopeId === scopeId) ?? { scope, scopeId, skillSlugs: [], connectorIds: [] } }
export function resolveCapabilityAssignment(root: string, projectId?: string, expertId?: string): CapabilityAssignment { const entries = read(root).assignments; const selected = [entries.find((x) => x.scope === 'global'), projectId ? entries.find((x) => x.scope === 'project' && x.scopeId === projectId) : undefined, expertId ? entries.find((x) => x.scope === 'expert' && x.scopeId === expertId) : undefined].filter(Boolean) as CapabilityAssignment[]; return { scope: 'global', skillSlugs: [...new Set(selected.flatMap((x) => x.skillSlugs))], connectorIds: [...new Set(selected.flatMap((x) => x.connectorIds))] } }
