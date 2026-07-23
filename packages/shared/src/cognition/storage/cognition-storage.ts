/**
 * Cognition storage paths + manifest helpers.
 *
 * `workspaceDataRoot` = Craft Agents–managed workspace data root
 * (e.g. `~/.craft-agent/workspaces/<id>/`), NOT the user's project working directory.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'fs'
import { dirname, join, resolve, sep } from 'path'
import { atomicWriteFileSync, readJsonFileSync, stripBom } from '../../utils/files.ts'
import {
  COGNITION_SCHEMA_VERSION,
  type CognitionManifest,
} from '../types.ts'

export const COGNITION_DIR = 'cognition'
export const COGNITION_MANIFEST_FILE = 'manifest.json'
export const COGNITION_EVENTS_FILE = 'events.jsonl'
export const COGNITION_OBSERVATIONS_FILE = 'observations.jsonl'
export const COGNITION_LOOPS_FILE = 'loops.json'
export const COGNITION_REFLECTIONS_FILE = 'reflections.jsonl'
export const COGNITION_GUIDANCE_FILE = 'guidance.json'

/**
 * Resolve `<workspaceDataRoot>/cognition`, rejecting path escape.
 */
export function getCognitionDir(workspaceDataRoot: string): string {
  const root = resolve(workspaceDataRoot)
  const dir = resolve(root, COGNITION_DIR)
  if (dir !== root && !dir.startsWith(root + sep)) {
    throw new Error('Cognition path escapes workspaceDataRoot')
  }
  return dir
}

export function getCognitionManifestPath(workspaceDataRoot: string): string {
  return join(getCognitionDir(workspaceDataRoot), COGNITION_MANIFEST_FILE)
}

export function getCognitionEventsPath(workspaceDataRoot: string): string {
  return join(getCognitionDir(workspaceDataRoot), COGNITION_EVENTS_FILE)
}

export function getCognitionObservationsPath(workspaceDataRoot: string): string {
  return join(getCognitionDir(workspaceDataRoot), COGNITION_OBSERVATIONS_FILE)
}

export function getCognitionLoopsPath(workspaceDataRoot: string): string {
  return join(getCognitionDir(workspaceDataRoot), COGNITION_LOOPS_FILE)
}

export function getCognitionReflectionsPath(workspaceDataRoot: string): string {
  return join(getCognitionDir(workspaceDataRoot), COGNITION_REFLECTIONS_FILE)
}

export function getCognitionGuidancePath(workspaceDataRoot: string): string {
  return join(getCognitionDir(workspaceDataRoot), COGNITION_GUIDANCE_FILE)
}

export function ensureCognitionDir(workspaceDataRoot: string): string {
  const dir = getCognitionDir(workspaceDataRoot)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

export function createEmptyManifest(now = Date.now()): CognitionManifest {
  return {
    schemaVersion: COGNITION_SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
    nextSequence: 1,
    lastProcessedSequence: 0,
    migrationsApplied: [],
    eventCount: 0,
  }
}

export function loadManifest(workspaceDataRoot: string): CognitionManifest | null {
  const path = getCognitionManifestPath(workspaceDataRoot)
  if (!existsSync(path)) return null
  try {
    const raw = readJsonFileSync<Partial<CognitionManifest>>(path)
    if (!raw || typeof raw !== 'object') return null
    return {
      ...createEmptyManifest(),
      ...raw,
      schemaVersion: typeof raw.schemaVersion === 'number' ? raw.schemaVersion : COGNITION_SCHEMA_VERSION,
      nextSequence: typeof raw.nextSequence === 'number' && raw.nextSequence >= 1 ? raw.nextSequence : 1,
      lastProcessedSequence:
        typeof raw.lastProcessedSequence === 'number' && raw.lastProcessedSequence >= 0
          ? raw.lastProcessedSequence
          : 0,
      migrationsApplied: Array.isArray(raw.migrationsApplied) ? raw.migrationsApplied.map(String) : [],
    }
  } catch {
    return null
  }
}

export function saveManifest(workspaceDataRoot: string, manifest: CognitionManifest): void {
  ensureCognitionDir(workspaceDataRoot)
  const path = getCognitionManifestPath(workspaceDataRoot)
  const next: CognitionManifest = {
    ...manifest,
    updatedAt: Date.now(),
  }
  atomicWriteFileSync(path, `${JSON.stringify(next, null, 2)}\n`)
}

/**
 * Rebuild basic manifest fields by scanning events.jsonl.
 * Does not reset lastProcessed* (caller decides).
 */
export function rebuildManifestFromEvents(
  workspaceDataRoot: string,
  options: { preserveCursor?: boolean; previous?: CognitionManifest | null } = {},
): CognitionManifest {
  const eventsPath = getCognitionEventsPath(workspaceDataRoot)
  const previous = options.previous ?? loadManifest(workspaceDataRoot)
  const base = createEmptyManifest()
  if (options.preserveCursor && previous) {
    base.lastProcessedSequence = previous.lastProcessedSequence
    base.lastProcessedEventId = previous.lastProcessedEventId
    base.migrationsApplied = [...previous.migrationsApplied]
    base.createdAt = previous.createdAt
  }

  if (!existsSync(eventsPath)) {
    saveManifest(workspaceDataRoot, base)
    return base
  }

  const text = stripBom(readFileSync(eventsPath, 'utf8'))
  const lines = text.split('\n')
  let count = 0
  let maxSequence = 0
  let lastEventAt: number | undefined
  let trailingCorrupt = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    if (!line.trim()) continue
    try {
      const parsed = JSON.parse(line) as { sequence?: number; timestamp?: number }
      if (typeof parsed.sequence === 'number') maxSequence = Math.max(maxSequence, parsed.sequence)
      if (typeof parsed.timestamp === 'number') lastEventAt = parsed.timestamp
      count += 1
    } catch {
      const isLastNonEmpty = lines.slice(i + 1).every((l) => !l.trim())
      if (isLastNonEmpty) {
        trailingCorrupt = true
        break
      }
      throw new Error(`Corrupt cognition event at line ${i + 1}; cannot rebuild manifest`)
    }
  }

  const rebuilt: CognitionManifest = {
    ...base,
    nextSequence: maxSequence + 1,
    eventCount: count,
    lastEventAt,
    lastRepairNote: trailingCorrupt
      ? 'Ignored corrupt trailing line during manifest rebuild'
      : previous?.lastRepairNote,
  }
  saveManifest(workspaceDataRoot, rebuilt)
  return rebuilt
}

/** Ensure parent dir exists then write via temp+rename (same as atomicWriteFileSync). */
export function atomicWriteText(filePath: string, data: string): void {
  mkdirSync(dirname(filePath), { recursive: true })
  const tmpPath = `${filePath}.tmp`
  try {
    writeFileSync(tmpPath, data)
    renameSync(tmpPath, filePath)
  } catch (error) {
    try { unlinkSync(tmpPath) } catch { /* ignore */ }
    throw error
  }
}
