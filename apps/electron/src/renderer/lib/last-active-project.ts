/**
 * Workspace-scoped last-active project pointer (v0.16.3 Task 2).
 *
 * Persisted in renderer localStorage only — no Project model / DB changes.
 * Never used for launch routing or window-state restore.
 */

import type { LoadedProject } from '@craft-agent/shared/projects/types'
import * as storage from '@/lib/local-storage'

export function getLastActiveProjectId(workspaceId: string): string | null {
  if (!workspaceId) return null
  const value = storage.get<string | null>(storage.KEYS.lastActiveProjectId, null, workspaceId)
  return typeof value === 'string' && value.trim() ? value : null
}

export function setLastActiveProjectId(workspaceId: string, projectId: string): void {
  if (!workspaceId || !projectId.trim()) return
  storage.set(storage.KEYS.lastActiveProjectId, projectId, workspaceId)
}

export function clearLastActiveProjectId(workspaceId: string): void {
  if (!workspaceId) return
  storage.remove(storage.KEYS.lastActiveProjectId, workspaceId)
}

/**
 * Resolve the stored pointer against the current project list.
 * Clears the pointer when the project no longer exists (deleted / missing).
 */
export function resolveLastActiveProject(
  workspaceId: string,
  projects: readonly LoadedProject[],
): LoadedProject | null {
  const projectId = getLastActiveProjectId(workspaceId)
  if (!projectId) return null
  const match = projects.find((p) => p.config.id === projectId) ?? null
  if (!match) {
    clearLastActiveProjectId(workspaceId)
    return null
  }
  return match
}
