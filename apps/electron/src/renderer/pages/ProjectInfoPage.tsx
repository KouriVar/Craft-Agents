/**
 * ProjectInfoPage
 *
 * Workspace-project detail page with sessions, assets, memory, and settings.
 */

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { useEffect, useState, useCallback, useMemo } from 'react'
import { useAtomValue } from 'jotai'
import { Brain, FolderKanban, FolderOpen, Play, Plus, Trash2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { useActiveWorkspace, useAppShellContext } from '@/context/AppShellContext'
import { navigate, routes } from '@/lib/navigate'
import { sessionMetaMapAtom } from '@/atoms/sessions'
import { browserWorkspaceTabsAtom } from '@/atoms/browser-workspace'
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@craft-agent/ui'
import { cn } from '@/lib/utils'
import { PROJECT_COLOR_PALETTE } from '@/utils/project-colors'
import { InlineColorPickerRow } from '@/components/ui/inline-color-picker-row'
import type { LoadedProject, ProjectAsset } from '@craft-agent/shared/projects/types'
import type { LibraryIndexEntry, CognitionEventSummary } from '@craft-agent/shared/protocol'

interface ProjectInfoPageProps {
  projectSlug: string
}

type TabKey = 'sessions' | 'assets' | 'memory' | 'settings' | 'activity'

export default function ProjectInfoPage({ projectSlug }: ProjectInfoPageProps) {
  const { t } = useTranslation()
  const workspace = useActiveWorkspace()
  const workspaceId = workspace?.id
  const sessionMetaMap = useAtomValue(sessionMetaMapAtom)
  const browserTabs = useAtomValue(browserWorkspaceTabsAtom)
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
  const [saving, setSaving] = useState(false)
  const [memory, setMemory] = useState('')
  const [memoryLoaded, setMemoryLoaded] = useState(false)
  const [memorySaving, setMemorySaving] = useState(false)
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

  // Load assets when entering Assets tab
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
    if (tab === 'assets') refreshAssets()
  }, [tab, refreshAssets])

  useEffect(() => {
    if (tab !== 'memory' || !workspaceId || memoryLoaded) return
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
      if ((meta as { projectId?: string }).projectId === project.config.id) {
        result.push({ id: meta.id, name: meta.name ?? meta.id })
      }
    }
    return result
  }, [project, sessionMetaMap])

  // Recent project sessions sorted by last activity (reuses sessionMetaMap,
  // no new session query). Falls back to createdAt when lastMessageAt is absent.
  const recentProjectSessions = useMemo(() => {
    if (!project) return [] as { id: string; name: string; ts: number }[]
    const result: { id: string; name: string; ts: number }[] = []
    for (const meta of sessionMetaMap.values()) {
      if ((meta as { projectId?: string }).projectId === project.config.id) {
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

  // Lazy-load Library docs + Cognition browser events for the Activity tab.
  // Library list uses server-side projectId filter (v0.16.2); cognition events
  // already support projectId + types filtering.
  useEffect(() => {
    if (tab !== 'activity' || !workspaceId || !project) return
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
      })
      toast.success(t('projectInfo.saved'))
    } catch (err) {
      console.error('[ProjectInfoPage] Save failed:', err)
      toast.error(t('projectInfo.saveFailed'))
    } finally {
      setSaving(false)
    }
  }, [workspaceId, project, editName, editDescription, editWorkingDir, editDetails, editColor, t])

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
            <TabButton active={tab === 'assets'} onClick={() => setTab('assets')}>
              {t('projectInfo.tabAssets')}
            </TabButton>
            <TabButton active={tab === 'memory'} onClick={() => setTab('memory')}>
              {t('projectInfo.tabMemory', { defaultValue: 'Memory' })}
            </TabButton>
            <TabButton active={tab === 'settings'} onClick={() => setTab('settings')}>
              {t('projectInfo.tabSettings')}
            </TabButton>
            <TabButton active={tab === 'activity'} onClick={() => setTab('activity')}>
              {t('projectInfo.tabActivity', { defaultValue: 'Activity' })}
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

          {/* Assets tab */}
          {tab === 'assets' && (
            <Info_Section
              title={t('projectInfo.tabAssets')}
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

          {tab === 'memory' && (
            <Info_Section
              title={t('projectInfo.tabMemory', { defaultValue: 'Long-term memory' })}
              actions={<Button size="sm" onClick={() => void handleSaveMemory()} disabled={memorySaving}>{memorySaving ? t('common.saving') : t('common.save')}</Button>}
            >
              <div className="space-y-3 px-4 py-3">
                <div className="flex items-start gap-2 rounded-lg bg-foreground-2 p-3 text-xs leading-5 text-muted-foreground">
                  <Brain className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>{t('projectInfo.memoryHelp', { defaultValue: 'CA retrieves this memory for every task in the project. Keep stable decisions, conventions, unresolved questions, and important context here; put newest or most important items first.' })}</p>
                </div>
                <Textarea
                  value={memory}
                  onChange={(event) => setMemory(event.target.value)}
                  rows={18}
                  className="min-h-[320px] font-mono text-xs leading-5"
                  placeholder={t('projectInfo.memoryPlaceholder', { defaultValue: '# Project memory\n\n- Decisions\n- Conventions\n- Open questions' })}
                />
                <div className="text-xs text-muted-foreground">MEMORY.md · {memory.length.toLocaleString()} characters</div>
              </div>
            </Info_Section>
          )}

          {/* Settings tab */}
          {tab === 'settings' && (
            <Info_Section title={t('projectInfo.tabSettings')}>
              <div className="space-y-4 px-4 py-3">
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
                <div className="flex justify-between pt-2">
                  <Button
                    variant="ghost"
                    onClick={handleDeleteProject}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1" />
                    {t('projectInfo.deleteProject')}
                  </Button>
                  <Button onClick={handleSaveSettings} disabled={saving}>
                    {saving ? t('common.saving') : t('common.save')}
                  </Button>
                </div>
              </div>
            </Info_Section>
          )}

          {/* Activity tab — recent sessions / docs / browser links for this project */}
          {tab === 'activity' && (
            <Info_Section title={t('projectInfo.tabActivity', { defaultValue: 'Activity' })}>
              {activity.loading ? (
                <div className="px-4 py-6 text-sm text-muted-foreground">
                  {t('projectInfo.activityLoading', { defaultValue: 'Loading…' })}
                </div>
              ) : recentProjectSessions.length === 0
                && activity.docs.length === 0
                && activity.events.length === 0
                && relatedBrowserTabs.length === 0 ? (
                <div className="px-4 py-6 text-sm text-muted-foreground">
                  {t('projectInfo.activityEmpty', { defaultValue: 'No recent activity' })}
                </div>
              ) : (
                <div className="divide-y divide-border/50">
                  {/* Recent sessions */}
                  {recentProjectSessions.length > 0 && (
                    <ActivityGroup label={t('projectInfo.activitySessions', { defaultValue: 'Recent sessions' })}>
                      {recentProjectSessions.map((s) => (
                        <ActivityRow
                          key={s.id}
                          ts={s.ts}
                          onClick={() => navigate(routes.view.allSessions(s.id))}
                          primary={s.name}
                        />
                      ))}
                    </ActivityGroup>
                  )}
                  {/* Recent library documents */}
                  {activity.docs.length > 0 && (
                    <ActivityGroup label={t('projectInfo.activityDocs', { defaultValue: 'Recent documents' })}>
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
                  {/* Related open browser tabs (ownerSessionId → projectId) */}
                  {relatedBrowserTabs.length > 0 && (
                    <ActivityGroup label={t('projectInfo.activityRelatedTabs')}>
                      {relatedBrowserTabs.map((tabItem) => (
                        <ActivityRow
                          key={tabItem.id}
                          ts={0}
                          onClick={() => navigate(routes.view.browser(tabItem.id))}
                          primary={tabItem.title}
                          secondary={tabItem.hostname ?? tabItem.url}
                        />
                      ))}
                    </ActivityGroup>
                  )}
                  {/* Cognition browser links (may be empty until projectId is stamped) */}
                  {activity.events.length > 0 && (
                    <ActivityGroup label={t('projectInfo.activityLinks', { defaultValue: 'Recent links' })}>
                      {activity.events.map((ev) => {
                        const payload = ev.payload as {
                          title?: string
                          hostname?: string
                          pathname?: string
                          tabId?: string
                          url?: string
                        }
                        const title = (typeof payload.title === 'string' && payload.title.trim())
                          ? payload.title
                          : ev.summary
                        const host = typeof payload.hostname === 'string' ? payload.hostname : undefined
                        const tabId = typeof payload.tabId === 'string' && payload.tabId.trim()
                          ? payload.tabId.trim()
                          : undefined
                        const url = typeof payload.url === 'string' && payload.url.trim()
                          ? payload.url.trim()
                          : (host
                              ? `https://${host}${typeof payload.pathname === 'string' ? payload.pathname : ''}`
                              : undefined)
                        const onOpen = tabId
                          ? () => navigate(routes.view.browser(tabId))
                          : url
                            ? () => {
                                void window.electronAPI.openUrl?.(url)
                              }
                            : undefined
                        return (
                          <ActivityRow
                            key={ev.id}
                            ts={ev.timestamp}
                            primary={title}
                            secondary={host}
                            onClick={onOpen}
                          />
                        )
                      })}
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
