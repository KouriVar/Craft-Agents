/**
 * Context Action Framework types (v0.16.4).
 *
 * Renderer-only — not part of protocol / shared DTO surface.
 * Actions are executable capabilities surfaced via native CA UI
 * (Dropdown + Command / Context Menu), not AI information cards.
 */

/** Surfaces where a ContextAction may appear. */
export type ContextActionSurface =
  | 'command-menu'
  | 'dropdown'
  | 'context-menu'
  | 'button'
  | 'popover'

/** Menu / registry grouping (matches Actions menu sections). */
export type ContextActionGroup =
  | 'session'
  | 'library'
  | 'project'
  | 'memory'
  | 'continue'
  | 'export'

/** Availability / capability flags derived from current context. */
export interface ActionContextFlags {
  canContinue: boolean
  canArchive: boolean
  canCreateLibraryFromSession: boolean
  /** True when privacy allows cognition-derived product surfaces. */
  allowCognitionDerived: boolean
}

/**
 * Runtime context assembled for action availability + execution.
 * Ephemeral — never persisted.
 */
export interface ActionContext {
  workspaceId: string
  sessionId?: string
  projectId?: string
  documentId?: string
  flags: ActionContextFlags
}

/**
 * Optional payload for `run` — used when the user must confirm / choose
 * (e.g. target project) before executing an existing capability.
 */
export type ContextActionPayload = Record<string, unknown>

/**
 * A single executable context action.
 * `run` must orchestrate existing helpers / electronAPI — never reimplement.
 */
export interface ContextAction {
  id: string
  group: ContextActionGroup
  /** i18n key (resolved in UI; never call i18n at module level). */
  labelKey: string
  descriptionKey?: string
  /** Lucide / CA icon id string — UI maps to a React node. */
  icon: string
  surfaces: ContextActionSurface[]
  isAvailable: (context: ActionContext) => boolean
  run: (context: ActionContext, payload?: ContextActionPayload) => void | Promise<void>
}

/**
 * Suggestion produced by the Context Suggestion Engine (v0.16.5).
 * Always points at an existing ContextAction id — never a parallel action system.
 * `reason` may be an i18n key or a short display string; UI may ignore it.
 */
export interface ContextActionSuggestion {
  actionId: string
  reason?: string
  confidence?: number
}

/**
 * Minimal privacy snapshot for flag derivation.
 * Compatible with PrivacyPolicyDto fields used by Explore Today.
 */
export interface PrivacyPolicySnapshot {
  contextAwarenessEnabled: boolean
  today: { useContext: boolean }
  privacyMode?: { active: boolean } | null
  effectivePrivacyModeActive?: boolean
}
