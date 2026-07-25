/**
 * Context Fusion Layer (v0.16.6 + v0.16.7 git) — public exports.
 *
 * Suggestion Engine is the consumer; this package is the read-only adapter layer.
 */

export type {
  ContextFusionProviderInput,
  ContextFusionSnapshot,
  FusionBrowserSlice,
  FusionBrowserTabSlice,
  FusionCognitionSlice,
  FusionGitResolvedFrom,
  FusionGitSlice,
  FusionGuidanceSignal,
  FusionLoopSignal,
  FusionPrivacySlice,
  FusionProjectSlice,
} from './types'

export {
  buildContextFusionSnapshot,
  type ContextFusionProviderDeps,
} from './context-provider'

export { adaptSession } from './adapters/session'
export { adaptProject, resolveFusionProjectId } from './adapters/project'
export { adaptBrowser, emptyFusionBrowserSlice } from './adapters/browser'
export {
  adaptCognition,
  emptyFusionCognitionSlice,
  type CognitionGuidanceSource,
  type CognitionLoopSource,
} from './adapters/cognition'
export {
  adaptGit,
  adaptGitFromFusionParts,
  resolveGitWorkingDirectory,
  type AdaptGitInput,
  type ResolvedGitWorkingDirectory,
} from './adapters/git'
