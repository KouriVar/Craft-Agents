/**
 * CognitionService — Event Ledger + Observation/Loop + Reflection/Guidance (Phase 4).
 *
 * - No React / Electron renderer / ClaudeAgent / PiAgent dependencies
 * - Fail-soft: append/process failures must not break the session path
 * - Rule-driven Reflection/Guidance (model runner reserved for title polish only)
 * - Does not mutate Task system or Today data structures
 */

import {
  CognitionEventStore,
  ObservationStore,
  LoopStore,
  ReflectionStore,
  GuidanceStore,
  buildCheckpointCreatedEvent,
  buildSessionCreatedEvent,
  buildSessionModelChangedEvent,
  buildSessionResumedEvent,
  buildSessionStartedEvent,
  buildSessionStoppedEvent,
  buildTaskDetailsUpdatedEvent,
  buildObservationsFromEvents,
  buildLoopDrafts,
  buildTaskReflection,
  buildDailyReflection,
  buildGuidanceFromLoops,
  findOpenSessionStarts,
  loadManifest,
  saveManifest,
  mapProcessingReasonToStopReason,
  newCognitionTurnId,
  newCorrelationId,
  backfillSourceKindsLimited,
  type AppendCognitionEventResult,
  type CognitionEvent,
  type CognitionEventInput,
  type CognitionEventQuery,
  type CognitionGuidance,
  type CognitionGuidanceQuery,
  type CognitionLoop,
  type CognitionLoopQuery,
  type CognitionModelRunner,
  type CognitionObservation,
  type CognitionObservationQuery,
  type CognitionReflection,
  type CognitionReflectionQuery,
  type CognitionStoreStatus,
  type SessionStopReason,
} from '@craft-agent/shared/cognition'
import { createLogger } from '@craft-agent/shared/utils'
import type { PrivacyPolicyGate } from '@craft-agent/shared/privacy'
import { isEntityReadableByPolicy, type ResolvedPrivacyPolicy } from '@craft-agent/shared/privacy'
import { getPrivacyService } from '../privacy/PrivacyService.ts'

const log = createLogger('cognition-service')

export interface CognitionServiceOptions {
  /** CA-managed workspace data root (NOT user project cwd). */
  workspaceDataRoot: string
  workspaceId?: string
  /** Reserved for title polish; rule generation works without it. */
  modelRunner?: CognitionModelRunner
  /** Injected privacy gate — store must not read preferences. */
  policyGate?: PrivacyPolicyGate
  /** Optional resolved-policy provider for read filtering. */
  getResolvedPolicy?: () => ResolvedPrivacyPolicy | null
}

export interface CognitionProcessResult {
  processedEvents: number
  observationsCreated: number
  loopsUpserted: number
  reflectionsCreated: number
  guidanceRebuilt: number
  lastProcessedSequence: number
}

export interface CognitionRefreshResult {
  dailyReflection: CognitionReflection | null
  taskReflections: CognitionReflection[]
  guidance: CognitionGuidance[]
}

export class CognitionService {
  readonly workspaceDataRoot: string
  readonly workspaceId?: string
  /** True when a PrivacyService-backed policyGate was injected. */
  readonly privacyWired: boolean
  private readonly store: CognitionEventStore
  private readonly observations: ObservationStore
  private readonly loops: LoopStore
  private readonly reflections: ReflectionStore
  private readonly guidance: GuidanceStore
  private readonly pending = new Set<Promise<unknown>>()
  private processChain: Promise<void> = Promise.resolve()
  private disposed = false
  readonly modelRunner?: CognitionModelRunner
  private readonly getResolvedPolicy?: () => ResolvedPrivacyPolicy | null
  private provenanceBackfillStarted = false

  constructor(options: CognitionServiceOptions) {
    this.workspaceDataRoot = options.workspaceDataRoot
    this.workspaceId = options.workspaceId
    this.modelRunner = options.modelRunner
    this.getResolvedPolicy = options.getResolvedPolicy
    this.privacyWired = Boolean(options.policyGate)
    this.store = new CognitionEventStore({
      workspaceDataRoot: options.workspaceDataRoot,
      policyGate: options.policyGate,
    })
    this.observations = new ObservationStore(options.workspaceDataRoot)
    this.loops = new LoopStore(options.workspaceDataRoot)
    this.reflections = new ReflectionStore(options.workspaceDataRoot)
    this.guidance = new GuidanceStore(options.workspaceDataRoot)
    this.scheduleSourceKindsBackfill()
  }

  private productPolicy(): ResolvedPrivacyPolicy | null {
    try {
      return this.getResolvedPolicy?.() ?? null
    } catch {
      return null
    }
  }

  private filterByPolicy<T extends { sourceKinds?: string[] }>(
    items: T[],
    options: { forToday?: boolean } = {},
  ): T[] {
    const policy = this.productPolicy()
    if (!policy) return items
    return items.filter((item) => isEntityReadableByPolicy(item, policy, options))
  }

  /** Product-path readability check for Debug markers. */
  isGuidanceReadableForProduct(entity: { sourceKinds?: string[] }): boolean {
    const policy = this.productPolicy()
    if (!policy) return true
    return isEntityReadableByPolicy(entity, policy, { forToday: false })
  }

  /**
   * Lazy v1→v2 provenance backfill. Non-blocking; failures never abort startup.
   * Rate-limited to avoid stalling the main process on large histories.
   */
  private scheduleSourceKindsBackfill(): void {
    if (this.provenanceBackfillStarted) return
    this.provenanceBackfillStarted = true
    const run = async () => {
      try {
        await backfillSourceKindsLimited(this.workspaceDataRoot, { maxEntities: 200 })
      } catch (error) {
        log.warn('sourceKinds backfill skipped/failed (non-fatal)', {
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
    // Defer so constructor / first RPC returns immediately
    setTimeout(() => {
      void this.track(run())
    }, 250)
  }

  private track<T>(promise: Promise<T>): Promise<T> {
    this.pending.add(promise)
    void promise.finally(() => this.pending.delete(promise))
    return promise
  }

  /**
   * Consume events after lastProcessedSequence → Observation → Loop → Reflection → Guidance.
   */
  async processUnprocessedEvents(): Promise<CognitionProcessResult> {
    if (this.disposed) throw new Error('CognitionService disposed')
    return this.track(this.runProcess())
  }

  private enqueueProcess(): void {
    this.processChain = this.processChain
      .then(() => this.runProcess())
      .then(() => {})
      .catch((err) => {
        log.warn('Cognition process failed (non-fatal)', {
          error: err instanceof Error ? err.message : String(err),
        })
      })
    void this.track(this.processChain)
  }

  private async runProcess(): Promise<CognitionProcessResult> {
    const policy = this.productPolicy()
    if (policy && (!policy.contextAwarenessEnabled || policy.effectivePrivacyModeActive)) {
      const afterSequence = loadManifest(this.workspaceDataRoot)?.lastProcessedSequence ?? 0
      return {
        processedEvents: 0,
        observationsCreated: 0,
        loopsUpserted: 0,
        reflectionsCreated: 0,
        guidanceRebuilt: 0,
        lastProcessedSequence: afterSequence,
      }
    }

    const manifest = loadManifest(this.workspaceDataRoot)
    const afterSequence = manifest?.lastProcessedSequence ?? 0
    const events = await this.store.listEvents({
      afterSequence,
      limit: 200,
    })
    if (!events.length) {
      return {
        processedEvents: 0,
        observationsCreated: 0,
        loopsUpserted: 0,
        reflectionsCreated: 0,
        guidanceRebuilt: 0,
        lastProcessedSequence: afterSequence,
      }
    }

    const built = buildObservationsFromEvents(events)
    const created = await this.observations.appendObservations(built)
    const drafts = buildLoopDrafts({ observations: created, events })
    const upserted = await this.loops.upsertFromDrafts(drafts)
    await this.loops.markStaleLoops().catch(() => 0)

    const sessionIds = new Set<string>()
    for (const e of events) if (e.sessionId) sessionIds.add(e.sessionId)
    for (const o of created) if (o.sessionId) sessionIds.add(o.sessionId)
    for (const l of upserted) if (l.sessionId) sessionIds.add(l.sessionId)

    const reflectionsCreated = await this.refreshTaskReflectionsForSessions([...sessionIds])
    const guidance = await this.rebuildGuidance()

    const last = events[events.length - 1]!
    const nextManifest = {
      ...(manifest ?? {
        schemaVersion: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        nextSequence: last.sequence + 1,
        lastProcessedSequence: 0,
        migrationsApplied: [] as string[],
      }),
      lastProcessedSequence: last.sequence,
      lastProcessedEventId: last.id,
      updatedAt: Date.now(),
    }
    saveManifest(this.workspaceDataRoot, nextManifest)

    return {
      processedEvents: events.length,
      observationsCreated: created.length,
      loopsUpserted: upserted.length,
      reflectionsCreated,
      guidanceRebuilt: guidance.length,
      lastProcessedSequence: last.sequence,
    }
  }

  private async refreshTaskReflectionsForSessions(sessionIds: string[]): Promise<number> {
    if (!sessionIds.length) return 0
    const [allObs, allLoops] = await Promise.all([
      this.observations.listObservations({ limit: 500 }),
      this.loops.listLoops({ includeResolved: true, limit: 500 }),
    ])
    const built: CognitionReflection[] = []
    for (const sessionId of sessionIds) {
      const reflection = buildTaskReflection({
        workspaceId: this.workspaceId,
        sessionId,
        observations: allObs.filter((o) => o.sessionId === sessionId),
        loops: allLoops.filter((l) => l.sessionId === sessionId),
      })
      if (reflection) built.push(reflection)
    }
    if (!built.length) return 0
    await this.reflections.appendReflections(built)
    return built.length
  }

  private async rebuildGuidance(): Promise<CognitionGuidance[]> {
    const [loops, latestReflections, dismissed] = await Promise.all([
      this.loops.listLoops({ includeResolved: true, limit: 500 }),
      this.reflections.listReflections({ type: 'task', latestOnly: true, limit: 200 }),
      this.guidance.dismissedTargetLoopIds(),
    ])
    const items = buildGuidanceFromLoops({
      loops,
      reflections: latestReflections,
      workspaceId: this.workspaceId,
      dismissedLoopIds: dismissed,
    })
    await this.guidance.replaceActive(items)
    return items
  }

  /**
   * On-demand refresh (Today open / user refresh). Builds daily reflection + guidance.
   * Never runs on app startup timer.
   */
  async refreshGuidance(options: { includeDaily?: boolean; projectId?: string } = {}): Promise<CognitionRefreshResult> {
    if (this.disposed) throw new Error('CognitionService disposed')
    await this.processUnprocessedEvents()

    const [allObs, allLoops] = await Promise.all([
      this.observations.listObservations({ projectId: options.projectId, limit: 500 }),
      this.loops.listLoops({ projectId: options.projectId, includeResolved: true, limit: 500 }),
    ])

    const sessionIds = [
      ...new Set(
        [...allObs, ...allLoops]
          .map((x) => x.sessionId)
          .filter((id): id is string => Boolean(id)),
      ),
    ]
    await this.refreshTaskReflectionsForSessions(sessionIds)
    const taskReflections = await this.reflections.listReflections({
      type: 'task',
      latestOnly: true,
      limit: 200,
    })

    let dailyReflection: CognitionReflection | null = null
    if (options.includeDaily !== false) {
      dailyReflection = buildDailyReflection({
        workspaceId: this.workspaceId,
        projectId: options.projectId,
        observations: allObs,
        loops: allLoops,
      })
      if (dailyReflection) await this.reflections.appendReflections([dailyReflection])
    }

    const guidance = await this.rebuildGuidance()
    return { dailyReflection, taskReflections, guidance }
  }

  async appendEvent(input: CognitionEventInput): Promise<AppendCognitionEventResult> {
    if (this.disposed) throw new Error('CognitionService disposed')
    const result = await this.track(this.store.appendEvent(input))
    if (result.status === 'appended') this.enqueueProcess()
    return result
  }

  appendEventSafe(input: CognitionEventInput): void {
    const run = async () => {
      try {
        const result = await this.store.appendEvent(input)
        if (result.status === 'appended') this.enqueueProcess()
      } catch (err) {
        if (err instanceof Error && err.name === 'CognitionPrivacyDeniedError') {
          // Denied writes are expected; access log already records the decision.
          return
        }
        log.warn('Cognition append failed (non-fatal)', {
          type: input.type,
          sessionId: input.sessionId,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }
    if (this.disposed) {
      log.warn('Cognition append skipped — service disposed', { type: input.type })
      return
    }
    void this.track(run())
  }

  appendSessionCreated(input: {
    sessionId: string
    name?: string
    projectId?: string
    parentSessionId?: string
    hasTaskGoal?: boolean
  }): void {
    this.appendEventSafe(
      buildSessionCreatedEvent({
        workspaceId: this.workspaceId,
        sessionId: input.sessionId,
        projectId: input.projectId,
        name: input.name,
        parentSessionId: input.parentSessionId,
        hasTaskGoal: input.hasTaskGoal,
      }),
    )
  }

  beginTurn(input: {
    sessionId: string
    projectId?: string
    model?: string
    resumedFromInterrupt?: boolean
  }): { turnId: string; correlationId: string } {
    const turnId = newCognitionTurnId()
    const correlationId = newCorrelationId(input.sessionId, turnId)
    this.appendEventSafe(
      buildSessionStartedEvent({
        workspaceId: this.workspaceId,
        sessionId: input.sessionId,
        projectId: input.projectId,
        turnId,
        model: input.model,
        resumedFromInterrupt: input.resumedFromInterrupt,
        correlationId,
      }),
    )
    if (input.resumedFromInterrupt) {
      this.appendEventSafe(
        buildSessionResumedEvent({
          workspaceId: this.workspaceId,
          sessionId: input.sessionId,
          projectId: input.projectId,
          turnId,
          correlationId,
        }),
      )
    }
    return { turnId, correlationId }
  }

  appendSessionStopped(input: {
    sessionId: string
    projectId?: string
    turnId: string
    correlationId?: string
    processingReason: 'complete' | 'interrupted' | 'error' | 'timeout'
    checkpointId?: string
    nextSteps?: string[]
    blockers?: string[]
    relatedFiles?: string[]
    errorCode?: string
    hasTaskGoal?: boolean
  }): void {
    const reason: SessionStopReason = mapProcessingReasonToStopReason(input.processingReason)
    this.appendEventSafe(
      buildSessionStoppedEvent({
        workspaceId: this.workspaceId,
        sessionId: input.sessionId,
        projectId: input.projectId,
        turnId: input.turnId,
        correlationId: input.correlationId ?? newCorrelationId(input.sessionId, input.turnId),
        reason,
        checkpointId: input.checkpointId,
        nextSteps: input.nextSteps,
        blockers: input.blockers,
        relatedFiles: input.relatedFiles,
        errorCode: input.errorCode,
        hasTaskGoal: input.hasTaskGoal,
      }),
    )
  }

  appendCheckpointEvent(input: {
    sessionId: string
    projectId?: string
    checkpointId: string
    source: 'auto' | 'manual'
    outcome: 'completed' | 'interrupted' | 'failed'
    nextSteps?: string[]
    blockers?: string[]
    relatedFiles?: string[]
    messageId?: string
    turnId?: string
    correlationId?: string
  }): void {
    this.appendEventSafe(
      buildCheckpointCreatedEvent({
        workspaceId: this.workspaceId,
        sessionId: input.sessionId,
        projectId: input.projectId,
        checkpointId: input.checkpointId,
        source: input.source,
        outcome: input.outcome,
        nextSteps: input.nextSteps,
        blockers: input.blockers,
        relatedFiles: input.relatedFiles,
        messageId: input.messageId,
        turnId: input.turnId,
        correlationId: input.correlationId,
      }),
    )
  }

  appendModelChanged(input: {
    sessionId: string
    projectId?: string
    model: string | null
    previousModel?: string | null
    connection?: string
  }): void {
    this.appendEventSafe(
      buildSessionModelChangedEvent({
        workspaceId: this.workspaceId,
        sessionId: input.sessionId,
        projectId: input.projectId,
        model: input.model,
        previousModel: input.previousModel,
        connection: input.connection,
        revision: Date.now(),
      }),
    )
  }

  appendTaskDetailsUpdated(input: {
    sessionId: string
    projectId?: string
    updatedFields: Array<'goal' | 'priority' | 'dueAt' | 'reminderAt' | 'acknowledgeReminder' | 'markReminderNotified'>
    hasTaskGoal?: boolean
    priority?: string
    dueAt?: number
    reminderAt?: number
  }): void {
    this.appendEventSafe(
      buildTaskDetailsUpdatedEvent({
        workspaceId: this.workspaceId,
        sessionId: input.sessionId,
        projectId: input.projectId,
        updatedFields: input.updatedFields,
        hasTaskGoal: input.hasTaskGoal,
        priority: input.priority,
        dueAt: input.dueAt,
        reminderAt: input.reminderAt,
        revision: Date.now(),
      }),
    )
  }

  listEvents(query?: CognitionEventQuery): Promise<CognitionEvent[]> {
    return this.store.listEvents(query)
  }

  async listObservations(query?: CognitionObservationQuery): Promise<CognitionObservation[]> {
    const items = await this.observations.listObservations(query)
    return this.filterByPolicy(items)
  }

  async listLoops(query?: CognitionLoopQuery): Promise<CognitionLoop[]> {
    const items = await this.loops.listLoops(query)
    return this.filterByPolicy(items)
  }

  async listReflections(query?: CognitionReflectionQuery): Promise<CognitionReflection[]> {
    const items = await this.reflections.listReflections(query)
    return this.filterByPolicy(items)
  }

  /**
   * Product path (Today): applies today.useContext + sourceKinds filter.
   * Pass `{ forDebug: true }` to skip product filtering (Debug page still should mark unknown).
   */
  async listGuidance(
    query?: CognitionGuidanceQuery & { forDebug?: boolean; forToday?: boolean },
  ): Promise<CognitionGuidance[]> {
    const items = await this.guidance.listGuidance(query)
    if (query?.forDebug) return items
    return this.filterByPolicy(items, { forToday: query?.forToday !== false })
  }

  async resolveLoop(loopId: string): Promise<CognitionLoop | null> {
    const loop = await this.loops.setLoopStatus(loopId, 'resolved')
    if (loop?.sessionId) {
      await this.refreshTaskReflectionsForSessions([loop.sessionId])
    }
    await this.rebuildGuidance()
    return loop
  }

  async dismissLoop(loopId: string): Promise<CognitionLoop | null> {
    const loop = await this.loops.setLoopStatus(loopId, 'dismissed')
    if (loop?.sessionId) {
      await this.refreshTaskReflectionsForSessions([loop.sessionId])
    }
    await this.rebuildGuidance()
    return loop
  }

  dismissGuidance(guidanceId: string): Promise<CognitionGuidance | null> {
    return this.guidance.dismiss(guidanceId)
  }

  getStatus(): Promise<CognitionStoreStatus> {
    return this.store.getStatus()
  }

  async clear(): Promise<void> {
    await this.store.clearEvents()
    await this.observations.clear()
    await this.loops.clear({ keepUserManaged: false })
    await this.reflections.clear()
    await this.guidance.clear()
  }

  repair(): Promise<CognitionStoreStatus> {
    return this.store.repairStore()
  }

  async findOpenStarts(): Promise<CognitionEvent[]> {
    const events = await this.store.listEvents({
      types: ['session.started', 'session.stopped'],
      limit: 500,
    })
    return findOpenSessionStarts(events)
  }

  async flush(): Promise<void> {
    await this.processChain.catch(() => {})
    await Promise.allSettled([...this.pending])
  }

  async dispose(): Promise<void> {
    await this.flush()
    this.disposed = true
  }
}

/** Per-workspaceDataRoot registry used by SessionManager / RPC. */
const services = new Map<string, CognitionService>()

export function getCognitionService(
  workspaceDataRoot: string,
  workspaceId?: string,
): CognitionService {
  let svc = services.get(workspaceDataRoot)
  if (svc && workspaceId && !svc.privacyWired) {
    // Upgrade legacy/test instance created without privacy wiring
    services.delete(workspaceDataRoot)
    svc = undefined
  }
  if (!svc) {
    const wsId = workspaceId ?? 'unknown'
    let policyGate: PrivacyPolicyGate | undefined
    let getResolvedPolicy: (() => ResolvedPrivacyPolicy | null) | undefined
    try {
      if (workspaceId) {
        const privacy = getPrivacyService(workspaceDataRoot, workspaceId)
        policyGate = privacy.createPolicyGate()
        getResolvedPolicy = () => privacy.getResolvedPolicy()
      }
    } catch (error) {
      log.warn('PrivacyService unavailable; cognition store allow-all (tests/legacy)', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
    svc = new CognitionService({
      workspaceDataRoot,
      workspaceId: wsId === 'unknown' ? workspaceId : wsId,
      policyGate,
      getResolvedPolicy,
    })
    services.set(workspaceDataRoot, svc)
  }
  return svc
}

export async function flushAllCognitionServices(): Promise<void> {
  await Promise.allSettled([...services.values()].map((svc) => svc.flush()))
}

export async function disposeAllCognitionServices(): Promise<void> {
  const all = [...services.values()]
  services.clear()
  await Promise.allSettled(all.map((svc) => svc.dispose()))
}

/** Test-only: clear the in-memory registry without disposing IO. */
export function _resetCognitionServiceRegistryForTests(): void {
  services.clear()
}
