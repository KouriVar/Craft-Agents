/**
 * Guidance store — rebuildable json with dismissed-user protection.
 */

import { readFile } from 'fs/promises'
import { existsSync } from 'fs'
import { atomicWriteFileSync, stripBom } from '../../utils/files.ts'
import {
  ensureCognitionDir,
  getCognitionGuidancePath,
} from '../storage/cognition-storage.ts'
import { COGNITION_LIMITS } from '../types.ts'
import type { CognitionGuidance, CognitionGuidanceQuery } from './types.ts'

interface GuidanceFile {
  schemaVersion: number
  updatedAt: number
  items: CognitionGuidance[]
}

const mutexes = new Map<string, Promise<void>>()

function withMutex<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = mutexes.get(key) ?? Promise.resolve()
  const next = prev.then(fn, fn)
  mutexes.set(key, next.then(() => {}, () => {}))
  return next
}

function isDismissed(g: CognitionGuidance): boolean {
  return Boolean(g.dismissedAt) || Boolean(g.userManaged && g.dismissedAt)
}

export class GuidanceStore {
  constructor(readonly workspaceDataRoot: string) {}

  private path(): string {
    return getCognitionGuidancePath(this.workspaceDataRoot)
  }

  private async readFile(): Promise<GuidanceFile> {
    const path = this.path()
    if (!existsSync(path)) {
      return { schemaVersion: 1, updatedAt: Date.now(), items: [] }
    }
    try {
      const raw = JSON.parse(stripBom(await readFile(path, 'utf8'))) as Partial<GuidanceFile>
      return {
        schemaVersion: typeof raw.schemaVersion === 'number' ? raw.schemaVersion : 1,
        updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now(),
        items: Array.isArray(raw.items) ? raw.items : [],
      }
    } catch {
      throw new Error('Corrupt guidance.json')
    }
  }

  private writeFile(data: GuidanceFile): void {
    ensureCognitionDir(this.workspaceDataRoot)
    atomicWriteFileSync(this.path(), `${JSON.stringify(data, null, 2)}\n`)
  }

  async listGuidance(query: CognitionGuidanceQuery = {}): Promise<CognitionGuidance[]> {
    return withMutex(this.workspaceDataRoot, async () => {
      const file = await this.readFile()
      const includeDismissed = query.includeDismissed === true
      const limit = Math.min(
        Math.max(1, query.limit ?? COGNITION_LIMITS.defaultQueryLimit),
        COGNITION_LIMITS.maxQueryLimit,
      )
      const offset = Math.max(0, query.offset ?? 0)
      const filtered = file.items.filter((g) => {
        if (!includeDismissed && isDismissed(g)) return false
        if (query.types?.length && !query.types.includes(g.type)) return false
        if (query.sessionId && g.targetSessionId !== query.sessionId) return false
        if (query.projectId && g.projectId && g.projectId !== query.projectId) return false
        return true
      })
      return filtered
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || b.importance - a.importance || b.createdAt - a.createdAt)
        .slice(offset, offset + limit)
    })
  }

  /** Loop ids the user dismissed — refresh must not recreate. */
  async dismissedTargetLoopIds(): Promise<Set<string>> {
    return withMutex(this.workspaceDataRoot, async () => {
      const file = await this.readFile()
      const ids = new Set<string>()
      for (const g of file.items) {
        if (isDismissed(g) && g.targetLoopId) ids.add(g.targetLoopId)
      }
      return ids
    })
  }

  /**
   * Replace active guidance with rebuilt ranked items; preserve dismissed entries.
   */
  async replaceActive(items: CognitionGuidance[]): Promise<CognitionGuidance[]> {
    return withMutex(this.workspaceDataRoot, async () => {
      const file = await this.readFile()
      const dismissed = file.items.filter((g) => isDismissed(g))
      const next: GuidanceFile = {
        schemaVersion: 1,
        updatedAt: Date.now(),
        items: [...dismissed, ...items],
      }
      this.writeFile(next)
      return items
    })
  }

  async dismiss(guidanceId: string): Promise<CognitionGuidance | null> {
    return withMutex(this.workspaceDataRoot, async () => {
      const file = await this.readFile()
      const item = file.items.find((g) => g.id === guidanceId)
      if (!item) return null
      const now = Date.now()
      item.dismissedAt = now
      item.userManaged = true
      file.updatedAt = now
      this.writeFile(file)
      return item
    })
  }

  async clear(): Promise<void> {
    return withMutex(this.workspaceDataRoot, async () => {
      this.writeFile({ schemaVersion: 1, updatedAt: Date.now(), items: [] })
    })
  }
}
