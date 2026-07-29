import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useSession, useAppShellContext } from '@/context/AppShellContext'
import { cn } from '@/lib/utils'
import { SessionFilesSection } from '../right-sidebar/SessionFilesSection'
import { ContinueFromHereSection, UsageSection } from './SessionResourcesPopover'
import { TaskContinuitySection } from './TaskContinuitySection'
import { useLibraryGenerateFromSession } from '@/hooks/useLibraryGenerateFromSession'
import { useAtomValue } from 'jotai'
import { sessionMetaMapAtom, type SessionMeta } from '@/atoms/sessions'
import { navigate, routes } from '@/lib/navigate'

interface SessionInfoPopoverProps {
  sessionId: string
  sessionFolderPath?: string
  trigger: React.ReactElement
  side?: 'top' | 'right' | 'bottom' | 'left'
  align?: 'start' | 'center' | 'end'
  sideOffset?: number
  contentClassName?: string
  presentation?: 'popover' | 'drawer'
}

const DEFAULT_POPOVER_CONTENT_CLASS = 'w-[380px] h-[min(680px,calc(100vh-120px))] min-w-[280px] max-w-[420px] overflow-hidden rounded-touch bg-background text-foreground shadow-modal-small p-0'
const DEFAULT_DRAWER_CONTENT_CLASS = [
  'data-[vaul-drawer-direction=bottom]:inset-x-2',
  'data-[vaul-drawer-direction=bottom]:bottom-2',
  'data-[vaul-drawer-direction=bottom]:mt-0',
  'data-[vaul-drawer-direction=bottom]:max-h-[min(82vh,42rem)]',
  'overflow-hidden rounded-[14px] border border-border/60 bg-background shadow-modal-small',
].join(' ')

export function SessionInfoPopover({
  sessionId,
  sessionFolderPath,
  trigger,
  side = 'top',
  align = 'end',
  sideOffset = 6,
  contentClassName,
  presentation = 'popover',
}: SessionInfoPopoverProps) {
  const { t } = useTranslation()
  const [open, setOpen] = React.useState(false)

  const handleOpenChange = React.useCallback((nextOpen: boolean) => {
    setOpen(nextOpen)

    if (!nextOpen) {
      requestAnimationFrame(() => {
        window.dispatchEvent(new CustomEvent('craft:focus-input', {
          detail: { sessionId },
        }))
      })
    }
  }, [sessionId])

  if (presentation === 'drawer') {
    return (
      <Drawer open={open} onOpenChange={handleOpenChange} direction="bottom">
        <DrawerTrigger asChild>
          {trigger}
        </DrawerTrigger>
        <DrawerContent
          className={cn(DEFAULT_DRAWER_CONTENT_CLASS, contentClassName)}
          onOpenAutoFocus={(e) => {
            e.preventDefault()
          }}
        >
          <DrawerHeader className="border-b border-border/50 px-4 py-3 group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left">
            <DrawerTitle className="text-sm font-medium">{t('chat.sessionStatus')}</DrawerTitle>
          </DrawerHeader>
          <div className="flex-1 min-h-0 overflow-hidden">
            <SessionInfoContent sessionId={sessionId} sessionFolderPath={sessionFolderPath} />
          </div>
        </DrawerContent>
      </Drawer>
    )
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        {trigger}
      </PopoverTrigger>
      <PopoverContent
        className={contentClassName ?? DEFAULT_POPOVER_CONTENT_CLASS}
        side={side}
        align={align}
        sideOffset={sideOffset}
        onOpenAutoFocus={(e) => {
          e.preventDefault()
        }}
        onCloseAutoFocus={(e) => {
          e.preventDefault()
        }}
      >
        <SessionInfoContent sessionId={sessionId} sessionFolderPath={sessionFolderPath} />
      </PopoverContent>
    </Popover>
  )
}

export function SessionInfoContent({ sessionId, sessionFolderPath }: { sessionId: string; sessionFolderPath?: string }) {
  const session = useSession(sessionId)
  const { t } = useTranslation()
  const { activeWorkspaceId } = useAppShellContext()
  const libraryGenerate = useLibraryGenerateFromSession(activeWorkspaceId)

  return (
    <ScrollArea className="h-full min-h-0 [&_[data-slot=scroll-bar]]:w-1.5">
      <div className="min-h-full">
        {libraryGenerate.dialog}
        <div className="border-b border-border/50">
          <SessionFilesSection
            sessionId={sessionId}
            sessionFolderPath={sessionFolderPath}
            hideHeader={false}
            autoHeight
          />
        </div>
        {session && (
          <div className="px-3 pb-3 pt-3">
            <TaskContinuitySection session={session} />
            {activeWorkspaceId && <SessionExpertSection sessionId={session.id} workspaceId={activeWorkspaceId} expertId={session.expertId} parentSessionId={session.parentSessionId} />}
            <BranchSessionsSection session={session} />
            <ChildSessionsSection parentSession={session} />
            <ContinueFromHereSection session={session} />
            {activeWorkspaceId && (
              <button
                type="button"
                className="mt-3 w-full rounded-control border border-border/50 px-3 py-2 text-left text-xs font-medium hover:bg-foreground/[0.04]"
                onClick={() => { void libraryGenerate.start(sessionId) }}
              >
                {t('library.createFromSession')}
              </button>
            )}
            <div className="my-3 h-px bg-border/50" />
            <UsageSection session={session} />
          </div>
        )}
      </div>
    </ScrollArea>
  )
}

/** Collaboration metadata lives in session details rather than the transcript body. */
function SessionExpertSection({ sessionId, workspaceId, expertId, parentSessionId }: { sessionId: string; workspaceId: string; expertId?: string; parentSessionId?: string }) {
  const [experts, setExperts] = React.useState<import('@craft-agent/shared/experts').ExpertProfile[]>([])
  React.useEffect(() => { void window.electronAPI.listExperts(workspaceId).then(setExperts).catch(() => setExperts([])) }, [workspaceId])
  return (
    <section className="mt-3 rounded-touch border border-border/60 bg-background p-3">
      <div className="flex items-center justify-between gap-2"><h3 className="text-xs font-semibold text-muted-foreground">协作来源</h3>{parentSessionId && <span className="text-[10px] text-muted-foreground">继承自父会话</span>}</div>
      <select aria-label="会话专家" value={expertId ?? ''} onChange={event => { void window.electronAPI.sessionCommand(sessionId, { type: 'setExpertId', expertId: event.target.value || null }) }} className="mt-2 h-8 w-full rounded border border-border/60 bg-transparent px-2 text-xs">
        <option value="">继承项目/父会话/通用助手</option>
        {experts.map(expert => <option key={expert.id} value={expert.id}>{expert.name}</option>)}
      </select>
    </section>
  )
}

/** Lightweight branch navigation lives in session details so the transcript stays linear. */
function BranchSessionsSection({ session }: { session: NonNullable<ReturnType<typeof useSession>> }) {
  const metaMap = useAtomValue(sessionMetaMapAtom)
  const source = session.branchFromSessionId ? metaMap.get(session.branchFromSessionId) : undefined
  const branches = React.useMemo(
    () => [...metaMap.values()]
      .filter((item) => item.branchFromSessionId === session.id && item.workspaceId === session.workspaceId)
      .sort((a, b) => (b.lastMessageAt ?? 0) - (a.lastMessageAt ?? 0)),
    [metaMap, session.id, session.workspaceId],
  )

  if (!source && branches.length === 0) return null

  return (
    <section className="mt-3 rounded-touch border border-border/60 bg-background p-3 shadow-minimal">
      {source && (
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-[7px] px-2 py-1.5 text-left hover:bg-foreground/[0.04]"
          onClick={() => navigate(routes.view.allSessions(source.id))}
        >
          <span className="text-[10px] text-muted-foreground">Branched from</span>
          <span className="min-w-0 flex-1 truncate text-xs text-foreground">{source.name || source.preview || source.id}</span>
        </button>
      )}
      {branches.length > 0 && (
        <div className={cn(source && 'mt-2 border-t border-border/50 pt-2')}>
          <div className="flex items-center justify-between gap-2 px-2">
            <h3 className="text-xs font-semibold text-muted-foreground">Branches</h3>
            <span className="text-[10px] tabular-nums text-muted-foreground">{branches.length}</span>
          </div>
          <div className="mt-1 space-y-1">
            {branches.map((branch) => (
              <button
                key={branch.id}
                type="button"
                className="flex w-full items-center gap-2 rounded-[7px] px-2 py-1.5 text-left hover:bg-foreground/[0.04]"
                onClick={() => navigate(routes.view.allSessions(branch.id))}
              >
                <span className="min-w-0 flex-1 truncate text-xs text-foreground">{branch.name || branch.preview || branch.id}</span>
                <span className="shrink-0 text-[10px] text-muted-foreground">{branch.messageCount}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

function ChildSessionsSection({ parentSession }: { parentSession: NonNullable<ReturnType<typeof useSession>> }) {
  const { t } = useTranslation()
  const metaMap = useAtomValue(sessionMetaMapAtom)
  const children = React.useMemo(
    () => [...metaMap.values()]
      .filter((item) => item.parentSessionId === parentSession.id && item.workspaceId === parentSession.workspaceId)
      .sort((a, b) => (b.lastMessageAt ?? 0) - (a.lastMessageAt ?? 0)),
    [metaMap, parentSession.id, parentSession.workspaceId],
  )

  if (children.length === 0) return null

  return (
    <section className="mt-3 rounded-touch border border-border/60 bg-background p-3 shadow-minimal">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold text-muted-foreground">
          {t('session.childSessions', { defaultValue: 'Sub-sessions' })}
        </h3>
        <span className="text-[10px] tabular-nums text-muted-foreground">{children.length}</span>
      </div>
      <div className="mt-2 space-y-1">
        {children.map((child) => <ChildSessionRow key={child.id} child={child} />)}
      </div>
    </section>
  )
}

function ChildSessionRow({ child }: { child: SessionMeta }) {
  const { t } = useTranslation()
  const latest = child.taskCheckpoints?.at(-1)
  const outcome = latest?.outcome
  const status = child.isProcessing
    ? t('session.processing', { defaultValue: 'Running' })
    : outcome === 'failed'
      ? t('taskContinuity.outcome.failed', { defaultValue: 'Failed' })
      : outcome === 'completed'
        ? t('taskContinuity.outcome.completed', { defaultValue: 'Completed' })
        : child.sessionStatus ?? t('session.pending', { defaultValue: 'Pending' })

  return (
    <button
      type="button"
      className="flex w-full items-center gap-2 rounded-[7px] px-2 py-1.5 text-left hover:bg-foreground/[0.04]"
      onClick={() => navigate(routes.view.allSessions(child.id))}
    >
      <span className="min-w-0 flex-1 truncate text-xs text-foreground">{child.name || child.preview || child.id}</span>
      <span className="shrink-0 text-[10px] text-muted-foreground">{status}</span>
    </button>
  )
}
