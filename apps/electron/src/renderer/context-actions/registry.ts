/**
 * Context Action Registry (v0.16.4).
 *
 * In-memory singleton for the renderer process. Not persisted, not protocol,
 * and intentionally separate from the hotkey Action Registry (`renderer/actions`).
 */

import type {
  ActionContext,
  ContextAction,
  ContextActionPayload,
  ContextActionSurface,
} from './types'

export class ContextActionRegistry {
  private readonly actions = new Map<string, ContextAction>()

  register(action: ContextAction): void {
    if (!action.id.trim()) {
      throw new Error('ContextAction.id must be a non-empty string')
    }
    this.actions.set(action.id, action)
  }

  unregister(id: string): void {
    this.actions.delete(id)
  }

  /** All registered actions (insertion order). */
  list(): ContextAction[] {
    return Array.from(this.actions.values())
  }

  get(id: string): ContextAction | undefined {
    return this.actions.get(id)
  }

  /**
   * Actions that declare `surface` and pass `isAvailable(context)`.
   */
  listForSurface(surface: ContextActionSurface, context: ActionContext): ContextAction[] {
    return this.list().filter(
      (action) => action.surfaces.includes(surface) && action.isAvailable(context),
    )
  }

  async run(
    id: string,
    context: ActionContext,
    payload?: ContextActionPayload,
  ): Promise<void> {
    const action = this.actions.get(id)
    if (!action) {
      throw new Error(`Unknown ContextAction: ${id}`)
    }
    if (!action.isAvailable(context)) {
      throw new Error(`ContextAction not available: ${id}`)
    }
    await action.run(context, payload)
  }

  /** Test / re-init helper — clears all registrations. */
  clear(): void {
    this.actions.clear()
  }
}

/** Process-wide renderer singleton. */
export const contextActionRegistry = new ContextActionRegistry()
