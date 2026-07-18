export type EmbeddedToolbarMode = 'fixed' | 'floating'

export interface EmbeddedToolbarModeTransition {
  pinPending: boolean
  revealed: boolean
}

/**
 * Reset renderer-only hover/pending state whenever native toolbar ownership
 * changes. In particular, floating -> fixed -> floating must clear the first
 * pin click before another pin attempt is allowed.
 */
export function getEmbeddedToolbarModeTransition(
  previousMode: EmbeddedToolbarMode | null,
  nextMode: EmbeddedToolbarMode | undefined,
): EmbeddedToolbarModeTransition | null {
  if (!nextMode || previousMode === nextMode) return null
  return {
    pinPending: nextMode === 'fixed',
    revealed: false,
  }
}
