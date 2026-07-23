/**
 * Cognition schema migrations (workspace-local).
 * Phase 2 ships schemaVersion 1 with no upgrade steps yet.
 */

import {
  createEmptyManifest,
  loadManifest,
  saveManifest,
} from './cognition-storage.ts'
import { COGNITION_SCHEMA_VERSION, type CognitionManifest } from '../types.ts'

type MigrationFn = (manifest: CognitionManifest, workspaceDataRoot: string) => CognitionManifest

const MIGRATIONS: Array<{ id: string; from: number; to: number; run: MigrationFn }> = [
  // Future: { id: 'cognition-1-to-2', from: 1, to: 2, run: ... }
]

export function ensureCognitionMigrations(workspaceDataRoot: string): CognitionManifest {
  let manifest = loadManifest(workspaceDataRoot) ?? createEmptyManifest()
  const applied = new Set(manifest.migrationsApplied)

  for (const migration of MIGRATIONS) {
    if (manifest.schemaVersion !== migration.from) continue
    if (applied.has(migration.id)) {
      manifest = { ...manifest, schemaVersion: migration.to }
      continue
    }
    manifest = migration.run(manifest, workspaceDataRoot)
    manifest = {
      ...manifest,
      schemaVersion: migration.to,
      migrationsApplied: [...manifest.migrationsApplied, migration.id],
    }
    applied.add(migration.id)
  }

  if (manifest.schemaVersion < COGNITION_SCHEMA_VERSION && MIGRATIONS.length === 0) {
    manifest = { ...manifest, schemaVersion: COGNITION_SCHEMA_VERSION }
  }

  saveManifest(workspaceDataRoot, manifest)
  return manifest
}
