/**
 * Today Guidance bypass — transforms cognition Guidance DTOs for Explore Today.
 *
 * Does NOT modify buildTodayTasks. Guidance is a suggestion, not a task.
 */

import type { CognitionGuidanceDto } from '@craft-agent/shared/protocol'

export type TodayGuidanceScope = 'workspace' | 'activeSessions'

export interface TodayGuidanceItem {
  id: string
  type: CognitionGuidanceDto['type']
  title: string
  reason: string
  action: string
  importance: number
  score: number
  targetSessionId?: string
  targetLoopId?: string
  sourceReflectionId?: string
  sourceObservationIds: string[]
  sourceLoopIds: string[]
  projectId?: string
}

export interface BuildTodayGuidanceOptions {
  /** Exclude guidance targeting these session ids (e.g. already in Today top list). */
  excludeSessionIds?: Iterable<string>
  /** When 'activeSessions', keep only items whose targetSessionId is in activeSessionIds (or missing). */
  scope?: TodayGuidanceScope
  activeSessionIds?: Iterable<string>
  limit?: number
}

/**
 * Pure mapper + filter for Today Guidance cards.
 * Input should already exclude dismissed items from the RPC layer.
 */
export function buildTodayGuidance(
  guidance: CognitionGuidanceDto[],
  options: BuildTodayGuidanceOptions = {},
): TodayGuidanceItem[] {
  const exclude = new Set(options.excludeSessionIds ?? [])
  const active = new Set(options.activeSessionIds ?? [])
  const scope = options.scope ?? 'workspace'
  const limit = Math.max(1, Math.min(options.limit ?? 5, 10))

  const mapped: TodayGuidanceItem[] = []
  for (const g of guidance) {
    if (g.dismissedAt) continue
    if (g.targetSessionId && exclude.has(g.targetSessionId)) continue
    if (scope === 'activeSessions') {
      if (g.targetSessionId && active.size > 0 && !active.has(g.targetSessionId)) continue
    }
    mapped.push({
      id: g.id,
      type: g.type,
      title: g.title,
      reason: g.reason,
      action: g.action,
      importance: g.importance,
      score: g.score ?? g.importance,
      targetSessionId: g.targetSessionId,
      targetLoopId: g.targetLoopId,
      sourceReflectionId: g.sourceReflectionId,
      sourceObservationIds: g.sourceObservationIds ?? [],
      sourceLoopIds: g.sourceLoopIds ?? [],
      projectId: g.projectId,
    })
  }

  return mapped
    .sort((a, b) => b.score - a.score || b.importance - a.importance)
    .slice(0, limit)
}

/** Open-session click target for a guidance card — never creates a task. */
export function guidanceOpenSessionId(item: TodayGuidanceItem): string | null {
  return item.targetSessionId || null
}
