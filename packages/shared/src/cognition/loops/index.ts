export type {
  CognitionLoop,
  CognitionLoopStatus,
  CognitionLoopQuery,
} from './types.ts'
export { normalizeLoopTitle, coreLoopTopic, titleSimilarity, isSimilarLoopTitle } from './loop-deduplicator.ts'
export {
  buildLoopDrafts,
  materializeLoopDrafts,
  type LoopDraft,
} from './loop-rules.ts'
export { LoopStore } from './loop-store.ts'
export { findStaleLoopIds, shouldMarkLoopStale, DEFAULT_STALE_LOOP_MS } from './loop-stale-scanner.ts'
