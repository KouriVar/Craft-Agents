/**
 * Context Action Framework (v0.16.4) + Suggestion Layer (v0.16.5) — public exports.
 */

export type {
  ActionContext,
  ActionContextFlags,
  ContextAction,
  ContextActionGroup,
  ContextActionPayload,
  ContextActionSuggestion,
  ContextActionSurface,
  PrivacyPolicySnapshot,
} from './types'

export { ContextActionRegistry, contextActionRegistry } from './registry'

export {
  buildActionContext,
  isAllowCognitionDerived,
  type BuildActionContextInput,
} from './build-action-context'

export {
  bindContextActionHost,
  getContextActionHost,
  requireContextActionHost,
  type ContextActionRuntimeHost,
} from './runtime-host'

export {
  registerDefaultContextActions,
  resetDefaultContextActionsForTests,
} from './register-defaults'

export {
  CONTEXT_ACTION_GROUP_ORDER,
  CONTEXT_ACTION_ID_ORDER,
  groupActionsForMenu,
  groupLabelKey,
  sortActionsForMenu,
} from './menu-layout'

export {
  beginExportTargetResolve,
  completeExportTargetResolve,
  documentIdForActionContext,
  exportTargetRequestKey,
  initialExportTargetState,
  type ExportTargetState,
  type ExportTargetStatus,
} from './export-target-state'

export {
  BROWSER_CONTINUE_CONFIDENCE_BOOST,
  GIT_DIRTY_CONTINUE_CONFIDENCE_BOOST,
  GIT_DIVERGENCE_CONTINUE_CONFIDENCE_BOOST,
  GIT_REPO_CONTINUE_CONFIDENCE_BOOST,
  LONG_SESSION_MESSAGE_COUNT,
  PROJECT_CONTINUE_CONFIDENCE_BOOST,
  actionContextFromFusion,
  buildContextActionSuggestions,
  filterAvailableSuggestions,
  hasBrowserContinueBoost,
  hasGitDirtyContinueBoost,
  hasGitDivergenceContinueBoost,
  hasGitRepoContinueBoost,
  hasProjectContinueBoost,
  resolveContextActionSuggestions,
  resolveSuggestionsFromFusion,
  sessionHasResearchOrDevContext,
  snapshotFromSuggestionParts,
  type BuildContextActionSuggestionsInput,
  type SuggestionFromFusionOptions,
  type SuggestionGuidanceSignal,
  type SuggestionLoopSignal,
} from './suggestions'
