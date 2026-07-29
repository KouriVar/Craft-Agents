/**
 * ProjectInfoPage
 *
 * Workspace-project detail page with sessions, assets, memory, and settings.
 */

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { useEffect, useState, useCallback, useMemo } from 'react'
import { useAtomValue } from 'jotai'
import { FolderKanban, FolderOpen, Play, Plus, Trash2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { useActiveWorkspace, useAppShellContext } from '@/context/AppShellContext'
import { navigate, routes } from '@/lib/navigate'
import { sessionMetaMapAtom } from '@/atoms/sessions'
import { browserWorkspaceTabsAtom } from '@/atoms/browser-workspace'
import { automationsAtom } from '@/atoms/automations'
import { buildContinueTaskPrompt, findProjectResumeSession } from '@/lib/project-resume'
import { findProjectBrowserTabs } from '@/lib/project-browser-tabs'
import { setLastActiveProjectId } from '@/lib/last-active-project'
import {
  Info_Page,
  Info_Section,
  Info_Table,
} from '@/components/info'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@craft-agent/ui'
import { cn } from '@/lib/utils'
import { PROJECT_COLOR_PALETTE } from '@/utils/project-colors'
import { InlineColorPickerRow } from '@/components/ui/inline-color-picker-row'
import { EditPopover, getEditConfig } from '@/components/ui/EditPopover'
import type { LoadedProject, ProjectAsset } from '@craft-agent/shared/projects/types'
import type { ExpertProfile } from '@craft-agent/shared/experts'
import type { LibraryIndexEntry, CognitionEventSummary } from '@craft-agent/shared/protocol'
import type { PausedProjectAutomation } from '@craft-agent/shared/automations'

interface ProjectInfoPageProps {
  projectSlug: string
}

type TabKey = 'sessions' | 'knowledge' | 'files' | 'automations' | 'settings'

export default function ProjectInfoPage({ projectSlug }: ProjectInfoPageProps) {
  const { t } = useTranslation()
  const workspace = useActiveWorkspace()
  const workspaceId = workspace?.id
  const sessionMetaMap = useAtomValue(sessionMetaMapAtom)
  const browserTabs = useAtomValue(browserWorkspaceTabsAtom)
  const automations = useAtomValue(automationsAtom)
  const { onCreateSession, onOpenFile, onSendMessage } = useAppShellContext()

  const [project, setProject] = useState<LoadedProject | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<TabKey>('sessions')
  const [assets, setAssets] = useState<ProjectAsset[]>([])
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editWorkingDir, setEditWorkingDir] = useState('')
  const [editDetails, setEditDetails] = useState('')
  const [editColor, setEditColor] = useState<string>('')
  const [experts, setExperts] = useState<ExpertProfile[]>([])
  const [editDefaultExpertId, setEditDefaultExpertId] = useState('')
  const [editAvailableExpertIds, setEditAvailableExpertIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [memory, setMemory] = useState('')
  const [memoryLoaded, setMemoryLoaded] = useState(false)
  const [memorySaving, setMemorySaving] = useState(false)
  const [restoreCandidates, setRestoreCandidates] = useState<PausedProjectAutomation[] | null>(null)
  const [restoreSelection, setRestoreSelection] = useState<string[]>([])
  const [activity, setActivity] = useState<{
    docs: LibraryIndexEntry[]
    events: CognitionEventSummary[]
    loadedFor: string | null
    loading: boolean
  }>({ docs: [], events: [], loadedFor: null, loading: false })

  // Load project (and re-load on broadcast)
  const loadProject = useCallback(async () => {
    if (!workspaceId) return
    setLoading(true)
    setError(null)
    try {
      const result = await window.electronAPI.getProject(workspaceId, projectSlug)
      if (!result) {
        setError(t('projectInfo.notFound'))
        setProject(null)
        return
      }
      const loaded = result as LoadedProject
      setProject(loaded)
      setEditName(loaded.config.name)
      setEditDescription(loaded.config.description ?? '')
      setEditWorkingDir(loaded.config.workingDirectory ?? '')
      setEditDetails(loaded.config.details ?? '')
      setEditColor(loaded.config.color ?? '')
      setEditDefaultExpertId(loaded.config.defaultExpertId ?? '')
      setEditAvailableExpertIds(loaded.config.availableExpertIds ?? [])
      const availableExperts = await window.electronAPI.listExperts(workspaceId)
      setExperts(availableExperts)
      // Workspace-scoped pointer for Explore/Today "Continue project" (no launch routing).
      setLastActiveProjectId(workspaceId, loaded.config.id)
    } catch (err) {
      console.error('[ProjectInfoPage] Failed to load project:', err)
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [workspaceId, projectSlug, t])

  useEffect(() => {
    loadProject()
  }, [loadProject])

  useEffect(() => {
    if (!workspaceId) return
    const off = window.electronAPI.onProjectsChanged((wsId: string) => {
      if (wsId === workspaceId) loadProject()
    })
    return () => {
      if (typeof off === 'function') off()
    }
  }, [workspaceId, loadProject])

  // Load project files when entering the Files tab.
  const refreshAssets = useCallback(async () => {
    if (!workspaceId) return
    try {
      const list = await window.electronAPI.listProjectAssets(workspaceId, projectSlug)
      setAssets(Array.isArray(list) ? (list as ProjectAsset[]) : [])
    } catch (err) {
      console.error('[ProjectInfoPage] Failed to load assets:', err)
    }
  }, [workspaceId, projectSlug])

  useEffect(() => {
    if (tab === 'files') refreshAssets()
  }, [tab, refreshAssets])

  useEffect(() => {
    if (tab !== 'settings' || !workspaceId || memoryLoaded) return
    void window.electronAPI.getProjectMemory(workspaceId, projectSlug)
      .then((value) => { setMemory(value); setMemoryLoaded(true) })
      .catch((err) => toast.error(err instanceof Error ? err.message : String(err)))
  }, [memoryLoaded, projectSlug, tab, workspaceId])

  const handleSaveMemory = useCallback(async () => {
    if (!workspaceId) return
    setMemorySaving(true)
    try {
      await window.electronAPI.setProjectMemory(workspaceId, projectSlug, memory)
      toast.success(t('projectInfo.saved'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setMemorySaving(false)
    }
  }, [memory, projectSlug, t, workspaceId])

  const projectSessions = useMemo(() => {
    if (!project) return []
    const result: { id: string; name: string }[] = []
    for (const meta of sessionMetaMap.values()) {
      if ((meta as { projectId?: string }).projectId === project.config.id && !meta.parentSessionId) {
        result.push({ id: meta.id, name: meta.name ?? meta.id })
      }
    }
    return result
  }, [project, sessionMetaMap])

  const projectAutomations = useMemo(
    () => project ? automations.filter((automation) => automation.projectId === project.config.id) : [],
    [automations, project],
  )

  // Recent project sessions sorted by last activity (reuses sessionMetaMap,
  // no new session query). Falls back to createdAt when lastMessageAt is absent.
  const recentProjectSessions = useMemo(() => {
    if (!project) return [] as { id: string; name: string; ts: number }[]
    const result: { id: string; name: string; ts: number }[] = []
    for (const meta of sessionMetaMap.values()) {
      if ((meta as { projectId?: string }).projectId === project.config.id && !meta.parentSessionId) {
        result.push({
          id: meta.id,
          name: meta.name ?? meta.id,
          ts: meta.lastMessageAt ?? meta.createdAt ?? 0,
        })
      }
    }
    return result.sort((a, b) => b.ts - a.ts).slice(0, 5)
  }, [project, sessionMetaMap])

  // Resume card source: most recent unfinished session with goal/checkpoints.
  const resumeSession = useMemo(() => {
    if (!project) return null
    return findProjectResumeSession(sessionMetaMap.values(), project.config.id)
  }, [project, sessionMetaMap])

  const resumeCheckpoint = resumeSession?.taskCheckpoints?.at(-1)

  // Related browser tabs via ownerSessionId/boundSessionId → session.projectId
  // (read-time only; does not stamp or persist projectId on tabs).
  const relatedBrowserTabs = useMemo(() => {
    if (!project) return []
    return findProjectBrowserTabs(browserTabs, sessionMetaMap, project.config.id, { limit: 5 })
  }, [browserTabs, project, sessionMetaMap])

  const handleResumeContinue = useCallback(() => {
    if (!resumeSession) return
    const prompt = buildContinueTaskPrompt(resumeSession, t)
    navigate(routes.view.allSessions(resumeSession.id))
    onSendMessage(resumeSession.id, prompt)
  }, [onSendMessage, resumeSession, t])

  const handleResumeOpen = useCallback(() => {
    if (!resumeSession) return
    navigate(routes.view.allSessions(resumeSession.id))
  }, [resumeSession])

  // Project knowledge is a filtered view of the unified knowledge library.
  useEffect(() => {
    if (tab !== 'knowledge' || !workspaceId || !project) return
    if (activity.loadedFor === project.config.id) return
    let cancelled = false
    setActivity((prev) => ({ ...prev, loading: true }))
    void (async () => {
      try {
        const [docs, events] = await Promise.all([
          window.electronAPI.listLibraryDocuments({ workspaceId, projectId: project.config.id, filter: 'recent', limit: 5 }),
          window.electronAPI.listCognitionEvents({
            workspaceId,
            projectId: project.config.id,
          types: ['browser.page_opened'],
            limit: 5,
          }),
        ])
        if (cancelled) return
        setActivity({
          docs: docs as LibraryIndexEntry[],
          events: events as CognitionEventSummary[],
          loadedFor: project.config.id,
          loading: false,
        })
      } catch (err) {
        console.error('[ProjectInfoPage] Activity load failed:', err)
        if (!cancelled) setActivity({ docs: [], events: [], loadedFor: project.config.id, loading: false })
      }
    })()
    return () => { cancelled = true }
  }, [tab, workspaceId, project, activity.loadedFor])

  const handleStartSession = useCallback(async () => {
    if (!workspaceId || !project) return
    try {
      const session = await onCreateSession(workspaceId, { projectId: project.config.id })
      if (session?.id) {
        navigate(routes.view.allSessions(session.id))
      }
    } catch (err) {
      console.error('[ProjectInfoPage] Failed to create session:', err)
      toast.error(t('projectInfo.newSessionFailed'))
    }
  }, [workspaceId, project, onCreateSession, t])

  const handlePickWorkingDirectory = useCallback(async () => {
    try {
      const picked = await window.electronAPI.openFolderDialog?.()
      if (typeof picked === 'string' && picked.trim()) {
        setEditWorkingDir(picked)
      }
    } catch (err) {
      console.error('[ProjectInfoPage] Folder picker failed:', err)
    }
  }, [])

  const handleSaveSettings = useCallback(async () => {
    if (!workspaceId || !project) return
    setSaving(true)
    try {
      await window.electronAPI.updateProject(workspaceId, project.config.slug, {
        name: editName.trim() || project.config.name,
        description: editDescription.trim() || undefined,
        workingDirectory: editWorkingDir.trim() || undefined,
        details: editDetails.trim() || undefined,
        color: editColor.trim() || undefined,
        defaultExpertId: editDefaultExpertId || undefined,
        availableExpertIds: editAvailableExpertIds.length ? editAvailableExpertIds : undefined,
      })
      toast.success(t('projectInfo.saved'))
    } catch (err) {
      console.error('[ProjectInfoPage] Save failed:', err)
      toast.error(t('projectInfo.saveFailed'))
    } finally {
      setSaving(false)
    }
  }, [workspaceId, project, editName, editDescription, editWorkingDir, editDetails, editColor, editDefaultExpertId, editAvailableExpertIds, t])

  const handleDeleteProject = useCallback(async () => {
    if (!workspaceId || !project) return
    if (!window.confirm(t('projectInfo.deleteConfirm', { name: project.config.name }))) return
    try {
      await window.electronAPI.deleteProject(workspaceId, project.config.slug)
      navigate(routes.view.projects())
    } catch (err) {
      console.error('[ProjectInfoPage] Delete failed:', err)
      toast.error(t('projectInfo.deleteFailed'))
    }
  }, [workspaceId, project, t])

  const handleArchiveProject = useCallback(async () => {
    if (!workspaceId || !project) return
    try {
      const restoring = Boolean(project.config.archivedAt)
      await window.electronAPI.updateProject(workspaceId, project.config.slug, {
        archivedAt: project.config.archivedAt ? undefined : Date.now(),
      })
      if (restoring) {
        const candidates = await window.electronAPI.listPausedProjectAutomations(workspaceId, project.config.slug)
        setRestoreCandidates(candidates); setRestoreSelection(candidates.map((item) => item.id))
      }
      toast.success(project.config.archivedAt
        ? t('projectInfo.unarchived', { defaultValue: 'Project restored' })
        : t('projectInfo.archived', { defaultValue: 'Project archived' }))
      if (!restoring) navigate(routes.view.projects())
    } catch (err) {
      console.error('[ProjectInfoPage] Archive failed:', err)
      toast.error(t('projectInfo.saveFailed'))
    }
  }, [workspaceId, project, t])

  const handleUpload = useCallback(async (file: File) => {
    if (!workspaceId || !project) return
    try {
      const arrayBuffer = await file.arrayBuffer()
      const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)))
      await window.electronAPI.uploadProjectAsset(workspaceId, project.config.slug, {
        filename: file.name,
        base64,
      })
      await refreshAssets()
      toast.success(t('projectInfo.assetUploaded', { name: file.name }))
    } catch (err) {
      console.error('[ProjectInfoPage] Upload failed:', err)
      toast.error(t('projectInfo.uploadFailed'))
    }
  }, [workspaceId, project, refreshAssets, t])

  const handleDeleteAsset = useCallback(async (asset: ProjectAsset) => {
    if (!workspaceId || !project) return
    if (!window.confirm(t('projectInfo.deleteAssetConfirm', { name: asset.filename }))) return
    try {
      await window.electronAPI.deleteProjectAsset(workspaceId, project.config.slug, asset.filename)
      await refreshAssets()
    } catch (err) {
      console.error('[ProjectInfoPage] Asset delete failed:', err)
      toast.error(t('projectInfo.deleteAssetFailed'))
    }
  }, [workspaceId, project, refreshAssets, t])

  return (
    <>
    <Info_Page
      loading={loading}
      error={error ?? undefined}
      empty={!project && !loading && !error ? t('projectInfo.notFound') : undefined}
    >
      <Info_Page.Header title={project?.config.name ?? ''} />
      {project && (
        <Info_Page.Content>
          <Info_Page.Hero
            avatar={<FolderKanban className="h-6 w-6 text-foreground/60" />}
            title={project.config.name}
            tagline={project.config.description ?? t('projectInfo.taglineFallback')}
          />

          {/* Resume card — only when a project session has continuity data */}
          {resumeSession && (
            <section className="mx-2 mb-4 rounded-[10px] border border-border/60 bg-background p-3 shadow-minimal">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-xs font-semibold text-muted-foreground">
                    {t('projectInfo.resumeTitle')}
                  </h3>
                  <button
                    type="button"
                    onClick={handleResumeOpen}
                    className="mt-0.5 max-w-full truncate text-left text-[11px] text-muted-foreground hover:text-foreground hover:underline"
                  >
                    {t('projectInfo.resumeFromSession', {
                      name: resumeSession.name || resumeSession.preview || resumeSession.id,
                    })}
                  </button>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Button size="sm" variant="ghost" onClick={handleResumeOpen}>
                    {t('projectInfo.resumeOpenSession')}
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleResumeContinue}
                    disabled={resumeSession.isProcessing}
                  >
                    <Play className="mr-1 h-3.5 w-3.5" />
                    {t('taskContinuity.continue')}
                  </Button>
                </div>
              </div>

              {resumeSession.taskGoal?.trim() && (
                <div className="mt-3">
                  <div className="text-[10px] font-medium text-muted-foreground">
                    {t('taskContinuity.goal')}
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-foreground">
                    {resumeSession.taskGoal}
                  </p>
                </div>
              )}

              {resumeCheckpoint && (
                <div className="mt-3 border-t border-border/50 pt-3">
                  <div className="text-[10px] font-medium text-muted-foreground">
                    {t('taskContinuity.latestCheckpoint')}
                  </div>
                  <p className="mt-1 line-clamp-3 text-xs leading-5 text-foreground/80">
                    {resumeCheckpoint.summary}
                  </p>
                  {!!resumeCheckpoint.nextSteps?.length && (
                    <ul className="mt-2 space-y-1 text-[11px] leading-4 text-muted-foreground">
                      {resumeCheckpoint.nextSteps.slice(0, 3).map((item) => (
                        <li key={item}>· {item}</li>
                      ))}
                    </ul>
                  )}
                  {!!resumeCheckpoint.blockers?.length && (
                    <div className="mt-2 rounded-[7px] bg-amber-500/[0.07] px-2.5 py-2 text-[11px] leading-4 text-amber-800 dark:text-amber-200">
                      <span className="font-medium">{t('taskContinuity.blockers')}</span>
                      <span className="ml-1">{resumeCheckpoint.blockers.slice(0, 2).join(' · ')}</span>
                    </div>
                  )}
                </div>
              )}
            </section>
          )}

          {/* Tab bar */}
          <div className="flex items-center gap-1 border-b border-border/50 px-2 mb-4">
            <TabButton active={tab === 'sessions'} onClick={() => setTab('sessions')}>
              {t('projectInfo.tabSessions')}
            </TabButton>
            <TabButton active={tab === 'knowledge'} onClick={() => setTab('knowledge')}>
              {t('library.title', { defaultValue: 'Knowledge' })}
            </TabButton>
            <TabButton active={tab === 'files'} onClick={() => setTab('files')}>
              {t('projectInfo.tabFiles', { defaultValue: 'Files' })}
            </TabButton>
            <TabButton active={tab === 'automations'} onClick={() => setTab('automations')}>
              {t('sidebar.automations', { defaultValue: 'Automations' })}
            </TabButton>
            <TabButton active={tab === 'settings'} onClick={() => setTab('settings')}>
              {t('projectInfo.tabSettings')}
            </TabButton>
          </div>

          {/* Sessions tab */}
          {tab === 'sessions' && (
            <Info_Section
              title={t('projectInfo.tabSessions')}
              actions={
                <Button size="sm" variant="ghost" onClick={handleStartSession}>
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  {t('projectInfo.newSessionButton', { name: project.config.name })}
                </Button>
              }
            >
              {projectSessions.length === 0 ? (
                <div className="px-4 py-6 text-sm text-muted-foreground">
                  {t('projectInfo.noSessions')}
                </div>
              ) : (
                <ul className="divide-y divide-border/50">
                  {projectSessions.map((s) => (
                    <li key={s.id} className="px-4 py-2">
                      <button
                        type="button"
                        className="text-sm text-foreground hover:underline text-left"
                        onClick={() => navigate(routes.view.allSessions(s.id))}
                      >
                        {s.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Info_Section>
          )}

          {/* Files tab */}
          {tab === 'files' && (
            <Info_Section
              title={t('projectInfo.tabFiles', { defaultValue: 'Files' })}
              actions={
                <label
                  className="inline-flex items-center gap-1 h-7 px-3 text-xs font-medium rounded-[8px] bg-background shadow-minimal hover:bg-foreground/[0.03] transition-colors cursor-pointer"
                >
                  <Upload className="h-3.5 w-3.5" />
                  {t('projectInfo.uploadAssets')}
                  <input
                    type="file"
                    className="hidden"
                    multiple
                    onChange={async (e) => {
                      const files = Array.from(e.target.files ?? [])
                      for (const f of files) await handleUpload(f)
                      e.target.value = ''
                    }}
                  />
                </label>
              }
            >
              {assets.length === 0 ? (
                <div className="px-4 py-6 text-sm text-muted-foreground">
                  {t('projectInfo.noAssets')}
                </div>
              ) : (
                <ul className="divide-y divide-border/50">
                  {assets.map((a) => (
                    <li key={a.filename} className="px-4 py-2 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm truncate">{a.filename}</div>
                        <div className="text-xs text-foreground/50">
                          {(a.sizeBytes / 1024).toFixed(1)} KB · {a.mimeType}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDeleteAsset(a)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </Info_Section>
          )}

          {tab === 'automations' && (
            <Info_Section
              title={t('sidebar.automations', { defaultValue: 'Automations' })}
              actions={
                <div className="flex items-center gap-1">
                  <EditPopover
                    trigger={<Button size="sm" variant="ghost">{t('automations.addAutomation', { defaultValue: 'New automation' })}</Button>}
                    {...getEditConfig('automation-config', workspace?.rootPath ?? '')}
                    context={{
                      ...getEditConfig('automation-config', workspace?.rootPath ?? '').context,
                      context: `${getEditConfig('automation-config', workspace?.rootPath ?? '').context.context}\n\nCreate this automation for projectId "${project.config.id}". Every matcher you add must include projectId: "${project.config.id}".`,
                    }}
                    defaultValue={`Create a new automation scoped to projectId "${project.config.id}".`}
                  />
                  <Button size="sm" variant="ghost" onClick={() => navigate(routes.view.automations())}>
                    {t('common.manage', { defaultValue: 'Manage' })}
                  </Button>
                </div>
              }
            >
              {projectAutomations.length === 0 ? (
                <div className="px-4 py-6 text-sm text-muted-foreground">
                  {t('automations.noAutomationsConfigured', { defaultValue: 'No automations for this project yet' })}
                </div>
              ) : (
                <ul className="divide-y divide-border/50">
                  {projectAutomations.map((automation) => (
                    <li key={automation.id} className="px-4 py-2">
                      <button
                        type="button"
                        className="w-full text-left"
                        onClick={() => navigate(routes.view.automations({ automationId: automation.id }))}
                      >
                        <div className="text-sm text-foreground">{automation.name}</div>
                        <div className="mt-0.5 text-xs text-muted-foreground">{automation.summary}</div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Info_Section>
          )}

          {/* Settings tab */}
          {tab === 'settings' && (
            <Info_Section title={t('projectInfo.tabSettings')}>
              <div className="space-y-4 px-4 py-3">
                <Field
                  label={t('projectInfo.tabMemory', { defaultValue: 'Project memory' })}
                  hint={t('projectInfo.memoryHelp', { defaultValue: 'CA retrieves this memory for every task in the project. Keep stable decisions, conventions, unresolved questions, and important context here; put newest or most important items first.' })}
                >
                  <div className="space-y-2">
                    <Textarea
                      value={memory}
                      onChange={(event) => setMemory(event.target.value)}
                      rows={10}
                      className="min-h-[180px] font-mono text-xs leading-5"
                      placeholder={t('projectInfo.memoryPlaceholder', { defaultValue: '# Project memory\n\n- Decisions\n- Conventions\n- Open questions' })}
                    />
                    <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span>MEMORY.md · {memory.length.toLocaleString()} characters</span>
                      <Button size="sm" variant="outline" onClick={() => void handleSaveMemory()} disabled={memorySaving}>
                        {memorySaving ? t('common.saving') : t('common.save')}
                      </Button>
                    </div>
                  </div>
                </Field>
                <Field label={t('projectInfo.title')}>
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder={project.config.name}
                  />
                </Field>
                <Field label={t('projectInfo.description')}>
                  <Input
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    placeholder={t('projectInfo.descriptionPlaceholder')}
                  />
                </Field>
                <Field label={t('projectInfo.workingDirectory')}>
                  <div className="flex gap-2">
                    <Input
                      value={editWorkingDir}
                      onChange={(e) => setEditWorkingDir(e.target.value)}
                      placeholder={t('projectInfo.workingDirectoryPlaceholder')}
                      className="flex-1"
                    />
                    <Button size="sm" variant="outline" onClick={handlePickWorkingDirectory}>
                      <FolderOpen className="h-3.5 w-3.5 mr-1" />
                      {t('projectInfo.workingDirectoryPicker')}
                    </Button>
                  </div>
                </Field>
                <Field
                  label={t('projectInfo.color')}
                  hint={t('projectInfo.colorHint')}
                >
                  <InlineColorPickerRow
                    value={editColor}
                    onChange={setEditColor}
                    presets={PROJECT_COLOR_PALETTE}
                    onClear={() => setEditColor('')}
                    clearLabel={t('projectInfo.colorClear')}
                    customAriaLabel={t('projectInfo.colorCustom')}
                  />
                </Field>
                <Field
                  label={t('projectInfo.details')}
                  hint={t('projectInfo.detailsHelpText')}
                >
                  <Textarea
                    value={editDetails}
                    onChange={(e) => setEditDetails(e.target.value)}
                    rows={6}
                    placeholder={t('projectInfo.detailsPlaceholder')}
                  />
                </Field>
                <Field label="默认专家" hint="此项目中新建会话会继承该专家；创建时可单独覆盖。">
                  <select value={editDefaultExpertId} onChange={(event) => setEditDefaultExpertId(event.target.value)} className="flex h-control-md w-full rounded-control border border-foreground/15 bg-transparent px-3 text-sm">
                    <option value="">通用助手</option>
                    {experts.map(expert => <option key={expert.id} value={expert.id}>{expert.name}</option>)}
                  </select>
                </Field>
                <Field label="可用专家" hint="留空表示本项目可使用所有专家。">
                  <div className="mt-1 space-y-1 rounded-control border border-foreground/15 p-3">
                    {experts.length === 0 ? <p className="text-sm text-muted-foreground">尚未创建专家</p> : experts.map(expert => <label key={expert.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editAvailableExpertIds.includes(expert.id)} onChange={() => setEditAvailableExpertIds(current => current.includes(expert.id) ? current.filter(id => id !== expert.id) : [...current, expert.id])} />{expert.name}</label>)}
                  </div>
                </Field>
                <div className="flex justify-between pt-2">
                  <div className="flex gap-2">
                    <Button variant="ghost" onClick={handleArchiveProject}>
                      {project.config.archivedAt
                        ? t('projectInfo.unarchive', { defaultValue: 'Restore project' })
                        : t('projectInfo.archive', { defaultValue: 'Archive project' })}
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={handleDeleteProject}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" />
                      {t('projectInfo.deleteProject')}
                    </Button>
                  </div>
                  <Button onClick={handleSaveSettings} disabled={saving}>
                    {saving ? t('common.saving') : t('common.save')}
                  </Button>
                </div>
              </div>
            </Info_Section>
          )}

          {/* Knowledge is a project-filtered view of the unified library. */}
          {tab === 'knowledge' && (
            <Info_Section title={t('library.title', { defaultValue: 'Knowledge' })}>
              {activity.loading ? (
                <div className="px-4 py-6 text-sm text-muted-foreground">
                  {t('projectInfo.activityLoading', { defaultValue: 'Loading…' })}
                </div>
              ) : activity.docs.length === 0 ? (
                <div className="px-4 py-6 text-sm text-muted-foreground">
                  {t('library.empty', { defaultValue: 'No project knowledge yet' })}
                </div>
              ) : (
                <div className="divide-y divide-border/50">
                  {activity.docs.length > 0 && (
                    <ActivityGroup label={t('library.title', { defaultValue: 'Knowledge' })}>
                      {activity.docs.map((d) => (
                        <ActivityRow
                          key={d.id}
                          ts={d.updatedAt}
                          onClick={() => navigate(routes.view.library(d.id))}
                          primary={d.title || d.id}
                        />
                      ))}
                    </ActivityGroup>
                  )}
                </div>
              )}
            </Info_Section>
          )}

          {/* Metadata read-out for quick reference */}
          <Info_Section title={t('projectInfo.metadata')}>
            <Info_Table>
              <Info_Table.Row label={t('common.slug')} value={project.config.slug} />
              <Info_Table.Row label={t('common.location')}>
                <div className="flex items-center gap-2 min-w-0">
                  <span className="flex-1 min-w-0 truncate font-mono text-xs">{project.folderPath}</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => onOpenFile(project.folderPath)}
                        className="shrink-0 inline-flex h-6 w-6 items-center justify-center rounded text-foreground/50 hover:text-foreground hover:bg-foreground/5 transition-colors"
                        aria-label={t('projectInfo.openLocation')}
                      >
                        <FolderOpen className="h-3.5 w-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>{t('projectInfo.openLocation')}</TooltipContent>
                  </Tooltip>
                </div>
              </Info_Table.Row>
            </Info_Table>
          </Info_Section>
        </Info_Page.Content>
      )}
    </Info_Page>
    <Dialog open={restoreCandidates !== null} onOpenChange={(open) => { if (!open) { setRestoreCandidates(null); navigate(routes.view.projects()) } }}>
      <DialogContent><DialogHeader><DialogTitle>恢复项目自动化</DialogTitle><DialogDescription>只会显示因本次项目归档而暂停的规则。未选择的规则将保持暂停。</DialogDescription></DialogHeader>
        <div className="max-h-64 space-y-2 overflow-y-auto">{restoreCandidates?.length ? restoreCandidates.map((item) => <label key={item.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={restoreSelection.includes(item.id)} onChange={() => setRestoreSelection((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id])} />{item.name}<span className="text-xs text-muted-foreground">{item.event}</span></label>) : <p className="text-sm text-muted-foreground">没有待恢复的自动化。</p>}</div>
        <DialogFooter><Button variant="outline" onClick={() => { setRestoreCandidates(null); navigate(routes.view.projects()) }}>保持暂停</Button><Button variant="outline" onClick={() => setRestoreSelection(restoreCandidates?.map((item) => item.id) ?? [])}>全部恢复</Button><Button disabled={!restoreSelection.length} onClick={async () => { if (!workspaceId || !project) return; const restored = await window.electronAPI.restoreProjectAutomations(workspaceId, project.config.slug, restoreSelection); toast.success(`已恢复 ${restored} 条项目自动化`); setRestoreCandidates(null); navigate(routes.view.projects()) }}>恢复所选</Button></DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'px-3 py-1.5 text-sm rounded-t-md border-b-2',
        active
          ? 'border-foreground/80 text-foreground'
          : 'border-transparent text-foreground/60 hover:text-foreground/80'
      )}
    >
      {children}
    </button>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: React.ReactNode
  hint?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <div className="text-xs font-medium text-foreground/70 mb-1">{label}</div>
      {children}
      {hint && <div className="mt-1 text-xs text-foreground/50">{hint}</div>}
    </label>
  )
}

function ActivityGroup({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="px-4 py-2">
      <div className="mb-1 text-[11px] font-medium text-muted-foreground">{label}</div>
      <div className="divide-y divide-border/30">{children}</div>
    </div>
  )
}

function ActivityRow({
  ts,
  primary,
  secondary,
  onClick,
}: {
  ts: number
  primary: string
  secondary?: string
  onClick?: () => void
}) {
  const { i18n } = useTranslation()
  const time = ts > 0
    ? new Intl.DateTimeFormat(i18n.resolvedLanguage ?? i18n.language, {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
      }).format(ts)
    : ''
  const content = (
    <>
      <span className="flex-1 min-w-0">
        <span className="block truncate text-sm text-foreground">{primary}</span>
        {secondary && <span className="block truncate text-[11px] text-muted-foreground">{secondary}</span>}
      </span>
      {time && <span className="shrink-0 text-[11px] text-muted-foreground">{time}</span>}
    </>
  )
  return onClick ? (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-2 py-1.5 text-left hover:bg-foreground/[0.03] transition-colors">
      {content}
    </button>
  ) : (
    <div className="flex items-center gap-2 py-1.5">{content}</div>
  )
}
