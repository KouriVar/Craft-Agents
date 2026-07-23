import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  CircleDot,
  GitBranch,
  GitCompare,
  GitPullRequest,
  LoaderCircle,
  Plus,
  RefreshCw,
  Upload,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { GitAction, GitRepositoryStatus } from '../../../shared/types'

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
  const [commitMessage, setCommitMessage] = React.useState('')
  const [newBranch, setNewBranch] = React.useState('')
  const [compareBranch, setCompareBranch] = React.useState('')
  const [output, setOutput] = React.useState('')
  const directoryKey = workingDirectories.join('\n')

  const refresh = React.useCallback(async () => {
    if (workingDirectories.length === 0) return
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
  }, [refresh, repositoryDirectory, sessionId, projectId])

  if (workingDirectories.length === 0 || (!loading && !status?.isRepository)) return null

  const files = status?.files ?? []
  const stagedCount = files.filter((file) => file.staged).length
  const pullLabel = t('chat.gitPull', { defaultValue: 'Pull' })
  const pushLabel = t('chat.gitPush', { defaultValue: 'Push' })
  const syncLabel = t('chat.gitSync', { defaultValue: 'Sync' })
  const commitLabel = t('chat.gitCommit', { defaultValue: 'Commit' })

  return (
    <>
      <div className="my-3 h-px bg-border/50" />
      <section className="min-w-0">
        <div className="flex items-center justify-between px-1 pb-1.5">
          <div className="flex items-center text-xs font-semibold text-muted-foreground">
            <span>{t('chat.versionControl', { defaultValue: 'Version control' })}</span>
          </div>
          <button
            type="button"
            className="flex h-6 w-6 items-center justify-center rounded-[5px] text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground disabled:opacity-50"
            onClick={() => void refresh()}
            disabled={loading}
            aria-label={t('chat.gitRefresh', { defaultValue: 'Refresh Git status' })}
            title={t('chat.gitRefresh', { defaultValue: 'Refresh Git status' })}
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          </button>
        </div>

        {status && (
          <div className="overflow-hidden rounded-[10px] border border-border/60 bg-foreground/[0.02]">
            <div className="flex min-w-0 items-center gap-2 px-3 py-2.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] bg-foreground/[0.05] text-muted-foreground">
                <GitBranch className="h-3.5 w-3.5" />
              </span>
              <select
                value={status.branch}
                onChange={(event) => void run('checkout', { type: 'checkout', branch: event.target.value }, t('chat.branchName'))}
                className="h-7 min-w-0 flex-1 bg-transparent text-sm font-medium text-foreground/90 outline-none"
                disabled={!!busy}
                aria-label={t('chat.branchName')}
              >
                {status.branches.map((branch) => <option key={branch} value={branch}>{branch}</option>)}
              </select>
              <div className="flex shrink-0 items-center gap-1.5 text-[10px] tabular-nums text-muted-foreground">
                {status.behind > 0 && (
                  <span className="flex items-center gap-0.5" title={t('chat.gitBehind', { count: status.behind, defaultValue: 'Behind {{count}}' })}>
                    <ArrowDown className="h-3 w-3" />{status.behind}
                  </span>
                )}
                {status.ahead > 0 && (
                  <span className="flex items-center gap-0.5" title={t('chat.gitAhead', { count: status.ahead, defaultValue: 'Ahead {{count}}' })}>
                    <ArrowUp className="h-3 w-3" />{status.ahead}
                  </span>
                )}
              </div>
            </div>

            <details open={files.length > 0} className="group border-t border-border/50">
              <summary className="flex h-9 cursor-pointer list-none items-center gap-2 px-3 text-xs font-medium text-foreground/80 hover:bg-foreground/[0.025]">
                <ChevronDown className="h-3.5 w-3.5 -rotate-90 text-muted-foreground transition-transform group-open:rotate-0" />
                <span>{t('chat.changes')}</span>
                <span className="ml-auto rounded-full bg-foreground/[0.06] px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">{files.length}</span>
              </summary>
              <div className="border-t border-border/40 px-2 py-1.5">
                {files.length === 0 ? (
                  <p className="px-2 py-2 text-xs text-muted-foreground">{t('chat.noChanges')}</p>
                ) : (
                  <div className="max-h-32 space-y-0.5 overflow-y-auto">
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
                )}
                {files.length > 0 && (
                  <div className="mt-1.5 flex gap-1.5 border-t border-border/40 pt-1.5">
                    <Button size="sm" variant="ghost" className="h-7 flex-1 text-xs" disabled={!!busy} onClick={() => void run('stageAll', { type: 'stageAll' }, t('chat.stageAll'))}>
                      {t('chat.stageAll')}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 flex-1 text-xs" disabled={!stagedCount || !!busy} onClick={() => void run('unstageAll', { type: 'unstageAll' }, t('chat.unstageAll'))}>
                      {t('chat.unstageAll')}
                    </Button>
                  </div>
                )}
              </div>
            </details>

            <div className="flex gap-1.5 border-t border-border/50 p-2.5">
              <Input
                value={commitMessage}
                onChange={(event) => setCommitMessage(event.target.value)}
                placeholder={t('chat.commitMessage')}
                className="h-8 border-border/60 bg-background/70 text-xs shadow-none"
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && commitMessage.trim() && stagedCount) {
                    void run('commit', { type: 'commit', message: commitMessage }, commitLabel)
                  }
                }}
              />
              <Button
                size="sm"
                className="h-8 px-3 text-xs"
                disabled={!commitMessage.trim() || !stagedCount || !!busy}
                onClick={() => void run('commit', { type: 'commit', message: commitMessage }, commitLabel)}
              >
                {busy === 'commit' && <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}
                {commitLabel}
              </Button>
            </div>

            <div className="grid grid-cols-3 gap-1.5 border-t border-border/50 p-2.5">
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

            <details className="group border-t border-border/50">
              <summary className="flex h-9 cursor-pointer list-none items-center gap-2 px-3 text-xs text-muted-foreground hover:bg-foreground/[0.025] hover:text-foreground">
                <ChevronDown className="h-3.5 w-3.5 -rotate-90 transition-transform group-open:rotate-0" />
                <span>{t('chat.gitMoreActions', { defaultValue: 'More Git actions' })}</span>
              </summary>
              <div className="space-y-2 border-t border-border/40 p-2.5">
                <div className="flex gap-1.5">
                  <Input value={newBranch} onChange={(event) => setNewBranch(event.target.value)} placeholder={t('chat.gitNewBranch', { defaultValue: 'New branch' })} className="h-8 border-border/60 bg-background/70 text-xs shadow-none" />
                  <Button size="sm" variant="secondary" className="h-8 px-2.5" disabled={!newBranch.trim() || !!busy} onClick={() => void run('createBranch', { type: 'createBranch', branch: newBranch }, t('chat.gitNewBranch', { defaultValue: 'New branch' }))}>
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>

                <div className="flex gap-1.5">
                  <select value={compareBranch} onChange={(event) => setCompareBranch(event.target.value)} className="h-8 min-w-0 flex-1 rounded-control border border-border/60 bg-background/70 px-2 text-xs outline-none">
                    <option value="">{t('chat.compareBranch')}</option>
                    {status.branches.filter((branch) => branch !== status.branch).map((branch) => <option key={branch} value={branch}>{branch}</option>)}
                  </select>
                  <Button size="sm" variant="secondary" className="h-8 px-2.5" disabled={!compareBranch || !!busy} onClick={() => void run('compare', { type: 'diff', base: compareBranch }, t('chat.compareBranch'))}>
                    <GitCompare className="h-3.5 w-3.5" />
                  </Button>
                </div>

                <Button size="sm" variant="secondary" className="h-8 w-full justify-start text-xs" disabled={!!busy || status.remotes.length === 0} onClick={() => status.pullRequest?.url ? window.open(status.pullRequest.url, '_blank', 'noopener,noreferrer') : void run('createPullRequest', { type: 'createPullRequest' }, t('chat.createPullRequest'))}>
                  {status.pullRequest ? <CircleDot className="h-3.5 w-3.5 text-success" /> : <GitPullRequest className="h-3.5 w-3.5" />}
                  <span className="truncate">{status.pullRequest?.title || t('chat.createPullRequest')}</span>
                </Button>

                {output && (
                  <details className="group rounded-[7px] bg-background/70 px-2.5 py-2">
                    <summary className="cursor-pointer list-none text-xs text-muted-foreground">{t('chat.operationOutput')}</summary>
                    <pre className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap border-t border-border/50 pt-2 font-mono text-[10px] leading-4 text-foreground/75">{output}</pre>
                  </details>
                )}
              </div>
            </details>
          </div>
        )}
      </section>
    </>
  )
}
