/**
 * LibraryDocumentPage — edit / preview / versions / sources / export for a library document.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAtomValue } from 'jotai'
import {
  Archive,
  ChevronDown,
  Copy,
  Download,
  Eye,
  FolderKanban,
  History,
  Link2,
  Info,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  Save,
} from 'lucide-react'
import { Markdown, TiptapMarkdownEditor } from '@craft-agent/ui'
import type {
  DocumentVersionMeta,
  LibraryDocumentDto,
  LibraryExportFormat,
} from '@craft-agent/shared/protocol'
import {
  detachSectionAnchorsForEdit,
  DOCUMENT_LEVEL_SECTION_ID,
  reattachSectionAnchorsOnSave,
  stripSectionAnchors,
  type DetachedSection,
} from '@craft-agent/shared/library'
import { cn } from '@/lib/utils'
import { navigate, routes } from '@/lib/navigate'
import { toast } from 'sonner'
import { projectsAtom } from '@/atoms/projects'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  StyledDropdownMenuContent,
  StyledDropdownMenuItem,
} from '@/components/ui/styled-dropdown'
import { LibraryDeleteConfirmDialog } from './LibraryDeleteConfirmDialog'
import { HeaderIconButton } from '@/components/ui/HeaderIconButton'

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

function sanitizeFilename(title: string): string {
  return (title || 'document').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 120)
}

export function LibraryDocumentPage({
  workspaceId,
  documentId,
}: {
  workspaceId: string
  documentId: string
}) {
  const { t, i18n } = useTranslation()
  const [doc, setDoc] = useState<LibraryDocumentDto | null>(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [mode, setMode] = useState<'edit' | 'preview'>('edit')
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [versions, setVersions] = useState<DocumentVersionMeta[]>([])
  const [showVersions, setShowVersions] = useState(false)
  const [showInfo, setShowInfo] = useState(false)
  const [versionPreview, setVersionPreview] = useState<{ id: string; body: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editorKey, setEditorKey] = useState(0)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const loadedRef = useRef(false)
  const sectionsRef = useRef<DetachedSection[]>([])

  const editorContent = useMemo(() => {
    const detached = detachSectionAnchorsForEdit(body)
    sectionsRef.current = detached.sections
    return detached.content
  }, [body, editorKey])

  // Resolve the project this document belongs to (read-only display of the
  // existing projectId — no new association logic).
  const projects = useAtomValue(projectsAtom)
  const boundProject = useMemo(() => {
    const pid = doc?.meta.projectId
    return pid ? projects.find((p) => p.config.id === pid) : undefined
  }, [doc?.meta.projectId, projects])

  const load = useCallback(async () => {
    const next = await window.electronAPI.getLibraryDocument({ workspaceId, documentId })
    if (!next) {
      setError(t('library.documentNotFound'))
      return
    }
    setDoc(next)
    setTitle(next.meta.title)
    setBody(next.body)
    loadedRef.current = true
    setEditorKey((k) => k + 1)
    const vers = await window.electronAPI.listLibraryVersions({ workspaceId, documentId })
    setVersions(vers)
  }, [documentId, t, workspaceId])

  useEffect(() => {
    loadedRef.current = false
    void load()
  }, [load])

  const persist = useCallback(async (nextTitle: string, nextBody: string, createVersion = false) => {
    setSaveState('saving')
    try {
      const updated = await window.electronAPI.updateLibraryDocument({
        workspaceId,
        documentId,
        title: nextTitle,
        body: nextBody,
        createVersion,
        versionSummary: createVersion ? t('library.manualVersion') : undefined,
      })
      if (updated) {
        setDoc(updated)
        setSaveState('saved')
        if (createVersion) {
          setVersions(await window.electronAPI.listLibraryVersions({ workspaceId, documentId }))
        }
      } else {
        setSaveState('error')
      }
    } catch {
      setSaveState('error')
    }
  }, [documentId, t, workspaceId])

  const scheduleSave = useCallback((nextTitle: string, nextBody: string) => {
    if (!loadedRef.current) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      void persist(nextTitle, nextBody, false)
    }, 800)
  }, [persist])

  const onEditorChange = (markdown: string) => {
    const { body: restored, sections, orphanedSectionIds } = reattachSectionAnchorsOnSave(
      markdown,
      sectionsRef.current,
    )
    sectionsRef.current = sections
    setBody(restored)
    // Mark orphaned sections in meta on next persist via body extractSectionIds in service
    void orphanedSectionIds
    scheduleSave(title, restored)
  }

  const openSession = (sessionId: string) => {
    navigate(routes.view.allSessions(sessionId))
  }

  const copyMarkdown = async () => {
    await navigator.clipboard.writeText(stripSectionAnchors(body))
    toast.success(t('library.copied'))
  }

  const downloadBlob = (content: string | Uint8Array, filename: string, mime: string) => {
    const blob = typeof content === 'string'
      ? new Blob([content], { type: mime })
      : new Blob([content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength) as ArrayBuffer], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  const exportDoc = async (format: LibraryExportFormat) => {
    const toastId = toast.loading(
      format === 'pdf' ? t('library.exportingPdf')
        : format === 'html' ? t('library.exportingHtml')
          : t('library.exportingMarkdown'),
    )
    try {
      const result = await window.electronAPI.exportLibraryDocument({
        workspaceId,
        documentId,
        format,
        keepSourceMarkers: false,
        theme: 'light',
      })
      if (result.canceled) {
        toast.dismiss(toastId)
        return
      }
      if (result.error) {
        toast.error(t('library.exportFailed', { detail: result.error }), { id: toastId })
        return
      }
      const base = sanitizeFilename(title)
      if (format === 'markdown') {
        downloadBlob(result.markdown || stripSectionAnchors(body), `${base}.md`, 'text/markdown;charset=utf-8')
      } else if (format === 'html') {
        downloadBlob(result.html || '', `${base}.html`, 'text/html;charset=utf-8')
      } else if (format === 'pdf') {
        if (result.pdfBase64) {
          const bin = Uint8Array.from(atob(result.pdfBase64), (c) => c.charCodeAt(0))
          downloadBlob(bin, `${base}.pdf`, 'application/pdf')
        } else {
          toast.error(t('library.exportFailed', { detail: 'pdf_empty' }), { id: toastId })
          return
        }
      }
      toast.success(t('library.exportDone'), { id: toastId })
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      toast.error(t('library.exportFailed', { detail }), { id: toastId })
    }
  }

  const archiveToggle = async () => {
    if (!doc) return
    if (doc.meta.status === 'archived') {
      await window.electronAPI.unarchiveLibraryDocument({ workspaceId, documentId })
    } else {
      await window.electronAPI.archiveLibraryDocument({ workspaceId, documentId })
    }
    await load()
  }

  const restoreVersion = async (versionId: string) => {
    const updated = await window.electronAPI.restoreLibraryVersion({ workspaceId, documentId, versionId })
    if (updated) {
      setDoc(updated)
      setTitle(updated.meta.title)
      setBody(updated.body)
      setVersionPreview(null)
      setEditorKey((k) => k + 1)
      setVersions(await window.electronAPI.listLibraryVersions({ workspaceId, documentId }))
    }
  }

  if (error) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{error}</div>
  }
  if (!doc) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{t('library.loading')}</div>
  }

  const gen = doc.meta.generation
  const sourceRefs = doc.meta.sourceReferences
  const docLevel = sourceRefs.find((r) => r.documentLevel || r.sectionId === DOCUMENT_LEVEL_SECTION_ID)
  const sectionSources = sourceRefs.filter((r) => !r.documentLevel && r.sectionId !== DOCUMENT_LEVEL_SECTION_ID && r.messageIds.length > 0)

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-[50px] items-center gap-2 border-b border-border/50 px-3">
        <input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value)
            scheduleSave(e.target.value, body)
          }}
          className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none"
        />
        <span className="text-[11px] text-muted-foreground">
          {saveState === 'saving' && t('library.saving')}
          {saveState === 'saved' && t('library.saved')}
          {saveState === 'error' && t('library.saveFailed')}
          {saveState === 'idle' && new Intl.DateTimeFormat(i18n.resolvedLanguage ?? i18n.language, {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
          }).format(doc.meta.updatedAt)}
        </span>
        <HeaderIconButton
          icon={mode === 'edit' ? <Eye className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
          tooltip={mode === 'edit' ? t('library.preview') : t('library.edit')}
          onClick={() => setMode(value => value === 'edit' ? 'preview' : 'edit')}
          className={cn(mode === 'preview' && 'bg-foreground/[0.05] text-foreground')}
        />
        <HeaderIconButton
          icon={<History className="h-4 w-4" />}
          tooltip={t('library.versions')}
          onClick={() => {
            setShowVersions(value => !value)
            setShowInfo(true)
          }}
          className={cn(showVersions && 'bg-foreground/[0.05] text-foreground')}
        />
        <HeaderIconButton
          icon={<Info className="h-4 w-4" />}
          tooltip="文档信息"
          onClick={() => setShowInfo(value => !value)}
          className={cn(showInfo && 'bg-foreground/[0.05] text-foreground')}
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <HeaderIconButton icon={<MoreHorizontal className="h-4 w-4" />} tooltip="更多" />
          </DropdownMenuTrigger>
          <StyledDropdownMenuContent align="end">
            <StyledDropdownMenuItem onClick={() => { void persist(title, body, true) }}>
              <Save className="mr-2 h-3.5 w-3.5" />{t('library.saveVersion')}
            </StyledDropdownMenuItem>
            <StyledDropdownMenuItem onClick={() => { void copyMarkdown() }}>
              <Copy className="mr-2 h-3.5 w-3.5" />{t('library.copyMarkdown')}
            </StyledDropdownMenuItem>
            <StyledDropdownMenuItem onClick={() => { void exportDoc('markdown') }}>
              <Download className="mr-2 h-3.5 w-3.5" />{t('library.export')} Markdown
            </StyledDropdownMenuItem>
            <StyledDropdownMenuItem onClick={() => { void exportDoc('html') }}>
              <Download className="mr-2 h-3.5 w-3.5" />{t('library.export')} HTML
            </StyledDropdownMenuItem>
            <StyledDropdownMenuItem onClick={() => { void exportDoc('pdf') }}>
              <Download className="mr-2 h-3.5 w-3.5" />{t('library.export')} PDF
            </StyledDropdownMenuItem>
            <StyledDropdownMenuItem onClick={() => { void archiveToggle() }}>
              <Archive className="mr-2 h-3.5 w-3.5" />
              {doc.meta.status === 'archived' ? t('library.unarchive') : t('library.archive')}
            </StyledDropdownMenuItem>
            <StyledDropdownMenuItem className="text-destructive" onClick={() => setDeleteOpen(true)}>
              {t('library.delete')}
            </StyledDropdownMenuItem>
          </StyledDropdownMenuContent>
        </DropdownMenu>
      </div>

      <LibraryDeleteConfirmDialog
        open={deleteOpen}
        documentTitle={title}
        onOpenChange={setDeleteOpen}
        onConfirm={async () => {
          const result = await window.electronAPI.deleteLibraryDocument({ workspaceId, documentId })
          if (result?.ok) navigate(routes.view.library())
        }}
      />

      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-y-auto">
          <div className="library-doc-surface mx-auto max-w-[46rem] px-6 py-8">
            {versionPreview ? (
              <div>
                <div className="mb-3 flex items-center gap-2">
                  <p className="text-xs text-muted-foreground">{t('library.versionPreview')}</p>
                  <button type="button" className="text-xs text-accent" onClick={() => { void restoreVersion(versionPreview.id) }}>
                    <RotateCcw className="mr-1 inline h-3 w-3" />{t('library.restoreVersion')}
                  </button>
                  <button type="button" className="text-xs text-muted-foreground" onClick={() => setVersionPreview(null)}>{t('common.close')}</button>
                </div>
                <Markdown mode="minimal">{stripSectionAnchors(versionPreview.body)}</Markdown>
              </div>
            ) : mode === 'preview' ? (
              <Markdown mode="minimal">{stripSectionAnchors(body)}</Markdown>
            ) : (
              <TiptapMarkdownEditor
                key={`${documentId}-${editorKey}`}
                content={editorContent}
                onUpdate={onEditorChange}
                placeholder={t('library.editorPlaceholder')}
                className="library-doc-editor"
              />
            )}
          </div>
        </div>

        {showInfo && <aside className="w-72 shrink-0 overflow-y-auto border-l border-border/50 bg-background p-3">
          {doc?.meta.projectId && (
            <>
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-foreground">
                <FolderKanban className="h-3.5 w-3.5" />
                {t('library.projectLabel')}
              </h3>
              <button
                type="button"
                disabled={!boundProject}
                onClick={() => boundProject && navigate(routes.view.projects(boundProject.config.slug))}
                className="mb-3 block w-full rounded-control border border-border/40 px-2 py-1.5 text-left text-xs hover:bg-foreground/[0.04] disabled:cursor-default disabled:opacity-60"
              >
                <span className="flex items-center gap-1.5">
                  {boundProject?.config.color && (
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: boundProject.config.color }}
                    />
                  )}
                  <span className="truncate font-medium">
                    {boundProject?.config.name ?? doc.meta.projectId}
                  </span>
                </span>
                {!boundProject && (
                  <span className="mt-0.5 block text-[10px] text-muted-foreground">
                    {t('library.projectUnbound', { defaultValue: 'Project no longer exists' })}
                  </span>
                )}
              </button>
            </>
          )}

          {gen && (
            <>
              <h3 className="mb-2 text-xs font-medium text-foreground">{t('library.generationInfo')}</h3>
              <div className="mb-3 space-y-1 rounded-control border border-border/40 px-2 py-1.5 text-[11px] text-muted-foreground">
                <p>{t('library.generationMode')}: {
                  gen.mode === 'ai' ? t('library.generationModeAi')
                    : gen.mode === 'preserve' ? t('library.generationModePreserve')
                      : t('library.generationModeFallback')
                }</p>
                {gen.modelId && <p>{t('library.generationModel')}: {gen.modelId}</p>}
                <p>{t('library.generationSources', {
                  used: gen.sourceMessageCount,
                  total: gen.totalMessageCount,
                })}</p>
                <p>{t('library.generationTime')}: {new Intl.DateTimeFormat(i18n.resolvedLanguage ?? i18n.language, {
                  dateStyle: 'short', timeStyle: 'short',
                }).format(gen.generatedAt)}</p>
                <p>{t('library.generationQuality')}: {
                  gen.qualityStatus === 'passed' ? t('library.qualityPassed')
                    : gen.qualityStatus === 'retried' ? t('library.qualityRetried')
                      : t('library.qualityFallback')
                }</p>
                {gen.mode === 'excerpt_fallback' && (
                  <p className="text-amber-700 dark:text-amber-400">{t('library.aiFallbackWarning')}</p>
                )}
                {gen.truncated && <p>{t('library.generationTruncated')}</p>}
              </div>
            </>
          )}

          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-foreground">
            <Link2 className="h-3.5 w-3.5" />
            {t('library.linkedSessions')}
          </h3>
          {doc.meta.sessionLinks.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">{t('library.noLinkedSessions')}</p>
          ) : (
            doc.meta.sessionLinks.map((link) => (
              <button
                key={link.id}
                type="button"
                disabled={link.orphaned}
                onClick={() => openSession(link.sessionId)}
                className="mb-1.5 block w-full rounded-control px-2 py-1.5 text-left text-xs hover:bg-foreground/[0.04] disabled:opacity-50"
              >
                <span className="font-medium">{link.orphaned ? t('library.sessionDeleted') : (link.sessionTitleSnapshot || link.sessionId)}</span>
                <span className="mt-0.5 block text-[10px] text-muted-foreground">
                  {new Intl.DateTimeFormat(i18n.resolvedLanguage ?? i18n.language, {
                    month: 'short', day: 'numeric',
                  }).format(link.linkedAt)}
                </span>
              </button>
            ))
          )}

          <h3 className="mb-2 mt-4 text-xs font-medium text-foreground">{t('library.sourceSections')}</h3>
          {docLevel ? (
            <div className="mb-2 rounded-control border border-border/40 px-2 py-1.5 text-[11px]">
              <p className="font-medium">{t('library.documentLevelSource')}</p>
              <p className="text-muted-foreground">
                {t('library.messageCount', { count: docLevel.messageIds.length })}
              </p>
              {!docLevel.orphaned && (
                <button type="button" className="mt-1 text-accent" onClick={() => openSession(docLevel.sessionId)}>
                  {t('library.openSession')}
                </button>
              )}
            </div>
          ) : sectionSources.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">{t('library.noSources')}</p>
          ) : (
            sectionSources.map((ref) => (
              <div key={ref.sectionId} className="mb-2 rounded-control border border-border/40 px-2 py-1.5 text-[11px]">
                <p className="font-medium">{ref.headingSnapshot || ref.sectionId}</p>
                <p className="text-muted-foreground">
                  {t('library.messageCount', { count: ref.messageIds.length })}
                  {ref.orphaned ? ` · ${t('library.orphaned')}` : ''}
                </p>
                {!ref.orphaned && (
                  <button type="button" className="mt-1 text-accent" onClick={() => openSession(ref.sessionId)}>
                    {t('library.openSession')}
                  </button>
                )}
              </div>
            ))
          )}

          {showVersions && (
            <>
              <h3 className="mb-2 mt-4 text-xs font-medium text-foreground">{t('library.versions')}</h3>
              {versions.map((ver) => (
                <button
                  key={ver.id}
                  type="button"
                  className="mb-1 block w-full rounded-control px-2 py-1.5 text-left text-[11px] hover:bg-foreground/[0.04]"
                  onClick={async () => {
                    const v = await window.electronAPI.getLibraryVersion({ workspaceId, documentId, versionId: ver.id })
                    if (v) setVersionPreview({ id: ver.id, body: v.body })
                  }}
                >
                  <span className="font-medium">{ver.summary}</span>
                  <span className="mt-0.5 block text-muted-foreground">
                    {ver.op}
                    {' · '}
                    {new Intl.DateTimeFormat(i18n.resolvedLanguage ?? i18n.language, {
                      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                    }).format(ver.createdAt)}
                  </span>
                </button>
              ))}
            </>
          )}
        </aside>}
      </div>
    </div>
  )
}
