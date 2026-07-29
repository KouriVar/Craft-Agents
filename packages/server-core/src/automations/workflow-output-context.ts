import { getLibraryService } from '../library/LibraryService.ts'
import { loadProjectById, uploadProjectAsset } from '@craft-agent/shared/projects'
import type { WorkflowRunContext, WorkflowNode } from '@craft-agent/shared/automations'

/**
 * Server-side sink for executable Workflow output nodes. It deliberately stores
 * only references in a run result; document/file bodies remain in their owning
 * Library/Project stores rather than the automation config or run index.
 */
export function createWorkflowOutputContext(input: {
  workspaceRoot: string
  workspaceId: string
  projectId?: string
}): Pick<WorkflowRunContext, 'writeOutput'> {
  return {
    async writeOutput(node: Extract<WorkflowNode, { type: 'output' }>) {
      if (node.outputKind === 'knowledge') {
        const service = getLibraryService(input.workspaceRoot, input.workspaceId)
        const doc = service.createBlank({ workspaceId: input.workspaceId, title: node.name, projectId: input.projectId })
        const updated = service.update({ workspaceId: input.workspaceId, documentId: doc.meta.id, body: `# ${node.name}\n\n${node.content}\n`, createVersion: true, versionSummary: 'Automation workflow output' })
        if (!updated) throw new Error(`Could not write knowledge output: ${doc.meta.id}`)
        return { id: updated.meta.id }
      }
      if (!input.projectId) throw new Error('Project-file output requires a project')
      const project = loadProjectById(input.workspaceRoot, input.projectId)
      if (!project) throw new Error(`Project not found: ${input.projectId}`)
      const asset = uploadProjectAsset(input.workspaceRoot, project.config.slug, { filename: node.name, text: node.content })
      return { id: asset.filename, path: asset.absolutePath }
    },
  }
}
