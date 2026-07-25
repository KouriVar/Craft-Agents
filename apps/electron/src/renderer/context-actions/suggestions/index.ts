/**
 * Context Suggestion Layer (v0.16.5) — consumes ContextFusionSnapshot (v0.16.6).
 */

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
} from './engine'
