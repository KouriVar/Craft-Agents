import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import { getDefaultStore } from 'jotai'
import type { LoadedProject } from '@craft-agent/shared/projects/types'
import { projectsAtom } from '@/atoms/projects'
import { sessionMetaMapAtom, type SessionMeta } from '@/atoms/sessions'
import { buildActionContext } from '../build-action-context'
import {
  registerDefaultContextActions,
  resetDefaultContextActionsForTests,
} from '../register-defaults'
import { contextActionRegistry } from '../registry'
import { bindContextActionHost } from '../runtime-host'

function meta(partial: Partial<SessionMeta> & { id: string }): SessionMeta {
  return {
    workspaceId: 'ws-1',
    ...partial,
  }
}

function project(id: string, slug = id): LoadedProject {
  return {
    config: {
      id,
      slug,
      name: slug,
      createdAt: 1,
      updatedAt: 1,
    },
    folderPath: `/tmp/${slug}`,
    assetsPath: `/tmp/${slug}/assets`,
    workspaceRootPath: '/tmp/ws',
    workspaceId: 'ws-1',
  }
}

describe('project.open + library.export', () => {
  const listLibraryDocuments = mock(async () => [] as Array<{ id: string; title: string }>)
  const exportLibraryDocument = mock(async () => ({
    markdown: '# exported',
    canceled: false,
  }))
  const dispatched: string[] = []

  beforeEach(() => {
    resetDefaultContextActionsForTests()
    registerDefaultContextActions()
    listLibraryDocuments.mockReset()
    exportLibraryDocument.mockReset()
    listLibraryDocuments.mockResolvedValue([])
    exportLibraryDocument.mockResolvedValue({ markdown: '# exported', canceled: false })
    dispatched.length = 0
    bindContextActionHost({
      sendMessage: () => {},
      startLibraryFromSession: async () => {},
    })

    ;(globalThis as { window?: unknown }).window = {
      electronAPI: {
        listLibraryDocuments,
        exportLibraryDocument,
        sessionCommand: async () => {},
      },
      dispatchEvent: (event: Event) => {
        const detail = (event as CustomEvent<{ route?: string }>).detail
        if (detail?.route) dispatched.push(detail.route)
        return true
      },
    }

    // Minimal DOM stubs for markdown download path.
    Object.defineProperty(globalThis, 'document', {
      value: {
        createElement: () => ({
          href: '',
          download: '',
          click: () => {},
        }),
      },
      configurable: true,
    })
    Object.defineProperty(globalThis, 'URL', {
      value: {
        createObjectURL: () => 'blob:mock',
        revokeObjectURL: () => {},
      },
      configurable: true,
    })
    Object.defineProperty(globalThis, 'Blob', {
      value: class Blob {
        constructor(_parts?: unknown[], _opts?: unknown) {}
      },
      configurable: true,
    })

    getDefaultStore().set(projectsAtom, [project('proj_a', 'alpha')])
    getDefaultStore().set(sessionMetaMapAtom, new Map([
      ['s1', meta({ id: 's1', projectId: 'proj_a' })],
    ]))
  })

  afterEach(() => {
    bindContextActionHost(null)
    resetDefaultContextActionsForTests()
  })

  it('shows project.open only when projectId is present', () => {
    const withProject = buildActionContext({
      workspaceId: 'ws-1',
      projectId: 'proj_a',
      projects: [project('proj_a', 'alpha')],
    })
    expect(
      contextActionRegistry.listForSurface('dropdown', withProject).map((a) => a.id),
    ).toContain('project.open')

    const withoutProject = buildActionContext({ workspaceId: 'ws-1', projects: [] })
    expect(
      contextActionRegistry.listForSurface('dropdown', withoutProject).map((a) => a.id),
    ).not.toContain('project.open')
  })

  it('project.open navigates to ProjectInfoPage via routes.view.projects', async () => {
    const context = buildActionContext({
      workspaceId: 'ws-1',
      projectId: 'proj_a',
      projects: [project('proj_a', 'alpha')],
    })
    await contextActionRegistry.run('project.open', context)
    expect(dispatched).toContain('projects/project/alpha')
  })

  it('hides library.export without an exportable document target', () => {
    const context = buildActionContext({
      workspaceId: 'ws-1',
      sessionId: 's1',
      session: meta({ id: 's1', projectId: 'proj_a' }),
    })
    expect(context.documentId).toBeUndefined()
    expect(
      contextActionRegistry.listForSurface('dropdown', context).map((a) => a.id),
    ).not.toContain('library.export')
  })

  it('shows library.export when documentId is present and runs exportLibraryDocument', async () => {
    const context = buildActionContext({
      workspaceId: 'ws-1',
      documentId: 'doc_1',
    })
    expect(
      contextActionRegistry.listForSurface('dropdown', context).map((a) => a.id),
    ).toContain('library.export')

    await contextActionRegistry.run('library.export', context, { title: 'Notes' })
    expect(exportLibraryDocument).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      documentId: 'doc_1',
      keepSourceMarkers: false,
    })
  })

  it('registry run chain covers both new actions', async () => {
    const context = buildActionContext({
      workspaceId: 'ws-1',
      projectId: 'proj_a',
      documentId: 'doc_2',
      projects: [project('proj_a', 'alpha')],
    })
    const ids = contextActionRegistry.listForSurface('dropdown', context).map((a) => a.id)
    expect(ids).toContain('project.open')
    expect(ids).toContain('library.export')

    await contextActionRegistry.run('project.open', context)
    await contextActionRegistry.run('library.export', context)
    expect(dispatched.length).toBeGreaterThan(0)
    expect(exportLibraryDocument).toHaveBeenCalledTimes(1)
  })
})
