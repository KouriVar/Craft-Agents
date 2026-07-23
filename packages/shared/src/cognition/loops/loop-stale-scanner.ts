/**
 * Mark long-idle open/waiting/blocked loops as stale (never auto-delete).
 */

import type { CognitionLoop } from './types.ts'

export const DEFAULT_STALE_LOOP_MS = 7 * 24 * 60 * 60 * 1000

export function shouldMarkLoopStale(
  loop: CognitionLoop,
  now = Date.now(),
  staleAfterMs = DEFAULT_STALE_LOOP_MS,
): boolean {
  if (loop.userManaged) return false
  if (loop.status !== 'open' && loop.status !== 'waiting' && loop.status !== 'blocked') return false
  return now - loop.lastUpdatedAt >= staleAfterMs
}

/** Return loop ids that should transition to stale. */
export function findStaleLoopIds(
  loops: CognitionLoop[],
  now = Date.now(),
  staleAfterMs = DEFAULT_STALE_LOOP_MS,
): string[] {
  return loops.filter((loop) => shouldMarkLoopStale(loop, now, staleAfterMs)).map((loop) => loop.id)
}
