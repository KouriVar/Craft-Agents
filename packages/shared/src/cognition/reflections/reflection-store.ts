/**
 * Reflection store — append-oriented jsonl; rebuildable derived data.
 */

import { appendFile, readFile, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import { stripBom } from '../../utils/files.ts'
import {
  ensureCognitionDir,
  getCognitionReflectionsPath,
} from '../storage/cognition-storage.ts'
import { COGNITION_LIMITS } from '../types.ts'
import type { CognitionReflection, CognitionReflectionQuery } from './types.ts'

const mutexes = new Map<string, Promise<void>>()

function withMutex<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = mutexes.get(key) ?? Promise.resolve()
  const next = prev.then(fn, fn)
  mutexes.set(key, next.then(() => {}, () => {}))
  return next
}

function scopeKey(r: CognitionReflection): string {
  if (r.type === 'daily') return `daily:${r.dayKey ?? r.createdAt}`
  return `task:${r.sessionId ?? r.id}`
}

export class ReflectionStore {
  constructor(readonly workspaceDataRoot: string) {}

  private path(): string {
    return getCognitionReflectionsPath(this.workspaceDataRoot)
  }

  private async readAll(): Promise<CognitionReflection[]> {
    const path = this.path()
    if (!existsSync(path)) return []
    const text = stripBom(await readFile(path, 'utf8'))
    if (!text.trim()) return []
    const out: CognitionReflection[] = []
    const lines = text.split('\n')
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? ''
      if (!line.trim()) continue
      try {
        out.push(JSON.parse(line) as CognitionReflection)
      } catch {
        const isLast = lines.slice(i + 1).every((l) => !l.trim())
        if (isLast) break
        throw new Error(`Corrupt reflection at line ${i + 1}`)
      }
    }
    return out
  }

  async appendReflections(reflections: CognitionReflection[]): Promise<CognitionReflection[]> {
    if (!reflections.length) return []
    return withMutex(this.workspaceDataRoot, async () => {
      ensureCognitionDir(this.workspaceDataRoot)
      const body = reflections.map((r) => JSON.stringify(r)).join('\n') + '\n'
      await appendFile(this.path(), body, 'utf8')
      return reflections
    })
  }

  async listReflections(query: CognitionReflectionQuery = {}): Promise<CognitionReflection[]> {
    return withMutex(this.workspaceDataRoot, async () => {
      const all = await this.readAll()
      const limit = Math.min(
        Math.max(1, query.limit ?? COGNITION_LIMITS.defaultQueryLimit),
        COGNITION_LIMITS.maxQueryLimit,
      )
      const offset = Math.max(0, query.offset ?? 0)
      let filtered = all.filter((r) => {
        if (query.type && r.type !== query.type) return false
        if (query.sessionId && r.sessionId !== query.sessionId) return false
        if (query.projectId && r.projectId && r.projectId !== query.projectId) return false
        if (query.dayKey && r.dayKey !== query.dayKey) return false
        if (query.afterCreatedAt != null && r.createdAt <= query.afterCreatedAt) return false
        return true
      })

      if (query.latestOnly) {
        const best = new Map<string, CognitionReflection>()
        for (const r of filtered) {
          const key = scopeKey(r)
          const prev = best.get(key)
          if (!prev || r.createdAt >= prev.createdAt) best.set(key, r)
        }
        filtered = [...best.values()]
      }

      return filtered
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(offset, offset + limit)
    })
  }

  async clear(): Promise<void> {
    return withMutex(this.workspaceDataRoot, async () => {
      ensureCognitionDir(this.workspaceDataRoot)
      await writeFile(this.path(), '', 'utf8')
    })
  }
}
