/**
 * Project adapter — resolve LoadedProject from session.projectId (+ last-active fallback).
 */

import type { LoadedProject } from '@craft-agent/shared/projects/types'
import type { SessionMeta } from '@/atoms/sessions'
import { resolveLastActiveProject } from '@/lib/last-active-project'
import type { FusionProjectSlice } from '../types'

export function resolveFusionProjectId(
  workspaceId: string,
  session: SessionMeta | null,
  projects: readonly LoadedProject[] | null | undefined,
): string | undefined {
  if (session?.projectId?.trim()) return session.projectId.trim()
  if (!workspaceId || !projects?.length) return undefined
  return resolveLastActiveProject(workspaceId, projects)?.config.id
}

export function adaptProject(
  workspaceId: string,
  session: SessionMeta | null,
  projects: readonly LoadedProject[] | null | undefined,
): FusionProjectSlice | null {
  const projectId = resolveFusionProjectId(workspaceId, session, projects)
  if (!projectId || !projects?.length) return null
  const loaded = projects.find((item) => item.config.id === projectId)
  if (!loaded) return null
  return {
    id: loaded.config.id,
    name: loaded.config.name,
    slug: loaded.config.slug,
    workingDirectory: loaded.config.workingDirectory,
  }
}
