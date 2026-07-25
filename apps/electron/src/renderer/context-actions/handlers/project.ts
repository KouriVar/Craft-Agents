/**
 * Project context-action handlers — navigate only; no create / model changes.
 */

import { getDefaultStore } from 'jotai'
import { projectsAtom } from '@/atoms/projects'
import { navigate, routes } from '@/lib/navigate'
import type { ActionContext, ContextAction, ContextActionPayload } from '../types'

export async function runProjectOpen(
  context: ActionContext,
  _payload?: ContextActionPayload,
): Promise<void> {
  if (!context.projectId) return
  const projects = getDefaultStore().get(projectsAtom)
  const project = projects.find((item) => item.config.id === context.projectId)
  if (!project) return
  navigate(routes.view.projects(project.config.slug))
}

export const projectOpenAction: ContextAction = {
  id: 'project.open',
  group: 'project',
  labelKey: 'contextActions.project.open',
  icon: 'FolderKanban',
  surfaces: ['dropdown', 'command-menu'],
  isAvailable: (context) => Boolean(context.projectId),
  run: runProjectOpen,
}
