/**
 * Today product state — snooze + completeAndArchive idempotency.
 * Independent of task reminders, Guidance dismissedAt, and Loop dismiss/resolve.
 */

import { existsSync, mkdirSync, readFileSync } from 'fs'
import { dirname, join } from 'path'
import { atomicWriteFileSync } from '@craft-agent/shared/utils'
import type {
  CompleteAndArchiveResponse,
  TodaySnoozeDto,
  TodayStateDto,
} from '@craft-agent/shared/protocol'

const FILE_NAME = 'today-state.json'

export interface TodayStateFile {
  schemaVersion: 1
  snoozes: TodaySnoozeDto[]
  completeAndArchiveIdempotency?: Record<string, CompleteAndArchiveResponse>
}

function emptyState(): TodayStateFile {
  return { schemaVersion: 1, snoozes: [], completeAndArchiveIdempotency: {} }
}

function isActiveSnooze(item: TodaySnoozeDto, now: number): boolean {
  if (item.until === null) return true
  return item.until > now
}

export class TodayStateStore {
  readonly path: string

  constructor(workspaceDataRoot: string) {
    this.path = join(workspaceDataRoot, FILE_NAME)
  }

  read(): TodayStateFile {
    try {
      if (!existsSync(this.path)) return emptyState()
      const raw = JSON.parse(readFileSync(this.path, 'utf8')) as Partial<TodayStateFile>
      if (!raw || typeof raw !== 'object') return emptyState()
      const snoozes = Array.isArray(raw.snoozes)
        ? raw.snoozes.filter((item): item is TodaySnoozeDto => (
          Boolean(item)
          && item.schemaVersion === 1
          && typeof item.targetKey === 'string'
          && item.targetKey.length > 0
          && (item.until === null || typeof item.until === 'number')
          && typeof item.createdAt === 'number'
          && item.source === 'user'
        ))
        : []
      const idem = raw.completeAndArchiveIdempotency && typeof raw.completeAndArchiveIdempotency === 'object'
        ? raw.completeAndArchiveIdempotency
        : {}
      return { schemaVersion: 1, snoozes, completeAndArchiveIdempotency: idem }
    } catch {
      return emptyState()
    }
  }

  write(state: TodayStateFile): void {
    const dir = dirname(this.path)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    atomicWriteFileSync(this.path, `${JSON.stringify(state, null, 2)}\n`)
  }

  getStateDto(now = Date.now()): TodayStateDto {
    const state = this.read()
    return {
      schemaVersion: 1,
      snoozes: state.snoozes.filter((item) => isActiveSnooze(item, now)),
    }
  }

  /** Active snooze target keys (until=null or until > now). */
  activeSnoozeKeys(now = Date.now()): Set<string> {
    return new Set(this.getStateDto(now).snoozes.map((item) => item.targetKey))
  }

  snooze(targetKey: string, until: number | null, now = Date.now()): TodayStateDto {
    const state = this.read()
    const next: TodaySnoozeDto = {
      schemaVersion: 1,
      targetKey,
      until,
      createdAt: now,
      source: 'user',
    }
    state.snoozes = [
      ...state.snoozes.filter((item) => item.targetKey !== targetKey),
      next,
    ]
    this.write(state)
    return this.getStateDto(now)
  }

  clearSnooze(targetKey: string, now = Date.now()): TodayStateDto {
    const state = this.read()
    state.snoozes = state.snoozes.filter((item) => item.targetKey !== targetKey)
    this.write(state)
    return this.getStateDto(now)
  }

  clearSnoozesMatching(predicate: (targetKey: string) => boolean, now = Date.now()): void {
    const state = this.read()
    const before = state.snoozes.length
    state.snoozes = state.snoozes.filter((item) => !predicate(item.targetKey))
    if (state.snoozes.length !== before) this.write(state)
  }

  getIdempotency(key: string): CompleteAndArchiveResponse | undefined {
    return this.read().completeAndArchiveIdempotency?.[key]
  }

  setIdempotency(key: string, response: CompleteAndArchiveResponse): void {
    const state = this.read()
    const map = { ...(state.completeAndArchiveIdempotency ?? {}) }
    map[key] = response
    // Bound growth
    const keys = Object.keys(map)
    if (keys.length > 200) {
      for (const old of keys.slice(0, keys.length - 200)) delete map[old]
    }
    state.completeAndArchiveIdempotency = map
    this.write(state)
  }
}

export function getTodayStateStore(workspaceDataRoot: string): TodayStateStore {
  return new TodayStateStore(workspaceDataRoot)
}
