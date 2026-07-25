/**
 * Stable menu layout helpers for ContextActionsMenu (v0.16.4).
 * Pure — no React, no registry side effects.
 */

import type { ContextAction, ContextActionGroup } from './types'

/** Product group order for the Actions menu. Empty groups are omitted. */
export const CONTEXT_ACTION_GROUP_ORDER: ContextActionGroup[] = [
  'session',
  'library',
  'project',
]

/**
 * Stable within-group order for registered default actions.
 * Unknown ids append after known ones (registration order among unknowns).
 */
export const CONTEXT_ACTION_ID_ORDER: readonly string[] = [
  'session.continue',
  'session.archive',
  'library.createFromSession',
  'library.export',
  'project.open',
]

const GROUP_LABEL_KEYS: Partial<Record<ContextActionGroup, string>> = {
  session: 'contextActions.group.session',
  library: 'contextActions.group.library',
  project: 'contextActions.group.project',
}

export function groupLabelKey(group: ContextActionGroup): string {
  return GROUP_LABEL_KEYS[group] ?? 'contextActions.groupHeader'
}

function actionOrderIndex(id: string): number {
  const index = CONTEXT_ACTION_ID_ORDER.indexOf(id)
  return index === -1 ? CONTEXT_ACTION_ID_ORDER.length : index
}

export function sortActionsForMenu(actions: readonly ContextAction[]): ContextAction[] {
  return actions
    .slice()
    .sort((a, b) => {
      const groupDelta =
        CONTEXT_ACTION_GROUP_ORDER.indexOf(a.group)
        - CONTEXT_ACTION_GROUP_ORDER.indexOf(b.group)
      if (groupDelta !== 0) return groupDelta
      return actionOrderIndex(a.id) - actionOrderIndex(b.id)
    })
}

export function groupActionsForMenu(
  actions: readonly ContextAction[],
): Array<{ group: ContextActionGroup; items: ContextAction[] }> {
  const sorted = sortActionsForMenu(actions)
  const buckets = new Map<ContextActionGroup, ContextAction[]>()
  for (const action of sorted) {
    if (!CONTEXT_ACTION_GROUP_ORDER.includes(action.group)) continue
    const list = buckets.get(action.group) ?? []
    list.push(action)
    buckets.set(action.group, list)
  }
  return CONTEXT_ACTION_GROUP_ORDER
    .filter((group) => (buckets.get(group)?.length ?? 0) > 0)
    .map((group) => ({ group, items: buckets.get(group) ?? [] }))
}
