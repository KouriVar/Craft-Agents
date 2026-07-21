import type { ExploreBriefRequest, ExploreBriefResult } from '@craft-agent/shared/protocol'
import type { ExploreAiFrequency } from './explore-settings'
import * as storage from './local-storage'

interface CachedExploreBrief {
  result: ExploreBriefResult
}

const startupCache = new Map<string, CachedExploreBrief>()

function ttlFor(frequency: ExploreAiFrequency): number {
  if (frequency === '6h') return 6 * 60 * 60 * 1000
  if (frequency === '12h') return 12 * 60 * 60 * 1000
  if (frequency === '24h') return 24 * 60 * 60 * 1000
  return Number.POSITIVE_INFINITY
}

function sourceIds(request: ExploreBriefRequest): string[] {
  return [
    ...request.sessions.map((session) => `session:${session.id}`),
    ...request.tabs.map((tab) => `tab:${tab.id}`),
  ]
}

function hasUsableTargets(cache: CachedExploreBrief, request: ExploreBriefRequest): boolean {
  const available = new Set(sourceIds(request))
  return cache.result.recommendations.some((item) => (
    item.kind === 'prompt'
      || (item.targetId ? available.has(`${item.kind}:${item.targetId}`) : false)
  ))
}

export async function getOrGenerateExploreBrief(
  request: ExploreBriefRequest,
  frequency: ExploreAiFrequency,
  force = false,
): Promise<ExploreBriefResult> {
  if (!force) {
    const cached = frequency === 'startup'
      ? startupCache.get(request.workspaceId)
      : storage.get<CachedExploreBrief | null>(storage.KEYS.exploreBrief, null, request.workspaceId)
    if (cached && Date.now() - cached.result.generatedAt < ttlFor(frequency) && hasUsableTargets(cached, request)) {
      return cached.result
    }
  }

  const result = await window.electronAPI.generateExploreBrief(request)
  const cached = { result }
  startupCache.set(request.workspaceId, cached)
  storage.set(storage.KEYS.exploreBrief, cached, request.workspaceId)
  return result
}
