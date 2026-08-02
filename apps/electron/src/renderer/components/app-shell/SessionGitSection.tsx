import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  CircleDot,
  FileDiff,
  GitBranch,
  GitCompare,
  GitPullRequest,
  Laptop,
  LoaderCircle,
  Plus,
  RefreshCw,
  SlidersHorizontal,
  Upload,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  StyledDropdownMenuContent,
  StyledDropdownMenuItem,
} from '@/components/ui/styled-dropdown'
import { cn } from '@/lib/utils'
import type { GitAction, GitRepositoryStatus } from '../../../shared/types'

function repositoryName(path?: string) {
  return path?.split(/[\\/]/).filter(Boolean).at(-1) ?? ''
}

function GitRow({
  icon,
  label,
  detail,
  onClick,
  disabled,
  trailing,
}: {
  icon: React.ReactNode
  label: string
  detail?: string
  onClick?: () => void
  disabled?: boolean
  trailing?: React.ReactNode
}) {
  const content = (
    <>
      <span className="flex h-7 w-7 shrink-0 items-center justify-center text-muted-foreground">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground/90">{label}</span>
        {detail && <span className="block truncate text-[11px] text-muted-foreground">{detail}</span>}
      </span>
      {trailing}
    </>
  )

  if (!onClick) {
    return <div className="flex min-h-10 items-center gap-2 rounded-[8px] px-1.5">{content}</div>
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-10 w-full items-center gap-2 rounded-[8px] px-1.5 text-left transition-colors hover:bg-foreground/[0.045] disabled:cursor-not-allowed disabled:opacity-40"
    >
      {content}
    </button>
  )
}

export function SessionGitSection({
  workingDirectories,
  sessionId,
  projectId,
}: {
  workingDirectories: string[]
  sessionId?: string
  projectId?: string
}) {
  const { t } = useTranslation()
  const [status, setStatus] = React.useState<GitRepositoryStatus | null>(null)
  const [repositoryDirectory, setRepositoryDirectory] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [busy, setBusy] = React.useState<string | null>(null)
  const [changesOpen, setChangesOpen] = React.useState(false)
  const [commitOpen, setCommitOpen] = React.useState(false)
  const [advancedOpen, setAdvancedOpen] = React.useState(false)
  const [commitMessage, setCommitMessage] = React.useState('')
  const [newBranch, setNewBranch] = React.useState('')
  const [compareBranch, setCompareBranch] = React.useState('')
  const [output, setOutput] = React.useState('')
  const directoryKey = workingDirectories.join('\n')

  const refresh = React.useCallback(async () => {
    if (workingDirectories.length === 0) {
      setRepositoryDirectory(null)
      setStatus(null)
      return
    }
    setLoading(true)
    try {
      for (const directory of workingDirectories) {
        try {
          const nextStatus = await window.electronAPI.getGitStatus(directory)
          if (nextStatus.isRepository) {
            setRepositoryDirectory(directory)
            setStatus(nextStatus)
            return
          }
        } catch {
          // A stale folder should not prevent checking the remaining candidates.
        }
      }
      setRepositoryDirectory(null)
      setStatus(null)
    } finally {
      setLoading(false)
    }
  // directoryKey is a stable representation of the ordered candidate list.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [directoryKey])

  React.useEffect(() => { void refresh() }, [refresh])

  const run = React.useCallback(async (actionId: string, action: GitAction, errorLabel: string) => {
    if (!repositoryDirectory) return
    setBusy(actionId)
    const result = await window.electronAPI.runGitAction(repositoryDirectory, action, {
      sessionId,
      projectId,
    })
    setBusy(null)
    if (!result.ok) {
      toast.error(result.error || errorLabel)
      return
    }
    if (result.output) setOutput(result.output)
    if (result.url) window.open(result.url, '_blank', 'noopener,noreferrer')
    if (action.type === 'commit') setCommitMessage('')
    if (action.type === 'createBranch') setNewBranch('')
    await refresh()
  }, [projectId, refresh, repositoryDirectory, sessionId])

  if (workingDirectories.length === 0 || (!loading && !status?.isRepository)) return null

  const files = status?.files ?? []
  const stagedCount = files.filter((file) => file.staged).length
  const pullLabel = t('chat.gitPull', { defaultValue: 'Pull' })
  const pushLabel = t('chat.gitPush', { defaultValue: 'Push' })
  const syncLabel = t('chat.gitSync', { defaultValue: 'Sync' })
  const commitLabel = t('chat.gitCommit', { defaultValue: 'Commit' })
  const repoLabel = repositoryName(status?.root ?? repositoryDirectory ?? undefined)

  return (
    <section className="min-w-0">
      <div className="flex items-center justify-between px-1 pb-1.5">
        <h3 className="text-xs font-semibold text-muted-foreground">
          {t('chat.environmentInfo', { defaultValue: 'Environment' })}
        </h3>
        <button
          type="button"
          className="flex h-7 w-7 items-center justify-center rounded-[7px] text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground disabled:opacity-50"
          onClick={() => void refresh()}
          disabled={loading}
          aria-label={t('chat.gitRefresh', { defaultValue: 'Refresh Git status' })}
          title={t('chat.gitRefresh', { defaultValue: 'Refresh Git status' })}
        >
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
        </button>
      </div>

      {status && (
        <div className="space-y-0.5">
          <GitRow
            icon={<FileDiff className="h-4 w-4" />}
            label={t('chat.changes')}
            detail={files.length === 0 ? t('chat.noChanges') : undefined}
            onClick={() => setChangesOpen((open) => !open)}
            trailing={
              <span className="flex items-center gap-2">
                {files.length > 0 && (
                  <span className="rounded-full bg-foreground/[0.06] px-2 py-0.5 text-[11px] tabular-nums text-muted-foreground">
                    {files.length}
                  </span>
                )}
                <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', changesOpen && 'rotate-180')} />
              </span>
            }
          />

          {changesOpen && files.length > 0 && (
            <div className="mx-1 mb-1 overflow-hidden rounded-[9px] border border-border/55 bg-foreground/[0.018]">
              <div className="max-h-40 overflow-y-auto p-1.5">
                {files.map((file) => (
                  <button
                    key={`${file.path}-${file.indexStatus}-${file.worktreeStatus}`}
                    type="button"
                    onClick={() => void run('diff', { type: 'diff', path: file.path, staged: file.staged }, t('chat.changes'))}
                    className="flex h-7 w-full items-center gap-2 rounded-[6px] px-2 text-left text-xs transition-colors hover:bg-foreground/[0.05]"
                    title={file.path}
                  >
                    <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', file.staged ? 'bg-success' : 'bg-warning')} />
                    <span className="min-w-0 flex-1 truncate text-foreground/80">{file.path}</span>
                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{file.indexStatus}{file.worktreeStatus}</span>
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-1 border-t border-border/45 p-1.5">
                <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={!!busy} onClick={() => void run('stageAll', { type: 'stageAll' }, t('chat.stageAll'))}>
                  {t('chat.stageAll')}
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={!stagedCount || !!busy} onClick={() => void run('unstageAll', { type: 'unstageAll' }, t('chat.unstageAll'))}>
                  {t('chat.unstageAll')}
                </Button>
              </div>
            </div>
          )}

          <GitRow
            icon={<Laptop className="h-4 w-4" />}
            label={t('chat.gitLocal', { defaultValue: 'Local' })}
            detail={repoLabel || undefined}
          />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <div>
                <GitRow
                  icon={<GitBranch className="h-4 w-4" />}
                  label={status.branch || 'HEAD'}
                  detail={status.upstream}
                  onClick={() => {}}
                  disabled={!!busy}
                  trailing={
                    <span className="flex items-center gap-2">
                      {(status.behind > 0 || status.ahead > 0) && (
                        <span className="flex gap-1.5 text-[10px] tabular-nums text-muted-foreground">
                          {status.behind > 0 && <span className="flex items-center gap-0.5"><ArrowDown className="h-3 w-3" />{status.behind}</span>}
                          {status.ahead > 0 && <span className="flex items-center gap-0.5"><ArrowUp className="h-3 w-3" />{status.ahead}</span>}
                        </span>
                      )}
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                    </span>
                  }
                />
              </div>
            </DropdownMenuTrigger>
            <StyledDropdownMenuContent align="end" sideOffset={4} minWidth="min-w-[260px]" className="max-h-72 overflow-y-auto">
              {status.branches.map((branch) => (
                <StyledDropdownMenuItem
                  key={branch}
                  onClick={() => void run('checkout', { type: 'checkout', branch }, t('chat.branchName'))}
                >
                  <GitBranch className="h-4 w-4" />
                  <span className="min-w-0 flex-1 truncate">{branch}</span>
                  {branch === status.branch && <Check className="h-4 w-4" />}
                </StyledDropdownMenuItem>
              ))}
            </StyledDropdownMenuContent>
          </DropdownMenu>

          <GitRow
            icon={<SlidersHorizontal className="h-4 w-4" />}
            label={t('chat.gitCommitOrPush', { defaultValue: 'Commit or push' })}
            onClick={() => setCommitOpen((open) => !open)}
            trailing={<ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', commitOpen && 'rotate-180')} />}
          />

          {commitOpen && (
            <div className="mx-1 mb-1 space-y-1.5 rounded-[9px] border border-border/55 bg-foreground/[0.018] p-2">
              <div className="flex gap-1.5">
                <Input
                  value={commitMessage}
                  onChange={(event) => setCommitMessage(event.target.value)}
                  placeholder={t('chat.commitMessage')}
                  className="h-8 border-border/60 bg-background/65 text-xs shadow-none"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && commitMessage.trim() && stagedCount) {
                      void run('commit', { type: 'commit', message: commitMessage }, commitLabel)
                    }
                  }}
                />
                <Button size="sm" className="h-8 px-3 text-xs" disabled={!commitMessage.trim() || !stagedCount || !!busy} onClick={() => void run('commit', { type: 'commit', message: commitMessage }, commitLabel)}>
                  {busy === 'commit' && <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}
                  {commitLabel}
                </Button>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                <Button size="sm" variant="secondary" className="h-8 text-xs" disabled={!!busy || !status.upstream} onClick={() => void run('pull', { type: 'pull' }, pullLabel)}>
                  <ArrowDown className="h-3.5 w-3.5" />{pullLabel}
                </Button>
                <Button size="sm" variant="secondary" className="h-8 text-xs" disabled={!!busy || status.remotes.length === 0} onClick={() => void run('push', { type: 'push' }, pushLabel)}>
                  <Upload className="h-3.5 w-3.5" />{pushLabel}
                </Button>
                <Button size="sm" variant="secondary" className="h-8 text-xs" disabled={!!busy || !status.upstream} onClick={() => void run('sync', { type: 'sync' }, syncLabel)}>
                  <RefreshCw className="h-3.5 w-3.5" />{syncLabel}
                </Button>
              </div>
            </div>
          )}

          <GitRow
            icon={status.pullRequest ? <CircleDot className="h-4 w-4 text-success" /> : <GitPullRequest className="h-4 w-4" />}
            label={status.pullRequest?.title || t('chat.createPullRequest')}
            onClick={() => status.pullRequest?.url
              ? window.open(status.pullRequest.url, '_blank', 'noopener,noreferrer')
              : void run('createPullRequest', { type: 'createPullRequest' }, t('chat.createPullRequest'))}
            disabled={!!busy || status.remotes.length === 0}
          />

          <GitRow
            icon={<GitCompare className="h-4 w-4" />}
            label={t('chat.gitMoreActions', { defaultValue: 'More Git actions' })}
            onClick={() => setAdvancedOpen((open) => !open)}
            trailing={<ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', advancedOpen && 'rotate-180')} />}
          />

          {advancedOpen && (
            <div className="mx-1 space-y-2 rounded-[9px] border border-border/55 bg-foreground/[0.018] p-2">
              <div className="flex gap-1.5">
                <Input value={newBranch} onChange={(event) => setNewBranch(event.target.value)} placeholder={t('chat.gitNewBranch', { defaultValue: 'New branch' })} className="h-8 border-border/60 bg-background/65 text-xs shadow-none" />
                <Button size="sm" variant="secondary" className="h-8 px-2.5" disabled={!newBranch.trim() || !!busy} onClick={() => void run('createBranch', { type: 'createBranch', branch: newBranch }, t('chat.gitNewBranch', { defaultValue: 'New branch' }))}>
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="flex gap-1.5">
                <select value={compareBranch} onChange={(event) => setCompareBranch(event.target.value)} className="h-8 min-w-0 flex-1 rounded-control border border-border/60 bg-background/65 px-2 text-xs outline-none">
                  <option value="">{t('chat.compareBranch')}</option>
                  {status.branches.filter((branch) => branch !== status.branch).map((branch) => <option key={branch} value={branch}>{branch}</option>)}
                </select>
                <Button size="sm" variant="secondary" className="h-8 px-2.5" disabled={!compareBranch || !!busy} onClick={() => void run('compare', { type: 'diff', base: compareBranch }, t('chat.compareBranch'))}>
                  <GitCompare className="h-3.5 w-3.5" />
                </Button>
              </div>
              {output && (
                <details className="group rounded-[7px] bg-background/65 px-2.5 py-2">
                  <summary className="cursor-pointer list-none text-xs text-muted-foreground">{t('chat.operationOutput')}</summary>
                  <pre className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap border-t border-border/50 pt-2 font-mono text-[10px] leading-4 text-foreground/75">{output}</pre>
                </details>
              )}
            </div>
          )}
        </div>
      )}

      <div className="my-3 h-px bg-border/50" />
    </section>
  )
}
