import { RPC_CHANNELS } from '@craft-agent/shared/protocol'
import { getWorkspaceByNameOrId } from '@craft-agent/shared/config'
import type {
  CognitionEvent,
  CognitionGuidance,
  CognitionLoop,
  CognitionObservation,
  CognitionObservationCategory,
  CognitionLoopStatus,
  CognitionReflection,
  CognitionGuidanceType,
  CognitionReflectionType,
} from '@craft-agent/shared/cognition'
import type { RpcServer } from '@craft-agent/server-core/transport'
import type { HandlerDeps } from '../handler-deps'
import { getCognitionService } from '../../cognition'

export const HANDLED_CHANNELS = [
  RPC_CHANNELS.cognition.GET_STATUS,
  RPC_CHANNELS.cognition.LIST_EVENTS,
  RPC_CHANNELS.cognition.LIST_OBSERVATIONS,
  RPC_CHANNELS.cognition.LIST_LOOPS,
  RPC_CHANNELS.cognition.RESOLVE_LOOP,
  RPC_CHANNELS.cognition.DISMISS_LOOP,
  RPC_CHANNELS.cognition.LIST_REFLECTIONS,
  RPC_CHANNELS.cognition.LIST_GUIDANCE,
  RPC_CHANNELS.cognition.DISMISS_GUIDANCE,
  RPC_CHANNELS.cognition.REFRESH_GUIDANCE,
  RPC_CHANNELS.cognition.CLEAR,
  RPC_CHANNELS.cognition.REPAIR,
] as const

function toEventSummary(event: CognitionEvent): import('@craft-agent/shared/protocol').CognitionEventSummary {
  const payload: Record<string, unknown> = { ...(event.payload as Record<string, unknown>) }
  for (const key of Object.keys(payload)) {
    const value = payload[key]
    if (typeof value === 'string' && value.length > 240) {
      payload[key] = `${value.slice(0, 239)}…`
    }
  }
  return {
    id: event.id,
    sequence: event.sequence,
    type: event.type,
    source: event.source,
    timestamp: event.timestamp,
    sessionId: event.sessionId,
    projectId: event.projectId,
    correlationId: event.correlationId,
    idempotencyKey: event.idempotencyKey,
    summary: event.summary,
    payload,
  }
}

function toObservationDto(o: CognitionObservation): import('@craft-agent/shared/protocol').CognitionObservationDto {
  return {
    id: o.id,
    workspaceId: o.workspaceId,
    projectId: o.projectId,
    sessionId: o.sessionId,
    title: o.title,
    summary: o.summary,
    category: o.category,
    confidence: o.confidence,
    importance: o.importance,
    sourceEventIds: o.sourceEventIds,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  }
}

function toLoopDto(loop: CognitionLoop): import('@craft-agent/shared/protocol').CognitionLoopDto {
  return {
    id: loop.id,
    workspaceId: loop.workspaceId,
    projectId: loop.projectId,
    sessionId: loop.sessionId,
    title: loop.title,
    summary: loop.summary,
    status: loop.status,
    nextAction: loop.nextAction,
    blocker: loop.blocker,
    waitingFor: loop.waitingFor,
    importance: loop.importance,
    confidence: loop.confidence,
    observationIds: loop.observationIds,
    firstSeenAt: loop.firstSeenAt,
    lastUpdatedAt: loop.lastUpdatedAt,
    resolvedAt: loop.resolvedAt,
    userManaged: loop.userManaged,
  }
}

function toReflectionDto(r: CognitionReflection): import('@craft-agent/shared/protocol').CognitionReflectionDto {
  return {
    id: r.id,
    type: r.type,
    workspaceId: r.workspaceId,
    projectId: r.projectId,
    sessionId: r.sessionId,
    title: r.title,
    summary: r.summary,
    completed: r.completed,
    changes: r.changes,
    unresolved: r.unresolved,
    blockers: r.blockers,
    nextActions: r.nextActions,
    sourceObservationIds: r.sourceObservationIds,
    sourceLoopIds: r.sourceLoopIds,
    createdAt: r.createdAt,
    dayKey: r.dayKey,
  }
}

function toGuidanceDto(
  g: CognitionGuidance,
  opts?: { policyHidden?: boolean },
): import('@craft-agent/shared/protocol').CognitionGuidanceDto {
  return {
    id: g.id,
    type: g.type,
    title: g.title,
    reason: g.reason,
    action: g.action,
    importance: g.importance,
    confidence: g.confidence,
    score: g.score,
    targetLoopId: g.targetLoopId,
    targetSessionId: g.targetSessionId,
    sourceReflectionId: g.sourceReflectionId,
    sourceObservationIds: g.sourceObservationIds,
    sourceLoopIds: g.sourceLoopIds,
    sourceKinds: g.sourceKinds,
    sourceEventIds: g.sourceEventIds,
    policyHidden: opts?.policyHidden,
    projectId: g.projectId,
    createdAt: g.createdAt,
    dismissedAt: g.dismissedAt,
  }
}

export function registerCognitionHandlers(server: RpcServer, deps: HandlerDeps): void {
  const log = deps.platform.logger

  function resolveService(workspaceId: string) {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) throw new Error(`Workspace not found: ${workspaceId}`)
    return {
      workspace,
      service: getCognitionService(workspace.rootPath, workspace.id),
    }
  }

  server.handle(RPC_CHANNELS.cognition.GET_STATUS, async (_ctx, workspaceId: string) => {
    const { service } = resolveService(workspaceId)
    return service.getStatus()
  })

  server.handle(
    RPC_CHANNELS.cognition.LIST_EVENTS,
    async (_ctx, request: import('@craft-agent/shared/protocol').CognitionListEventsRequest) => {
      const { service } = resolveService(request.workspaceId)
      const events = await service.listEvents({
        afterSequence: request.afterSequence,
        beforeSequence: request.beforeSequence,
        projectId: request.projectId,
        sessionId: request.sessionId,
        types: request.types as import('@craft-agent/shared/cognition').CognitionEventType[] | undefined,
        fromTimestamp: request.fromTimestamp,
        toTimestamp: request.toTimestamp,
        limit: request.limit,
        offset: request.offset,
      })
      return events.map(toEventSummary)
    },
  )

  server.handle(
    RPC_CHANNELS.cognition.LIST_OBSERVATIONS,
    async (_ctx, request: import('@craft-agent/shared/protocol').CognitionListObservationsRequest) => {
      const { service } = resolveService(request.workspaceId)
      await service.processUnprocessedEvents().catch(() => {})
      const items = await service.listObservations({
        sessionId: request.sessionId,
        projectId: request.projectId,
        categories: request.categories as CognitionObservationCategory[] | undefined,
        limit: request.limit,
        offset: request.offset,
      })
      return items.map(toObservationDto)
    },
  )

  server.handle(
    RPC_CHANNELS.cognition.LIST_LOOPS,
    async (_ctx, request: import('@craft-agent/shared/protocol').CognitionListLoopsRequest) => {
      const { service } = resolveService(request.workspaceId)
      await service.processUnprocessedEvents().catch(() => {})
      const items = await service.listLoops({
        sessionId: request.sessionId,
        projectId: request.projectId,
        statuses: request.statuses as CognitionLoopStatus[] | undefined,
        includeResolved: request.includeResolved,
        limit: request.limit,
        offset: request.offset,
      })
      return items.map(toLoopDto)
    },
  )

  server.handle(
    RPC_CHANNELS.cognition.RESOLVE_LOOP,
    async (_ctx, request: import('@craft-agent/shared/protocol').CognitionLoopActionRequest) => {
      const { service } = resolveService(request.workspaceId)
      const loop = await service.resolveLoop(request.loopId)
      return loop ? toLoopDto(loop) : null
    },
  )

  server.handle(
    RPC_CHANNELS.cognition.DISMISS_LOOP,
    async (_ctx, request: import('@craft-agent/shared/protocol').CognitionLoopActionRequest) => {
      const { service } = resolveService(request.workspaceId)
      const loop = await service.dismissLoop(request.loopId)
      return loop ? toLoopDto(loop) : null
    },
  )

  server.handle(
    RPC_CHANNELS.cognition.LIST_REFLECTIONS,
    async (_ctx, request: import('@craft-agent/shared/protocol').CognitionListReflectionsRequest) => {
      const { service } = resolveService(request.workspaceId)
      await service.processUnprocessedEvents().catch(() => {})
      const items = await service.listReflections({
        type: request.type as CognitionReflectionType | undefined,
        sessionId: request.sessionId,
        projectId: request.projectId,
        dayKey: request.dayKey,
        latestOnly: request.latestOnly,
        limit: request.limit,
        offset: request.offset,
      })
      return items.map(toReflectionDto)
    },
  )

  server.handle(
    RPC_CHANNELS.cognition.LIST_GUIDANCE,
    async (_ctx, request: import('@craft-agent/shared/protocol').CognitionListGuidanceRequest) => {
      const { service } = resolveService(request.workspaceId)
      await service.processUnprocessedEvents().catch(() => {})
      if (request.forDebug) {
        const items = await service.listGuidance({
          sessionId: request.sessionId,
          projectId: request.projectId,
          types: request.types as CognitionGuidanceType[] | undefined,
          includeDismissed: request.includeDismissed,
          limit: request.limit,
          offset: request.offset,
          forDebug: true,
        })
        return items.map((g) =>
          toGuidanceDto(g, {
            policyHidden: !service.isGuidanceReadableForProduct(g),
          }),
        )
      }
      const items = await service.listGuidance({
        sessionId: request.sessionId,
        projectId: request.projectId,
        types: request.types as CognitionGuidanceType[] | undefined,
        includeDismissed: request.includeDismissed,
        limit: request.limit,
        offset: request.offset,
        forToday: request.forToday !== false,
      })
      return items.map((g) => toGuidanceDto(g))
    },
  )

  server.handle(
    RPC_CHANNELS.cognition.DISMISS_GUIDANCE,
    async (_ctx, request: import('@craft-agent/shared/protocol').CognitionGuidanceActionRequest) => {
      const { service } = resolveService(request.workspaceId)
      const item = await service.dismissGuidance(request.guidanceId)
      return item ? toGuidanceDto(item) : null
    },
  )

  server.handle(
    RPC_CHANNELS.cognition.REFRESH_GUIDANCE,
    async (_ctx, request: import('@craft-agent/shared/protocol').CognitionRefreshGuidanceRequest) => {
      const { service } = resolveService(request.workspaceId)
      const result = await service.refreshGuidance({
        projectId: request.projectId,
        includeDaily: request.includeDaily,
      })
      return {
        dailyReflection: result.dailyReflection ? toReflectionDto(result.dailyReflection) : null,
        guidanceCount: result.guidance.length,
      } satisfies import('@craft-agent/shared/protocol').CognitionRefreshGuidanceResultDto
    },
  )

  server.handle(RPC_CHANNELS.cognition.CLEAR, async (_ctx, workspaceId: string) => {
    const { service } = resolveService(workspaceId)
    await service.clear()
    log.info(`Cognition data cleared for workspace ${workspaceId}`)
    return { ok: true }
  })

  server.handle(RPC_CHANNELS.cognition.REPAIR, async (_ctx, workspaceId: string) => {
    const { service } = resolveService(workspaceId)
    return service.repair()
  })
}
