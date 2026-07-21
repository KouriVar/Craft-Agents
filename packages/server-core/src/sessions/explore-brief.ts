import type {
  ExploreBriefRecommendation,
  ExploreBriefRequest,
  ExploreBriefResult,
  ExploreBriefThread,
} from '@craft-agent/shared/protocol'

export const EXPLORE_BRIEF_OUTPUT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  properties: {
    headline: { type: 'string' },
    summary: { type: 'string' },
    threads: {
      type: 'array',
      maxItems: 3,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
          detail: { type: 'string' },
        },
        required: ['title', 'detail'],
      },
    },
    recommendations: {
      type: 'array',
      minItems: 3,
      maxItems: 5,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          kind: { type: 'string', enum: ['session', 'tab', 'prompt'] },
          targetId: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' },
          prompt: { type: 'string' },
        },
        required: ['kind', 'title', 'description'],
      },
    },
  },
  required: ['headline', 'summary', 'threads', 'recommendations'],
}

export function buildExploreBriefPrompt(request: ExploreBriefRequest): string {
  const payload = {
    sessions: request.sessions.slice(0, 12),
    browserTabs: request.tabs.slice(0, 8),
  }
  return [
    `Write in the language represented by locale "${request.locale}".`,
    'Turn the workspace activity below into a calm, useful work briefing.',
    'The headline should describe the current overall focus, not the product or this task.',
    'The summary should be 1-2 concise sentences. Threads should contain 1-3 distinct active workstreams.',
    `Return exactly ${request.recommendationCount} practical next-step recommendations.`,
    'For kind=session or kind=tab, targetId MUST be copied exactly from the input.',
    'Use kind=prompt only for a genuinely useful new task; include the ready-to-send prompt.',
    'Never invent completed work, urgency, deadlines, people, or facts not present in the input.',
    'Avoid generic advice such as "continue working". Be specific and concise.',
    `Workspace activity:\n${JSON.stringify(payload)}`,
  ].join('\n')
}

function asTrimmedString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  return trimmed.slice(0, maxLength)
}

function parseJsonObject(text: string): Record<string, unknown> {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('Explore analysis returned invalid JSON')
  const value = JSON.parse(trimmed.slice(start, end + 1)) as unknown
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Explore analysis returned an invalid object')
  }
  return value as Record<string, unknown>
}

function fallbackDetail(value: string | undefined, fallback: string, maxLength = 220): string {
  const compact = value
    ?.replace(/^(?:user|assistant):\s*/gim, '')
    .replace(/\s+/g, ' ')
    .trim()
  return (compact || fallback).slice(0, maxLength)
}

function buildFallbackThreads(request: ExploreBriefRequest): ExploreBriefThread[] {
  return [
    ...request.sessions.map((session) => ({
      title: session.title.slice(0, 80),
      detail: fallbackDetail(session.preview || session.recentContext, session.title),
    })),
    ...request.tabs.map((tab) => ({
      title: (tab.title || tab.url || '').slice(0, 80),
      detail: fallbackDetail(tab.url, tab.title),
    })),
  ].filter((thread) => thread.title && thread.detail).slice(0, 3)
}

function buildFallbackRecommendations(request: ExploreBriefRequest): ExploreBriefRecommendation[] {
  return [
    ...request.sessions.map((session) => ({
      kind: 'session' as const,
      targetId: session.id,
      title: session.title.slice(0, 100),
      description: fallbackDetail(session.preview || session.recentContext, session.title),
    })),
    ...request.tabs.map((tab) => ({
      kind: 'tab' as const,
      targetId: tab.id,
      title: (tab.title || tab.url || '').slice(0, 100),
      description: fallbackDetail(tab.url, tab.title),
    })),
  ].filter((item) => item.title && item.description)
}

export function parseExploreBriefResult(
  text: string,
  request: ExploreBriefRequest,
  model?: string,
): ExploreBriefResult {
  const value = parseJsonObject(text)
  const sessionIds = new Set(request.sessions.map((session) => session.id))
  const tabIds = new Set(request.tabs.map((tab) => tab.id))

  const threads = (Array.isArray(value.threads) ? value.threads : [])
    .map((candidate): ExploreBriefThread | null => {
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null
      const item = candidate as Record<string, unknown>
      const title = asTrimmedString(item.title, 80)
      const detail = asTrimmedString(item.detail, 220)
      return title && detail ? { title, detail } : null
    })
    .filter((item): item is ExploreBriefThread => item !== null)
    .slice(0, 3)

  const recommendations = (Array.isArray(value.recommendations) ? value.recommendations : [])
    .map((candidate): ExploreBriefRecommendation | null => {
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null
      const item = candidate as Record<string, unknown>
      const kind = item.kind
      const title = asTrimmedString(item.title, 100)
      const description = asTrimmedString(item.description, 220)
      if ((kind !== 'session' && kind !== 'tab' && kind !== 'prompt') || !title || !description) return null

      if (kind === 'session') {
        const targetId = asTrimmedString(item.targetId, 160)
        return targetId && sessionIds.has(targetId) ? { kind, targetId, title, description } : null
      }
      if (kind === 'tab') {
        const targetId = asTrimmedString(item.targetId, 160)
        return targetId && tabIds.has(targetId) ? { kind, targetId, title, description } : null
      }
      const prompt = asTrimmedString(item.prompt, 1200)
      return prompt ? { kind, title, description, prompt } : null
    })
    .filter((item): item is ExploreBriefRecommendation => item !== null)

  const seen = new Set<string>()
  const uniqueRecommendations = [...recommendations, ...buildFallbackRecommendations(request)].filter((item) => {
    const key = `${item.kind}:${item.targetId ?? item.prompt ?? item.title}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).slice(0, request.recommendationCount)

  const headline = asTrimmedString(value.headline, 100)
  const summary = asTrimmedString(value.summary, 500)
  if (!headline || !summary) {
    throw new Error('Explore analysis was incomplete')
  }

  return {
    headline,
    summary,
    threads: threads.length > 0 ? threads : buildFallbackThreads(request),
    recommendations: uniqueRecommendations,
    generatedAt: Date.now(),
    model,
  }
}
