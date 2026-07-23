/**
 * Deterministic Guidance Ranker — no model.
 *
 * Priority intent:
 * 1. blockers
 * 2. interrupted / resume
 * 3. stale / long idle
 * 4. ordinary continue / follow_up
 */

import type { CognitionGuidance, CognitionGuidanceType } from './types.ts'

const TYPE_BASE: Record<CognitionGuidanceType, number> = {
  resolve_blocker: 1.0,
  resume: 0.85,
  review: 0.7,
  follow_up: 0.55,
  continue: 0.5,
}

export interface RankGuidanceOptions {
  now?: number
  /** Soft decay half-life for recency (ms). Default 48h. */
  halfLifeMs?: number
}

/**
 * Score a guidance item. Higher = more urgent for attention.
 * Factors: type base + importance + confidence + recency − age penalty.
 */
export function scoreGuidance(item: CognitionGuidance, options: RankGuidanceOptions = {}): number {
  const now = options.now ?? Date.now()
  const halfLife = options.halfLifeMs ?? 48 * 60 * 60 * 1000
  const age = Math.max(0, now - item.createdAt)
  const recency = Math.exp((-Math.LN2 * age) / halfLife)

  let score = TYPE_BASE[item.type] * 0.45
  score += item.importance * 0.3
  score += item.confidence * 0.1
  score += recency * 0.2

  if (item.type === 'resolve_blocker') score += 0.15
  if (item.type === 'resume') score += 0.08
  if (item.type === 'review') score -= 0.05

  // Mild decay for very old items (stale attention)
  if (age > 7 * 24 * 60 * 60 * 1000) score -= 0.12

  return Math.max(0, Math.min(2, score))
}

/** Sort descending by score; attaches `score` on each item (mutates copy). */
export function rankGuidance(
  items: CognitionGuidance[],
  options: RankGuidanceOptions = {},
): CognitionGuidance[] {
  return items
    .map((item) => ({ ...item, score: scoreGuidance(item, options) }))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || b.importance - a.importance || b.createdAt - a.createdAt)
}
