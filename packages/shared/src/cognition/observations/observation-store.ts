/**
 * Observation store — append-oriented jsonl under workspaceDataRoot/cognition/.
 * Observations are rebuildable derived data.
 */

import { appendFile, readFile, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import { stripBom } from '../../utils/files.ts'
import {
  ensureCognitionDir,
  getCognitionObservationsPath,
} from '../storage/cognition-storage.ts'
import { COGNITION_LIMITS } from '../types.ts'
import type { CognitionObservation, CognitionObservationQuery } from './types.ts'

const mutexes = new Map<string, Promise<void>>()

function withMutex<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = mutexes.get(key) ?? Promise.resolve()
  const next = prev.then(fn, fn)
  mutexes.set(key, next.then(() => {}, () => {}))
  return next
}

export class ObservationStore {
  constructor(readonly workspaceDataRoot: string) {}

  private path(): string {
    return getCognitionObservationsPath(this.workspaceDataRoot)
  }

  private async readAll(): Promise<CognitionObservation[]> {
    const path = this.path()
    if (!existsSync(path)) return []
    const text = stripBom(await readFile(path, 'utf8'))
    if (!text.trim()) return []
    const out: CognitionObservation[] = []
    const lines = text.split('\n')
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? ''
      if (!line.trim()) continue
      try {
        out.push(JSON.parse(line) as CognitionObservation)
      } catch {
        const isLast = lines.slice(i + 1).every((l) => !l.trim())
        if (isLast) break
        throw new Error(`Corrupt observation at line ${i + 1}`)
      }
    }
    return out
  }

  async appendObservations(observations: CognitionObservation[]): Promise<CognitionObservation[]> {
    if (!observations.length) return []
    return withMutex(this.workspaceDataRoot, async () => {
      ensureCognitionDir(this.workspaceDataRoot)
      const existing = await this.readAll()
      const seenEventKeys = new Set(
        existing.flatMap((o) => o.sourceEventIds.map((id) => `${id}:${o.category}:${o.title}`)),
      )
      const accepted: CognitionObservation[] = []
      for (const obs of observations) {
        const key = `${obs.sourceEventIds[0] ?? obs.id}:${obs.category}:${obs.title}`
        if (seenEventKeys.has(key)) continue
        seenEventKeys.add(key)
        accepted.push(obs)
      }
      if (!accepted.length) return []
      const body = accepted.map((o) => JSON.stringify(o)).join('\n') + '\n'
      await appendFile(this.path(), body, 'utf8')
      return accepted
    })
  }

  async listObservations(query: CognitionObservationQuery = {}): Promise<CognitionObservation[]> {
    return withMutex(this.workspaceDataRoot, async () => {
      const all = await this.readAll()
      const limit = Math.min(
        Math.max(1, query.limit ?? COGNITION_LIMITS.defaultQueryLimit),
        COGNITION_LIMITS.maxQueryLimit,
      )
      const offset = Math.max(0, query.offset ?? 0)
      const filtered = all.filter((o) => {
        if (query.sessionId && o.sessionId !== query.sessionId) return false
        if (query.projectId && o.projectId !== query.projectId) return false
        if (query.categories?.length && !query.categories.includes(o.category)) return false
        if (query.afterCreatedAt != null && o.createdAt <= query.afterCreatedAt) return false
        return true
      })
      return filtered.slice(offset, offset + limit)
    })
  }

  async clear(): Promise<void> {
    return withMutex(this.workspaceDataRoot, async () => {
      ensureCognitionDir(this.workspaceDataRoot)
      await writeFile(this.path(), '', 'utf8')
    })
  }
}
