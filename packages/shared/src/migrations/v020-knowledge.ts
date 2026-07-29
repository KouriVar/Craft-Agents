import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync } from 'fs'
import { join } from 'path'

export const V020_KNOWLEDGE_MIGRATION_ID = 'v0.20.0.library-to-knowledge'

const BACKUP_DIR = 'library.v020-premerge-backup'
const DERIVED_FILES = new Set(['manifest.json', 'resources.index.json'])

function mergePreflight(source: string, destination: string, relativePath = ''): boolean {
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const rel = join(relativePath, entry.name)
    const from = join(source, entry.name)
    const to = join(destination, entry.name)
    if (!existsSync(to)) continue
    if (entry.isDirectory()) {
      if (!mergePreflight(from, to, rel)) return false
    } else if (entry.isFile() && !DERIVED_FILES.has(rel)) {
      if (!readFileSync(from).equals(readFileSync(to))) return false
    }
  }
  return true
}

function mergeTree(source: string, destination: string, relativePath = ''): void {
  mkdirSync(destination, { recursive: true })
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const rel = join(relativePath, entry.name)
    const from = join(source, entry.name)
    const to = join(destination, entry.name)
    if (entry.isDirectory()) mergeTree(from, to, rel)
    else if (entry.isFile() && (!existsSync(to) || !DERIVED_FILES.has(rel))) {
      if (!existsSync(to)) copyFileSync(from, to)
    }
  }
}

/**
 * Adopts legacy Library storage without deleting it. A dual-tree state is
 * merged only after collision preflight, then the old tree remains as a
 * recoverable adjacent backup. Re-running resumes or reports completion.
 */
export function migrateLibraryToKnowledge(workspaceRoot: string): 'migrated' | 'merged' | 'already_migrated' | 'nothing_to_migrate' | 'conflict' {
  const legacy = join(workspaceRoot, 'library')
  const knowledge = join(workspaceRoot, 'knowledge')
  const legacyBackup = join(workspaceRoot, BACKUP_DIR)
  const mergeSource = existsSync(legacy) ? legacy : existsSync(legacyBackup) ? legacyBackup : null
  if (existsSync(knowledge) && mergeSource) {
    if (!mergePreflight(mergeSource, knowledge)) return 'conflict'
    if (mergeSource === legacy) {
      if (existsSync(legacyBackup)) return 'conflict'
      renameSync(legacy, legacyBackup)
    }
    mergeTree(legacyBackup, knowledge)
    return 'merged'
  }
  if (existsSync(knowledge)) return 'already_migrated'
  if (!existsSync(legacy)) return 'nothing_to_migrate'
  renameSync(legacy, knowledge)
  return 'migrated'
}
