/**
 * Append-only Cognition Event Store (workspace-scoped).
 *
 * - Serializes writes per workspaceDataRoot via promise mutex
 * - One JSON object per line, each line ends with `\n`
 * - Idempotency via idempotencyKey
 * - Callers never supply sequence / id
 */

import { appendFile, readFile, writeFile } from 'fs/promises'
import { existsSync, readFileSync } from 'fs'
import { randomUUID } from 'crypto'
import { createLogger } from '../../utils/debug.ts'
import { stripBom } from '../../utils/files.ts'
import {
  sanitizeCognitionEventInput,
  CognitionSanitizeError,
} from '../events/event-sanitizer.ts'
import {
  createEmptyManifest,
  ensureCognitionDir,
  getCognitionEventsPath,
  loadManifest,
  rebuildManifestFromEvents,
  saveManifest,
} from '../storage/cognition-storage.ts'
import { ensureCognitionMigrations } from '../storage/migrations.ts'
import {
  COGNITION_LIMITS,
  COGNITION_SCHEMA_VERSION,
  type AppendCognitionEventResult,
  type CognitionEvent,
  type CognitionEventInput,
  type CognitionEventQuery,
  type CognitionManifest,
  type CognitionStoreStatus,
} from '../types.ts'

const log = createLogger('cognition-event-store')

const mutexes = new Map<string, Promise<void>>()

function withMutex<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = mutexes.get(key) ?? Promise.resolve()
  const next = prev.then(fn, fn)
  mutexes.set(key, next.then(() => {}, () => {}))
  return next
}

export function generateCognitionEventId(): string {
  return `cog_${randomUUID()}`
}

export interface CognitionEventStoreOptions {
  /** CA-managed workspace data root — NOT user project cwd. */
  workspaceDataRoot: string
}

export class CognitionEventStore {
  readonly workspaceDataRoot: string
  private idempotencyIndex: Map<string, CognitionEvent> | null = null

  constructor(options: CognitionEventStoreOptions) {
    this.workspaceDataRoot = options.workspaceDataRoot
  }

  private eventsPath(): string {
    return getCognitionEventsPath(this.workspaceDataRoot)
  }

  private ensureReady(): CognitionManifest {
    ensureCognitionDir(this.workspaceDataRoot)
    return ensureCognitionMigrations(this.workspaceDataRoot)
  }

  private async loadIdempotencyIndex(): Promise<Map<string, CognitionEvent>> {
    if (this.idempotencyIndex) return this.idempotencyIndex
    const { events } = await this.readAllEventsInternal()
    const map = new Map<string, CognitionEvent>()
    for (const event of events) {
      if (event.idempotencyKey) map.set(event.idempotencyKey, event)
    }
    this.idempotencyIndex = map
    return map
  }

  /**
   * Read all valid events. Trailing corrupt line → ignored + note.
   * Mid-file corrupt line → throws.
   */
  private async readAllEventsInternal(): Promise<{
    events: CognitionEvent[]
    trailingCorrupt: boolean
    repairNote?: string
  }> {
    const path = this.eventsPath()
    if (!existsSync(path)) return { events: [], trailingCorrupt: false }

    const text = stripBom(await readFile(path, 'utf8'))
    if (!text.trim()) return { events: [], trailingCorrupt: false }

    const lines = text.split('\n')
    const events: CognitionEvent[] = []
    let trailingCorrupt = false
    let repairNote: string | undefined

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? ''
      if (!line.trim()) continue
      try {
        const parsed = JSON.parse(line) as CognitionEvent
        if (typeof parsed.sequence !== 'number' || typeof parsed.id !== 'string') {
          throw new Error('missing sequence/id')
        }
        events.push(parsed)
      } catch (err) {
        const isLastNonEmpty = lines.slice(i + 1).every((l) => !l.trim())
        if (isLastNonEmpty) {
          trailingCorrupt = true
          repairNote = `Ignored corrupt trailing line ${i + 1}: ${err instanceof Error ? err.message : String(err)}`
          break
        }
        throw new Error(
          `Corrupt cognition event at line ${i + 1}: ${err instanceof Error ? err.message : String(err)}`,
        )
      }
    }

    events.sort((a, b) => a.sequence - b.sequence)
    return { events, trailingCorrupt, repairNote }
  }

  async appendEvent(input: CognitionEventInput): Promise<AppendCognitionEventResult> {
    return withMutex(this.workspaceDataRoot, async () => {
      this.ensureReady()
      const sanitized = sanitizeCognitionEventInput(input, {
        workspaceDataRoot: this.workspaceDataRoot,
      })

      const index = await this.loadIdempotencyIndex()
      if (sanitized.idempotencyKey) {
        const existing = index.get(sanitized.idempotencyKey)
        if (existing) return { status: 'deduplicated', event: existing }
      }

      let manifest = loadManifest(this.workspaceDataRoot) ?? createEmptyManifest()
      const event = {
        ...sanitized,
        id: generateCognitionEventId(),
        sequence: manifest.nextSequence,
        schemaVersion: COGNITION_SCHEMA_VERSION,
      } as CognitionEvent

      const line = `${JSON.stringify(event)}\n`
      if (Buffer.byteLength(line, 'utf8') > COGNITION_LIMITS.maxEventBytes + 64) {
        throw new CognitionSanitizeError('Serialized event line exceeds size limit')
      }

      ensureCognitionDir(this.workspaceDataRoot)
      await appendFile(this.eventsPath(), line, 'utf8')

      // Update manifest only after successful append
      manifest = {
        ...manifest,
        nextSequence: event.sequence + 1,
        eventCount: (manifest.eventCount ?? 0) + 1,
        lastEventAt: event.timestamp,
        updatedAt: Date.now(),
      }
      saveManifest(this.workspaceDataRoot, manifest)

      if (event.idempotencyKey) index.set(event.idempotencyKey, event)
      return { status: 'appended', event }
    })
  }

  async appendEvents(inputs: CognitionEventInput[]): Promise<AppendCognitionEventResult[]> {
    const results: AppendCognitionEventResult[] = []
    for (const input of inputs) {
      results.push(await this.appendEvent(input))
    }
    return results
  }

  async listEvents(query: CognitionEventQuery = {}): Promise<CognitionEvent[]> {
    return withMutex(this.workspaceDataRoot, async () => {
      this.ensureReady()
      const { events, trailingCorrupt, repairNote } = await this.readAllEventsInternal()
      if (trailingCorrupt && repairNote) {
        const manifest = loadManifest(this.workspaceDataRoot) ?? createEmptyManifest()
        if (manifest.lastRepairNote !== repairNote) {
          saveManifest(this.workspaceDataRoot, { ...manifest, lastRepairNote: repairNote })
        }
      }

      const limit = Math.min(
        Math.max(1, query.limit ?? COGNITION_LIMITS.defaultQueryLimit),
        COGNITION_LIMITS.maxQueryLimit,
      )
      const offset = Math.max(0, query.offset ?? 0)

      const filtered = events.filter((event) => {
        if (query.afterSequence != null && event.sequence <= query.afterSequence) return false
        if (query.beforeSequence != null && event.sequence >= query.beforeSequence) return false
        if (query.workspaceId && event.workspaceId !== query.workspaceId) return false
        if (query.projectId && event.projectId !== query.projectId) return false
        if (query.sessionId && event.sessionId !== query.sessionId) return false
        if (query.subject) {
          if (!event.subject) return false
          if (event.subject.kind !== query.subject.kind || event.subject.id !== query.subject.id) {
            return false
          }
        }
        if (query.types?.length && !query.types.includes(event.type)) return false
        if (query.fromTimestamp != null && event.timestamp < query.fromTimestamp) return false
        if (query.toTimestamp != null && event.timestamp > query.toTimestamp) return false
        return true
      })

      return filtered.slice(offset, offset + limit)
    })
  }

  async getEvent(idOrSequence: string | number): Promise<CognitionEvent | null> {
    return withMutex(this.workspaceDataRoot, async () => {
      this.ensureReady()
      const { events: all } = await this.readAllEventsInternal()
      if (typeof idOrSequence === 'number') {
        return all.find((e) => e.sequence === idOrSequence) ?? null
      }
      return all.find((e) => e.id === idOrSequence) ?? null
    })
  }

  async getStatus(): Promise<CognitionStoreStatus> {
    return withMutex(this.workspaceDataRoot, async () => {
      const manifest = this.ensureReady()
      return {
        schemaVersion: manifest.schemaVersion,
        eventCount: manifest.eventCount ?? 0,
        nextSequence: manifest.nextSequence,
        lastProcessedSequence: manifest.lastProcessedSequence,
        lastEventAt: manifest.lastEventAt,
        lastProcessedEventId: manifest.lastProcessedEventId,
        migrationsApplied: [...manifest.migrationsApplied],
        lastRepairNote: manifest.lastRepairNote,
      }
    })
  }

  async clearEvents(): Promise<void> {
    return withMutex(this.workspaceDataRoot, async () => {
      ensureCognitionDir(this.workspaceDataRoot)
      const path = this.eventsPath()
      await writeFile(path, '', 'utf8')
      this.idempotencyIndex = new Map()
      const previous = loadManifest(this.workspaceDataRoot)
      const manifest = createEmptyManifest()
      if (previous) {
        manifest.createdAt = previous.createdAt
        manifest.migrationsApplied = [...previous.migrationsApplied]
        // Cursor resets on clear — derived data would be rebuilt later
        manifest.lastProcessedSequence = 0
        manifest.lastProcessedEventId = undefined
      }
      saveManifest(this.workspaceDataRoot, manifest)
    })
  }

  async repairStore(): Promise<CognitionStoreStatus> {
    return withMutex(this.workspaceDataRoot, async () => {
      ensureCognitionDir(this.workspaceDataRoot)
      const previous = loadManifest(this.workspaceDataRoot)
      const { events, trailingCorrupt, repairNote } = await this.readAllEventsInternal()

      if (trailingCorrupt) {
        // Rewrite file without the corrupt trailing line
        const body = events.map((e) => JSON.stringify(e)).join('\n')
        await writeFile(this.eventsPath(), body ? `${body}\n` : '', 'utf8')
      }

      this.idempotencyIndex = null
      let rebuilt = rebuildManifestFromEvents(this.workspaceDataRoot, {
        preserveCursor: true,
        previous,
      })
      if (repairNote) {
        rebuilt = { ...rebuilt, lastRepairNote: repairNote }
        saveManifest(this.workspaceDataRoot, rebuilt)
      }
      log.info('Cognition store repaired', {
        eventCount: rebuilt.eventCount,
        trailingCorrupt,
      })
      return this.getStatusUnlocked(rebuilt)
    })
  }

  private getStatusUnlocked(manifest: CognitionManifest): CognitionStoreStatus {
    return {
      schemaVersion: manifest.schemaVersion,
      eventCount: manifest.eventCount ?? 0,
      nextSequence: manifest.nextSequence,
      lastProcessedSequence: manifest.lastProcessedSequence,
      lastEventAt: manifest.lastEventAt,
      lastProcessedEventId: manifest.lastProcessedEventId,
      migrationsApplied: [...manifest.migrationsApplied],
      lastRepairNote: manifest.lastRepairNote,
    }
  }

  /** Sync helper for diagnostics — prefer async APIs. */
  peekEventsSync(): CognitionEvent[] {
    const path = this.eventsPath()
    if (!existsSync(path)) return []
    const text = stripBom(readFileSync(path, 'utf8'))
    const events: CognitionEvent[] = []
    for (const line of text.split('\n')) {
      if (!line.trim()) continue
      try {
        events.push(JSON.parse(line) as CognitionEvent)
      } catch {
        break
      }
    }
    return events.sort((a, b) => a.sequence - b.sequence)
  }
}

/**
 * Detect session.started events that have no matching session.stopped
 * with the same correlationId. Phase 2: detect only (no auto-compensate).
 */
export function findOpenSessionStarts(events: CognitionEvent[]): CognitionEvent[] {
  const stoppedCorrelation = new Set<string>()
  for (const event of events) {
    if (event.type === 'session.stopped' && event.correlationId) {
      stoppedCorrelation.add(event.correlationId)
    }
  }
  return events.filter(
    (event) =>
      event.type === 'session.started' &&
      event.correlationId &&
      !stoppedCorrelation.has(event.correlationId),
  )
}
