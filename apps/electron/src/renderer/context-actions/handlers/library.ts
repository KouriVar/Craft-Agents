/**
 * Library context-action handlers — reuse createDocumentFromSession / exportLibraryDocument.
 */

import i18n from 'i18next'
import { toast } from 'sonner'
import type { LibraryIndexEntry } from '@craft-agent/shared/protocol'
import { requireContextActionHost } from '../runtime-host'
import type { ActionContext, ContextAction, ContextActionPayload } from '../types'

export async function runLibraryCreateFromSession(
  context: ActionContext,
  _payload?: ContextActionPayload,
): Promise<void> {
  if (!context.sessionId || !context.workspaceId) return
  await requireContextActionHost().startLibraryFromSession(context.sessionId)
}

/**
 * Resolve an exportable library document for the current context.
 * Preference: explicit documentId → project recent → session-linked search.
 */
export async function resolveLibraryExportTarget(options: {
  workspaceId: string
  documentId?: string | null
  sessionId?: string | null
  projectId?: string | null
}): Promise<Pick<LibraryIndexEntry, 'id' | 'title'> | null> {
  const workspaceId = options.workspaceId?.trim()
  if (!workspaceId) return null

  if (options.documentId?.trim()) {
    return { id: options.documentId.trim(), title: 'document' }
  }

  if (options.projectId?.trim()) {
    const projectDocs = await window.electronAPI.listLibraryDocuments({
      workspaceId,
      projectId: options.projectId.trim(),
      filter: 'recent',
      limit: 1,
    })
    if (projectDocs[0]) {
      return { id: projectDocs[0].id, title: projectDocs[0].title }
    }
  }

  if (options.sessionId?.trim()) {
    const sessionDocs = await window.electronAPI.listLibraryDocuments({
      workspaceId,
      filter: 'recent',
      search: options.sessionId.trim(),
      limit: 5,
    })
    if (sessionDocs[0]) {
      return { id: sessionDocs[0].id, title: sessionDocs[0].title }
    }
  }

  return null
}

function downloadMarkdown(markdown: string, title: string): void {
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${(title || 'document').replace(/[<>:"/\\|?*]/g, '_')}.md`
  a.click()
  URL.revokeObjectURL(url)
}

export async function runLibraryExport(
  context: ActionContext,
  payload?: ContextActionPayload,
): Promise<void> {
  if (!context.workspaceId) return

  const explicitId = typeof payload?.documentId === 'string' ? payload.documentId : undefined
  const target = explicitId
    ? { id: explicitId, title: typeof payload?.title === 'string' ? payload.title : 'document' }
    : context.documentId
      ? { id: context.documentId, title: typeof payload?.title === 'string' ? payload.title : 'document' }
      : await resolveLibraryExportTarget({
          workspaceId: context.workspaceId,
          sessionId: context.sessionId,
          projectId: context.projectId,
        })

  if (!target) return

  try {
    const result = await window.electronAPI.exportLibraryDocument({
      workspaceId: context.workspaceId,
      documentId: target.id,
      keepSourceMarkers: false,
    })
    if (result.canceled) return
    if (result.error) {
      toast.error(i18n.t('library.exportFailed', { detail: result.error }))
      return
    }
    const markdown = result.markdown
    if (!markdown) {
      toast.error(i18n.t('library.exportFailed', { detail: 'empty' }))
      return
    }
    downloadMarkdown(markdown, target.title)
    toast.success(i18n.t('library.exportDone'))
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    toast.error(i18n.t('library.exportFailed', { detail }))
  }
}

export const libraryCreateFromSessionAction: ContextAction = {
  id: 'library.createFromSession',
  group: 'library',
  labelKey: 'contextActions.library.createFromSession',
  icon: 'FileText',
  surfaces: ['dropdown', 'command-menu'],
  isAvailable: (context) => context.flags.canCreateLibraryFromSession,
  run: runLibraryCreateFromSession,
}

export const libraryExportAction: ContextAction = {
  id: 'library.export',
  group: 'library',
  labelKey: 'contextActions.library.export',
  icon: 'Download',
  surfaces: ['dropdown', 'command-menu'],
  isAvailable: (context) => Boolean(context.documentId),
  run: runLibraryExport,
}
