/**
 * Cognition schema migrations (workspace-local).
 * v1 → v2: provenance sourceKinds fields (lazy/backfill; migration is a marker).
 */

import {
  createEmptyManifest,
  loadManifest,
  saveManifest,
} from './cognition-storage.ts'
import { COGNITION_SCHEMA_VERSION, type CognitionManifest } from '../types.ts'

type MigrationFn = (manifest: CognitionManifest, workspaceDataRoot: string) => CognitionManifest

const MIGRATIONS: Array<{ id: string; from: number; to: number; run: MigrationFn }> = [
  {
    id: 'cognition-1-to-2-source-kinds',
    from: 1,
    to: 2,
    run: (manifest) => {
      // Data backfill is lazy / background (see backfillSourceKindsLimited).
      // Migration only bumps schemaVersion so readers know v2 fields are expected.
      return {
        ...manifest,
        lastRepairNote: manifest.lastRepairNote
          ?? 'Marked cognition schema v2 (sourceKinds); entities backfilled lazily',
      }
    },
  },
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

  // Fresh installs: createEmptyManifest uses COGNITION_SCHEMA_VERSION already.
  if (manifest.schemaVersion < COGNITION_SCHEMA_VERSION) {
    // If somehow stuck below target without matching from=, jump carefully
    const pending = MIGRATIONS.find((m) => m.from === manifest.schemaVersion)
    if (!pending) {
      manifest = { ...manifest, schemaVersion: COGNITION_SCHEMA_VERSION }
    }
  }

  saveManifest(workspaceDataRoot, manifest)
  return manifest
}
