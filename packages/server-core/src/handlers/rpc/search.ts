import { getWorkspaceByNameOrId } from '@craft-agent/shared/config'
import { groupSearchResults, repairSearchIndex, searchLocalIndex } from '@craft-agent/shared/search-index'
import { indexSearchSources } from '@craft-agent/shared/search-index'
import { RPC_CHANNELS } from '@craft-agent/shared/protocol'
import type { RpcServer } from '@craft-agent/server-core/transport'
import type { HandlerDeps } from '../handler-deps'

export const HANDLED_CHANNELS = [
  RPC_CHANNELS.search.QUERY,
  RPC_CHANNELS.search.REPAIR,
] as const

export function registerSearchHandlers(server: RpcServer, deps: HandlerDeps): void {
  server.handle(RPC_CHANNELS.search.QUERY, async (_ctx, request: { workspaceId: string; query: string; projectId?: string; limit?: number }) => {
    const workspace = getWorkspaceByNameOrId(request.workspaceId)
    if (!workspace) throw new Error(`Workspace not found: ${request.workspaceId}`)
    await deps.sessionManager.waitForInit()
    const sessionHeaders = deps.sessionManager.getSessions(workspace.id).filter(session => !session.hidden)
    const sessions = await Promise.all(sessionHeaders.slice(0, 200).map(async session => {
      const loaded = await deps.sessionManager.getSession(session.id)
      return { id: session.id, title: session.name || session.preview || 'Untitled session', messages: (loaded?.messages ?? []).map(message => message.content || ''), updatedAt: session.lastMessageAt, projectId: session.projectId }
    }))
    const { loadWorkspaceProjects } = await import('@craft-agent/shared/projects')
    const projects = loadWorkspaceProjects(workspace.rootPath).map(project => ({ id: project.config.id, title: project.config.name, description: project.config.description, updatedAt: project.config.updatedAt ?? project.config.createdAt }))
    const { loadAllSkills } = await import('@craft-agent/shared/skills')
    const skills = loadAllSkills(workspace.rootPath).map(skill => ({ id: skill.slug, title: skill.metadata.displayName || skill.metadata.name || skill.slug, description: skill.metadata.shortDescription || skill.metadata.description, updatedAt: 0 }))
    const { listExperts } = await import('@craft-agent/shared/experts')
    const experts = listExperts(workspace.rootPath).map(expert => ({ id: expert.id, title: expert.name, description: expert.description, updatedAt: expert.updatedAt }))
    const browserHistory = deps.browserPaneManager?.listHistory?.(workspace.id, 500).map(entry => ({ id: entry.id, title: entry.title || entry.url, url: entry.url, visitedAt: entry.visitedAt }))
    const settingCommands = [
      ['app', 'App settings'], ['ai', 'AI and Memory settings'], ['appearance', 'Appearance settings'], ['workspace', 'Workspace settings'], ['privacy', 'Privacy settings'], ['preferences', 'User Memory settings'],
    ].map(([id, title]) => ({ id, title, keywords: title.toLowerCase().split(/\s+/) }))
    indexSearchSources(workspace.rootPath, workspace.id, { sessions, projects, skills, experts, browserHistory, settingCommands })
    const entries = searchLocalIndex(workspace.rootPath, { query: request.query, workspaceId: workspace.id, projectId: request.projectId, includeGlobal: true, limit: request.limit ?? 50 })
    return { entries, groups: groupSearchResults(entries) }
  })
  server.handle(RPC_CHANNELS.search.REPAIR, async (_ctx, workspaceId: string) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) throw new Error(`Workspace not found: ${workspaceId}`)
    return repairSearchIndex(workspace.rootPath)
  })
}
