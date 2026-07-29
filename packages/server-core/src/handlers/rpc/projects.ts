import { RPC_CHANNELS } from '@craft-agent/shared/protocol'
import { getWorkspaceByNameOrId } from '@craft-agent/shared/config'
import { pushTyped, type RpcServer } from '@craft-agent/server-core/transport'
import type { HandlerDeps } from '../handler-deps'

export const HANDLED_CHANNELS = [
  RPC_CHANNELS.projects.GET,
  RPC_CHANNELS.projects.GET_ONE,
  RPC_CHANNELS.projects.CREATE,
  RPC_CHANNELS.projects.UPDATE,
  RPC_CHANNELS.projects.DELETE,
  RPC_CHANNELS.projects.LIST_ASSETS,
  RPC_CHANNELS.projects.UPLOAD_ASSET,
  RPC_CHANNELS.projects.DELETE_ASSET,
  RPC_CHANNELS.projects.GET_MEMORY,
  RPC_CHANNELS.projects.SET_MEMORY,
  RPC_CHANNELS.projects.RESTORE_AUTOMATIONS,
  RPC_CHANNELS.projects.LIST_PAUSED_AUTOMATIONS,
] as const

export function registerProjectsHandlers(server: RpcServer, deps: HandlerDeps): void {
  const log = deps.platform.logger

  async function broadcastChanged(workspaceId: string, workspaceRootPath: string): Promise<void> {
    const { loadWorkspaceProjects } = await import('@craft-agent/shared/projects')
    const projects = loadWorkspaceProjects(workspaceRootPath)
    pushTyped(server, RPC_CHANNELS.projects.CHANGED, { to: 'workspace', workspaceId }, workspaceId, projects)
  }

  // List all projects for a workspace
  server.handle(RPC_CHANNELS.projects.GET, async (_ctx, workspaceId: string) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) {
      log.error(`PROJECTS_GET: Workspace not found: ${workspaceId}`)
      return []
    }
    const { loadWorkspaceProjects } = await import('@craft-agent/shared/projects')
    return loadWorkspaceProjects(workspace.rootPath)
  })

  // Get one project (by id or slug)
  server.handle(RPC_CHANNELS.projects.GET_ONE, async (_ctx, workspaceId: string, projectIdOrSlug: string) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) return null
    const { loadProject, loadProjectById } = await import('@craft-agent/shared/projects')
    return loadProject(workspace.rootPath, projectIdOrSlug)
      ?? loadProjectById(workspace.rootPath, projectIdOrSlug)
  })

  // Create a new project
  server.handle(RPC_CHANNELS.projects.CREATE, async (_ctx, workspaceId: string, input: import('@craft-agent/shared/projects').CreateProjectInput) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) throw new Error(`Workspace not found: ${workspaceId}`)
    const { createProject } = await import('@craft-agent/shared/projects')
    const project = createProject(workspace.rootPath, {
      name: input.name?.trim() || 'New Project',
      description: input.description,
      workingDirectory: input.workingDirectory,
      details: input.details,
      colorTheme: input.colorTheme,
      color: input.color,
      defaultExpertId: input.defaultExpertId,
      availableExpertIds: input.availableExpertIds,
    })
    await broadcastChanged(workspaceId, workspace.rootPath)
    await deps.sessionManager.emitAutomationEvent(workspaceId, 'ProjectChange', { action: 'created', projectId: project.id, slug: project.slug })
    log.info(`Created project: ${project.slug}`)
    return project
  })

  // Update project (partial patch). Slug stays stable.
  server.handle(RPC_CHANNELS.projects.UPDATE, async (
    _ctx,
    workspaceId: string,
    projectSlug: string,
    patch: Partial<Omit<import('@craft-agent/shared/projects').ProjectConfig, 'id' | 'slug' | 'createdAt'>>,
  ) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) throw new Error(`Workspace not found: ${workspaceId}`)
    const { loadProject, updateProject } = await import('@craft-agent/shared/projects')
    const existing = loadProject(workspace.rootPath, projectSlug)
    const updated = updateProject(workspace.rootPath, projectSlug, patch)
    if (existing && !existing.config.archivedAt && updated.archivedAt) {
      const { pauseProjectAutomations } = await import('@craft-agent/shared/automations')
      const paused = pauseProjectAutomations(workspace.rootPath, updated.id)
      if (paused) log.info(`Paused ${paused} automation(s) for archived project ${updated.id}`)
    }
    await broadcastChanged(workspaceId, workspace.rootPath)
    await deps.sessionManager.emitAutomationEvent(workspaceId, 'ProjectChange', { action: 'updated', projectId: updated.id, slug: updated.slug, archivedAt: updated.archivedAt })
    return updated
  })

  server.handle(RPC_CHANNELS.projects.GET_MEMORY, async (_ctx, workspaceId: string, projectSlug: string) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) return ''
    const { loadProjectMemory } = await import('@craft-agent/shared/projects')
    return loadProjectMemory(workspace.rootPath, projectSlug, Number.MAX_SAFE_INTEGER) ?? ''
  })

  server.handle(RPC_CHANNELS.projects.SET_MEMORY, async (_ctx, workspaceId: string, projectSlug: string, content: string) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) throw new Error(`Workspace not found: ${workspaceId}`)
    const { saveProjectMemory, loadProject } = await import('@craft-agent/shared/projects')
    saveProjectMemory(workspace.rootPath, projectSlug, content)
    await broadcastChanged(workspaceId, workspace.rootPath)
    const project = loadProject(workspace.rootPath, projectSlug)
    if (project) await deps.sessionManager.emitAutomationEvent(workspaceId, 'ProjectChange', { action: 'memory_updated', projectId: project.config.id, slug: projectSlug })
  })

  // Restoration is deliberately a separate, explicit action from unarchiving.
  server.handle(RPC_CHANNELS.projects.LIST_PAUSED_AUTOMATIONS, async (_ctx, workspaceId: string, projectSlug: string) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) throw new Error(`Workspace not found: ${workspaceId}`)
    const { loadProject } = await import('@craft-agent/shared/projects'); const project = loadProject(workspace.rootPath, projectSlug)
    if (!project) throw new Error(`Project not found: ${projectSlug}`)
    const { listPausedProjectAutomations } = await import('@craft-agent/shared/automations')
    return listPausedProjectAutomations(workspace.rootPath, project.config.id)
  })
  server.handle(RPC_CHANNELS.projects.RESTORE_AUTOMATIONS, async (_ctx, workspaceId: string, projectSlug: string, ids?: string[]) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) throw new Error(`Workspace not found: ${workspaceId}`)
    const { loadProject } = await import('@craft-agent/shared/projects')
    const project = loadProject(workspace.rootPath, projectSlug)
    if (!project) throw new Error(`Project not found: ${projectSlug}`)
    if (project.config.archivedAt) throw new Error('Restore the project before restoring its automations')
    const { restoreProjectAutomations } = await import('@craft-agent/shared/automations')
    return restoreProjectAutomations(workspace.rootPath, project.config.id, ids)
  })

  // Delete a project; unbinds projectId from any sessions that referenced it.
  server.handle(RPC_CHANNELS.projects.DELETE, async (_ctx, workspaceId: string, projectSlug: string) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) throw new Error(`Workspace not found: ${workspaceId}`)

    const { loadProject, deleteProject } = await import('@craft-agent/shared/projects')
    const project = loadProject(workspace.rootPath, projectSlug)
    if (!project) {
      log.warn(`PROJECTS_DELETE: project ${projectSlug} not found`)
      return
    }

    const { unbindProjectFromSessions } = await import('@craft-agent/shared/sessions')
    const touched = await unbindProjectFromSessions(workspace.rootPath, project.config.id)
    deleteProject(workspace.rootPath, projectSlug)
    await broadcastChanged(workspaceId, workspace.rootPath)
    await deps.sessionManager.emitAutomationEvent(workspaceId, 'ProjectChange', { action: 'deleted', projectId: project.config.id, slug: projectSlug })
    log.info(`Deleted project ${projectSlug} (unbound ${touched} sessions)`)
  })

  // List assets in a project
  server.handle(RPC_CHANNELS.projects.LIST_ASSETS, async (_ctx, workspaceId: string, projectSlug: string) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) return []
    const { listProjectAssets } = await import('@craft-agent/shared/projects')
    return listProjectAssets(workspace.rootPath, projectSlug)
  })

  // Upload an asset (base64 / text / sourcePath)
  server.handle(RPC_CHANNELS.projects.UPLOAD_ASSET, async (
    _ctx,
    workspaceId: string,
    projectSlug: string,
    input: import('@craft-agent/shared/projects').UploadProjectAssetInput,
  ) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) throw new Error(`Workspace not found: ${workspaceId}`)
    const { uploadProjectAsset } = await import('@craft-agent/shared/projects')
    const asset = uploadProjectAsset(workspace.rootPath, projectSlug, input)
    await broadcastChanged(workspaceId, workspace.rootPath)
    log.info(`Uploaded asset ${asset.filename} to project ${projectSlug}`)
    return asset
  })

  // Delete an asset by filename
  server.handle(RPC_CHANNELS.projects.DELETE_ASSET, async (
    _ctx,
    workspaceId: string,
    projectSlug: string,
    filename: string,
  ) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) throw new Error(`Workspace not found: ${workspaceId}`)
    const { deleteProjectAsset } = await import('@craft-agent/shared/projects')
    deleteProjectAsset(workspace.rootPath, projectSlug, filename)
    await broadcastChanged(workspaceId, workspace.rootPath)
  })
}
