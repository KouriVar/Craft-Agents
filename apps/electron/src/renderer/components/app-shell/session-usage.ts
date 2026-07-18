import type { LlmConnectionWithStatus } from '../../../shared/types'

export interface SessionUsageMetrics {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  contextTokens: number
  costUsd: number
  cacheReadTokens?: number
  cacheCreationTokens?: number
  contextWindow?: number
}
export type PricingKind = 'official' | 'deepseek-standard' | 'subscription' | 'custom'

export function formatTokenCount(value: number): string {
  const safeValue = Math.max(0, value || 0)
  if (safeValue >= 1_000_000) {
    const digits = safeValue >= 10_000_000 ? 0 : 1
    return `${(safeValue / 1_000_000).toFixed(digits).replace(/\.0$/, '')}M`
  }
  if (safeValue >= 1_000) {
    const digits = safeValue >= 100_000 ? 0 : 1
    return `${(safeValue / 1_000).toFixed(digits).replace(/\.0$/, '')}K`
  }
  return String(Math.round(safeValue))
}

export function formatUsd(value: number): string {
  const safeValue = Math.max(0, value || 0)
  if (safeValue === 0) return '$0.00'
  if (safeValue < 0.0001) return '<$0.0001'
  if (safeValue < 0.01) return `$${safeValue.toFixed(4)}`
  if (safeValue < 1) return `$${safeValue.toFixed(3)}`
  return `$${safeValue.toFixed(2)}`
}

export function getContextUsage(usage?: SessionUsageMetrics): {
  used: number
  window: number
  percent: number
  remainingPercent: number
} {
  const used = Math.max(0, usage?.inputTokens || usage?.contextTokens || 0)
  const window = Math.max(0, usage?.contextWindow || 0)
  const percent = window > 0 ? Math.min(100, Math.round((used / window) * 100)) : 0
  return { used, window, percent, remainingPercent: Math.max(0, 100 - percent) }
}

export function resolvePricingKind(connection?: LlmConnectionWithStatus | null): PricingKind {
  if (!connection) return 'official'
  if (connection.providerType === 'pi_compat') return 'custom'
  if (connection.authType === 'oauth') return 'subscription'
  if (connection.piAuthProvider === 'deepseek') return 'deepseek-standard'
  return 'official'
}

export function resolveModelName(modelId: string | undefined, connection?: LlmConnectionWithStatus | null): string {
  const rawId = modelId || connection?.defaultModel || ''
  if (!rawId) return '—'
  const bareId = rawId.replace(/^pi\//, '')
  const match = connection?.models?.find((entry) => (typeof entry === 'string' ? entry : entry.id).replace(/^pi\//, '') === bareId)
  if (match && typeof match !== 'string') return match.name
  return bareId
    .split('-')
    .map((part) => part ? part.charAt(0).toUpperCase() + part.slice(1) : part)
    .join(' ')
}
