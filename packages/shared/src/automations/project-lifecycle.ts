import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolveAutomationsConfigPath } from './resolve-config-path.ts'

export interface PausedProjectAutomation { id: string; name: string; event: string }

/**
 * Archive safety rule: disable project-scoped automations, but never re-enable
 * them on project restore. The user must explicitly confirm/re-enable each one.
 */
export function pauseProjectAutomations(workspaceRoot: string, projectId: string): number {
  const path = resolveAutomationsConfigPath(workspaceRoot)
  if (!existsSync(path)) return 0
  const config = JSON.parse(readFileSync(path, 'utf8')) as { automations?: Record<string, Array<Record<string, unknown>>> }
  let changed = 0
  for (const matchers of Object.values(config.automations ?? {})) {
    for (const matcher of matchers) {
      if (matcher.projectId === projectId && matcher.enabled !== false) {
        matcher.enabled = false
        // Preserve the reason so restore never enables a rule the user had
        // already disabled before archiving the project.
        matcher.pausedByProjectArchive = true
        changed++
      }
    }
  }
  if (changed) writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, 'utf8')
  return changed
}

/** Re-enable only rules paused by `pauseProjectAutomations`, after user confirmation. */
export function listPausedProjectAutomations(workspaceRoot: string, projectId: string): PausedProjectAutomation[] {
  const path = resolveAutomationsConfigPath(workspaceRoot)
  if (!existsSync(path)) return []
  const config = JSON.parse(readFileSync(path, 'utf8')) as { automations?: Record<string, Array<Record<string, unknown>>> }
  return Object.entries(config.automations ?? {}).flatMap(([event, matchers]) => matchers
    .filter((matcher) => matcher.projectId === projectId && matcher.pausedByProjectArchive === true && typeof matcher.id === 'string')
    .map((matcher) => ({ id: matcher.id as string, name: typeof matcher.name === 'string' ? matcher.name : `${event} automation`, event })))
}

export function restoreProjectAutomations(workspaceRoot: string, projectId: string, ids?: string[]): number {
  const path = resolveAutomationsConfigPath(workspaceRoot)
  if (!existsSync(path)) return 0
  const config = JSON.parse(readFileSync(path, 'utf8')) as { automations?: Record<string, Array<Record<string, unknown>>> }
  let changed = 0
  for (const matchers of Object.values(config.automations ?? {})) {
    for (const matcher of matchers) {
      if (matcher.projectId === projectId && matcher.pausedByProjectArchive === true && (!ids || (typeof matcher.id === 'string' && ids.includes(matcher.id)))) {
        delete matcher.enabled
        delete matcher.pausedByProjectArchive
        changed++
      }
    }
  }
  if (changed) writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, 'utf8')
  return changed
}
