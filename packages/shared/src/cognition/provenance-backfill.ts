/**
 * Lazy v1→v2 sourceKinds / sourceEventIds backfill.
 * Fail-soft: never throws to callers for corrupt lines; limited batch size.
 */

import { existsSync, readFileSync } from 'fs'
import { atomicWriteFileSync, stripBom } from '../utils/files.ts'
import {
  getCognitionEventsPath,
  getCognitionGuidancePath,
  getCognitionLoopsPath,
  getCognitionObservationsPath,
  getCognitionReflectionsPath,
  ensureCognitionDir,
} from './storage/cognition-storage.ts'
import type { CognitionEvent, CognitionEventSource } from './types.ts'
import { uniqueSourceKinds, uniqueStrings } from '../privacy/provenance.ts'

export interface BackfillSourceKindsOptions {
  /** Max entities to rewrite in one pass (across all stores). */
  maxEntities?: number
}

function loadEventSourceIndex(workspaceDataRoot: string): Map<string, CognitionEventSource> {
  const path = getCognitionEventsPath(workspaceDataRoot)
  const map = new Map<string, CognitionEventSource>()
  if (!existsSync(path)) return map
  try {
    const text = stripBom(readFileSync(path, 'utf8'))
    for (const line of text.split('\n')) {
      if (!line.trim()) continue
      try {
        const event = JSON.parse(line) as CognitionEvent
        if (event?.id && event.source) map.set(event.id, event.source)
      } catch {
        /* skip corrupt */
      }
    }
  } catch {
    /* ignore */
  }
  return map
}

function kindsFromEventIds(
  ids: string[] | undefined,
  index: Map<string, CognitionEventSource>,
): Array<CognitionEventSource | 'unknown'> {
  if (!ids?.length) return ['unknown']
  const kinds: CognitionEventSource[] = []
  for (const id of ids) {
    const src = index.get(id)
    if (src) kinds.push(src)
  }
  return kinds.length ? uniqueSourceKinds(kinds) : ['unknown']
}

function readJsonlObjects(path: string): Array<Record<string, unknown>> {
  if (!existsSync(path)) return []
  const out: Array<Record<string, unknown>> = []
  try {
    const text = stripBom(readFileSync(path, 'utf8'))
    for (const line of text.split('\n')) {
      if (!line.trim()) continue
      try {
        out.push(JSON.parse(line) as Record<string, unknown>)
      } catch {
        /* skip */
      }
    }
  } catch {
    /* ignore */
  }
  return out
}

/**
 * Backfill missing sourceKinds on Observation / Loop / Reflection / Guidance.
 * Returns number of entities updated.
 */
export async function backfillSourceKindsLimited(
  workspaceDataRoot: string,
  options: BackfillSourceKindsOptions = {},
): Promise<number> {
  const maxEntities = Math.max(1, options.maxEntities ?? 200)
  let updated = 0
  const eventIndex = loadEventSourceIndex(workspaceDataRoot)
  ensureCognitionDir(workspaceDataRoot)

  // Observations (jsonl)
  {
    const path = getCognitionObservationsPath(workspaceDataRoot)
    const rows = readJsonlObjects(path)
    let changed = false
    for (const row of rows) {
      if (updated >= maxEntities) break
      if (Array.isArray(row.sourceKinds) && row.sourceKinds.length) continue
      const ids = Array.isArray(row.sourceEventIds) ? (row.sourceEventIds as string[]) : []
      row.sourceKinds = kindsFromEventIds(ids, eventIndex)
      if (!Array.isArray(row.sourceEventIds)) row.sourceEventIds = ids
      updated += 1
      changed = true
    }
    if (changed) {
      const body = rows.map((r) => JSON.stringify(r)).join('\n')
      atomicWriteFileSync(path, body ? `${body}\n` : '')
    }
  }

  // Loops (json)
  {
    const path = getCognitionLoopsPath(workspaceDataRoot)
    if (existsSync(path)) {
      try {
        const file = JSON.parse(stripBom(readFileSync(path, 'utf8'))) as {
          schemaVersion?: number
          updatedAt?: number
          loops?: Array<Record<string, unknown>>
        }
        const loops = Array.isArray(file.loops) ? file.loops : []
        let changed = false
        for (const loop of loops) {
          if (updated >= maxEntities) break
          if (Array.isArray(loop.sourceKinds) && loop.sourceKinds.length) continue
          const ids = Array.isArray(loop.sourceEventIds)
            ? (loop.sourceEventIds as string[])
            : []
          loop.sourceKinds = kindsFromEventIds(ids, eventIndex)
          if (!Array.isArray(loop.sourceEventIds)) loop.sourceEventIds = ids
          updated += 1
          changed = true
        }
        if (changed) {
          atomicWriteFileSync(
            path,
            `${JSON.stringify({ ...file, loops, updatedAt: Date.now() }, null, 2)}\n`,
          )
        }
      } catch {
        /* corrupt — skip */
      }
    }
  }

  // Reflections (jsonl)
  {
    const path = getCognitionReflectionsPath(workspaceDataRoot)
    const rows = readJsonlObjects(path)
    let changed = false
    for (const row of rows) {
      if (updated >= maxEntities) break
      if (Array.isArray(row.sourceKinds) && row.sourceKinds.length) continue
      const fromObs = Array.isArray(row.sourceObservationIds)
        ? (row.sourceObservationIds as string[])
        : []
      const fromLoops = Array.isArray(row.sourceLoopIds) ? (row.sourceLoopIds as string[]) : []
      const ids = Array.isArray(row.sourceEventIds) ? (row.sourceEventIds as string[]) : []
      if (ids.length) {
        row.sourceKinds = kindsFromEventIds(ids, eventIndex)
      } else if (fromObs.length || fromLoops.length) {
        row.sourceKinds = ['unknown']
        row.sourceEventIds = uniqueStrings([...fromObs, ...fromLoops].map(String))
      } else {
        row.sourceKinds = ['unknown']
        row.sourceEventIds = []
      }
      updated += 1
      changed = true
    }
    if (changed) {
      const body = rows.map((r) => JSON.stringify(r)).join('\n')
      atomicWriteFileSync(path, body ? `${body}\n` : '')
    }
  }

  // Guidance (json)
  {
    const path = getCognitionGuidancePath(workspaceDataRoot)
    if (existsSync(path)) {
      try {
        const file = JSON.parse(stripBom(readFileSync(path, 'utf8'))) as {
          schemaVersion?: number
          updatedAt?: number
          items?: Array<Record<string, unknown>>
        }
        const items = Array.isArray(file.items) ? file.items : []
        let changed = false
        for (const item of items) {
          if (updated >= maxEntities) break
          if (Array.isArray(item.sourceKinds) && item.sourceKinds.length) continue
          const ids = Array.isArray(item.sourceEventIds) ? (item.sourceEventIds as string[]) : []
          if (ids.length) {
            item.sourceKinds = kindsFromEventIds(ids, eventIndex)
          } else {
            item.sourceKinds = ['unknown']
            item.sourceEventIds = ids
          }
          updated += 1
          changed = true
        }
        if (changed) {
          atomicWriteFileSync(
            path,
            `${JSON.stringify({ ...file, items, updatedAt: Date.now() }, null, 2)}\n`,
          )
        }
      } catch {
        /* skip */
      }
    }
  }

  return updated
}
