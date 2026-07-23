/**
 * Loop store — mutable loops.json with user-state protection.
 */

import { readFile } from 'fs/promises'
import { existsSync } from 'fs'
import { atomicWriteFileSync, stripBom } from '../../utils/files.ts'
import {
  ensureCognitionDir,
  getCognitionLoopsPath,
} from '../storage/cognition-storage.ts'
import { COGNITION_LIMITS } from '../types.ts'
import { isSimilarLoopTitle } from './loop-deduplicator.ts'
import type { CognitionLoop, CognitionLoopQuery, CognitionLoopStatus } from './types.ts'
import type { LoopDraft } from './loop-rules.ts'
import { materializeLoopDrafts } from './loop-rules.ts'

interface LoopsFile {
  schemaVersion: number
  updatedAt: number
  loops: CognitionLoop[]
}

const mutexes = new Map<string, Promise<void>>()

function withMutex<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = mutexes.get(key) ?? Promise.resolve()
  const next = prev.then(fn, fn)
  mutexes.set(key, next.then(() => {}, () => {}))
  return next
}

function isUserProtected(loop: CognitionLoop): boolean {
  return Boolean(loop.userManaged) || loop.status === 'resolved' || loop.status === 'dismissed'
}

export class LoopStore {
  constructor(readonly workspaceDataRoot: string) {}

  private path(): string {
    return getCognitionLoopsPath(this.workspaceDataRoot)
  }

  private async readFile(): Promise<LoopsFile> {
    const path = this.path()
    if (!existsSync(path)) {
      return { schemaVersion: 1, updatedAt: Date.now(), loops: [] }
    }
    try {
      const raw = JSON.parse(stripBom(await readFile(path, 'utf8'))) as Partial<LoopsFile>
      return {
        schemaVersion: typeof raw.schemaVersion === 'number' ? raw.schemaVersion : 1,
        updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now(),
        loops: Array.isArray(raw.loops) ? raw.loops : [],
      }
    } catch {
      throw new Error('Corrupt loops.json')
    }
  }

  private writeFile(data: LoopsFile): void {
    ensureCognitionDir(this.workspaceDataRoot)
    atomicWriteFileSync(this.path(), `${JSON.stringify(data, null, 2)}\n`)
  }

  async listLoops(query: CognitionLoopQuery = {}): Promise<CognitionLoop[]> {
    return withMutex(this.workspaceDataRoot, async () => {
      const file = await this.readFile()
      const includeResolved = query.includeResolved === true
      const limit = Math.min(
        Math.max(1, query.limit ?? COGNITION_LIMITS.defaultQueryLimit),
        COGNITION_LIMITS.maxQueryLimit,
      )
      const offset = Math.max(0, query.offset ?? 0)
      const filtered = file.loops.filter((loop) => {
        if (query.sessionId && loop.sessionId !== query.sessionId) return false
        if (query.projectId && loop.projectId !== query.projectId) return false
        if (query.statuses?.length && !query.statuses.includes(loop.status)) return false
        if (!includeResolved && !query.statuses && (loop.status === 'resolved' || loop.status === 'dismissed')) {
          return false
        }
        return true
      })
      return filtered
        .sort((a, b) => b.lastUpdatedAt - a.lastUpdatedAt)
        .slice(offset, offset + limit)
    })
  }

  /**
   * Upsert drafts: merge into similar open loops; never overwrite user-protected loops.
   */
  async upsertFromDrafts(drafts: LoopDraft[]): Promise<CognitionLoop[]> {
    if (!drafts.length) return []
    return withMutex(this.workspaceDataRoot, async () => {
      const file = await this.readFile()
      const now = Date.now()
      const changed: CognitionLoop[] = []

      for (const draft of drafts) {
        const match = file.loops.find((loop) => {
          if (isUserProtected(loop)) return false
          if (draft.sessionId && loop.sessionId && draft.sessionId !== loop.sessionId) return false
          if (draft.projectId && loop.projectId && draft.projectId !== loop.projectId) return false
          if (
            draft.evidenceFingerprint &&
            loop.evidenceFingerprint &&
            draft.evidenceFingerprint === loop.evidenceFingerprint
          ) {
            return true
          }
          return isSimilarLoopTitle(loop.title, draft.title)
        })

        if (match) {
          const obsIds = new Set([...match.observationIds, ...draft.observationIds])
          match.title = draft.title
          match.summary = draft.summary
          match.status = draft.status === 'stale' ? match.status : draft.status
          match.nextAction = draft.nextAction
          match.blocker = draft.blocker
          match.waitingFor = draft.waitingFor
          match.importance = Math.max(match.importance, draft.importance)
          match.confidence = Math.max(match.confidence, draft.confidence)
          match.observationIds = [...obsIds]
          match.evidenceRefs = [...draft.evidenceRefs].slice(0, 12)
          if (draft.evidenceFingerprint) match.evidenceFingerprint = draft.evidenceFingerprint
          match.lastUpdatedAt = now
          if (draft.projectId) match.projectId = draft.projectId
          changed.push(match)
        } else {
          // Do not create a new loop that duplicates a user-resolved/dismissed similar item
          const protectedSimilar = file.loops.find(
            (loop) =>
              isUserProtected(loop) &&
              (!draft.sessionId || !loop.sessionId || draft.sessionId === loop.sessionId) &&
              (
                (draft.evidenceFingerprint &&
                  loop.evidenceFingerprint &&
                  draft.evidenceFingerprint === loop.evidenceFingerprint) ||
                isSimilarLoopTitle(loop.title, draft.title)
              ),
          )
          if (protectedSimilar) continue

          const created = materializeLoopDrafts([draft], now)[0]!
          file.loops.push(created)
          changed.push(created)
        }
      }

      file.updatedAt = now
      this.writeFile(file)
      return changed
    })
  }

  async setLoopStatus(
    loopId: string,
    status: Extract<CognitionLoopStatus, 'resolved' | 'dismissed' | 'open' | 'stale'>,
  ): Promise<CognitionLoop | null> {
    return withMutex(this.workspaceDataRoot, async () => {
      const file = await this.readFile()
      const loop = file.loops.find((l) => l.id === loopId)
      if (!loop) return null
      const now = Date.now()
      loop.status = status
      if (status === 'resolved' || status === 'dismissed') {
        loop.userManaged = true
        loop.resolvedAt = now
      } else if (status === 'open') {
        loop.userManaged = true
        delete loop.resolvedAt
      } else {
        // stale: system transition — do not set userManaged
        delete loop.resolvedAt
      }
      loop.lastUpdatedAt = now
      file.updatedAt = now
      this.writeFile(file)
      return loop
    })
  }

  /** Mark idle open/waiting/blocked loops as stale (never deletes). */
  async markStaleLoops(options: { now?: number; staleAfterMs?: number } = {}): Promise<number> {
    const { findStaleLoopIds } = await import('./loop-stale-scanner.ts')
    return withMutex(this.workspaceDataRoot, async () => {
      const file = await this.readFile()
      const ids = new Set(findStaleLoopIds(file.loops, options.now, options.staleAfterMs))
      if (!ids.size) return 0
      const now = options.now ?? Date.now()
      let count = 0
      for (const loop of file.loops) {
        if (!ids.has(loop.id)) continue
        loop.status = 'stale'
        loop.lastUpdatedAt = now
        count += 1
      }
      if (count) {
        file.updatedAt = now
        this.writeFile(file)
      }
      return count
    })
  }

  async clear(options: { keepUserManaged?: boolean } = {}): Promise<void> {
    return withMutex(this.workspaceDataRoot, async () => {
      const keep = options.keepUserManaged !== false
      if (!keep) {
        this.writeFile({ schemaVersion: 1, updatedAt: Date.now(), loops: [] })
        return
      }
      const file = await this.readFile()
      const kept = file.loops.filter((l) => isUserProtected(l))
      this.writeFile({ schemaVersion: 1, updatedAt: Date.now(), loops: kept })
    })
  }

  /** Sync helper for tests */
  async replaceAll(loops: CognitionLoop[]): Promise<void> {
    return withMutex(this.workspaceDataRoot, async () => {
      this.writeFile({ schemaVersion: 1, updatedAt: Date.now(), loops })
    })
  }
}
