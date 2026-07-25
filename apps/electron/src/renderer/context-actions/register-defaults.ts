/**
 * Register the v0.16.4 default Context Actions.
 *
 * Memory actions are out of scope for this version.
 */

import {
  libraryCreateFromSessionAction,
  libraryExportAction,
} from './handlers/library'
import { projectOpenAction } from './handlers/project'
import { sessionArchiveAction, sessionContinueAction } from './handlers/session'
import { contextActionRegistry } from './registry'

let registered = false

/**
 * Idempotent — safe under React Strict Mode / multiple Badge mounts.
 * Map-keyed register also overwrites by id, so duplicates cannot accumulate.
 */
export function registerDefaultContextActions(): void {
  if (registered && contextActionRegistry.get('session.continue')) return
  contextActionRegistry.register(sessionContinueAction)
  contextActionRegistry.register(sessionArchiveAction)
  contextActionRegistry.register(libraryCreateFromSessionAction)
  contextActionRegistry.register(libraryExportAction)
  contextActionRegistry.register(projectOpenAction)
  registered = true
}

/** Test helper — clears registry + allows re-registration. */
export function resetDefaultContextActionsForTests(): void {
  contextActionRegistry.clear()
  registered = false
}
