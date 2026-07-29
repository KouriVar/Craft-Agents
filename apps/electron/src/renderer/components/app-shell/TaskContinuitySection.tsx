import * as React from 'react'
import { Check, ListChecks, Play, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import type { TaskPriority } from '@craft-agent/shared/sessions'
import type { Session } from '../../../shared/types'
import { useAppShellContext } from '@/context/AppShellContext'
import { cn } from '@/lib/utils'

function toDateTimeLocal(value?: number): string {
  if (!value) return ''
  const date = new Date(value)
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function fromDateTimeLocal(value: string): number | null {
  if (!value) return null
  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : null
}

export function TaskContinuitySection({ session }: { session: Session }) {
  const { t } = useTranslation()
  const { onSendMessage } = useAppShellContext()
  const [goal, setGoal] = React.useState(session.taskGoal ?? '')
  const [saving, setSaving] = React.useState(false)
  const [saved, setSaved] = React.useState(false)
  const checkpoints = session.taskCheckpoints ?? []
  const latest = checkpoints.at(-1)

  React.useEffect(() => setGoal(session.taskGoal ?? ''), [session.taskGoal])

  const runCommand = React.useCallback(async (command: Parameters<typeof window.electronAPI.sessionCommand>[1]) => {
    setSaving(true)
    setSaved(false)
    try {
      await window.electronAPI.sessionCommand(session.id, command)
      setSaved(true)
    } catch (error) {
      console.error('[TaskContinuitySection] command failed', error)
      toast.error(t('taskContinuity.saveFailed', { defaultValue: '无法保存任务状态' }))
    } finally {
      setSaving(false)
    }
  }, [session.id, t])

  React.useEffect(() => {
    if (!saved) return
    const timer = window.setTimeout(() => setSaved(false), 1800)
    return () => window.clearTimeout(timer)
  }, [saved])

  const saveGoal = React.useCallback(() => {
    const normalized = goal.trim()
    if (normalized === (session.taskGoal ?? '')) return
    void runCommand({ type: 'setTaskDetails', patch: { goal: normalized || null } })
  }, [goal, runCommand, session.taskGoal])

  const continueTask = React.useCallback(() => {
    const nextSteps = latest?.nextSteps?.length ? latest.nextSteps.map((item) => `- ${item}`).join('\n') : ''
    const prompt = latest
      ? t('taskContinuity.continuePromptWithCheckpoint', {
          summary: latest.summary,
          nextSteps: nextSteps ? t('taskContinuity.continuePromptNextSteps', { nextSteps }) : '',
        })
      : t('taskContinuity.continuePromptWithoutCheckpoint', {
          task: session.taskGoal || session.name || session.preview || t('taskContinuity.currentTask'),
        })
    onSendMessage(session.id, prompt)
  }, [latest, onSendMessage, session.id, session.name, session.preview, session.taskGoal, t])

  const due = session.taskDueAt
  const reminderDue = Boolean(
    session.taskReminderAt &&
    session.taskReminderAt <= Date.now() &&
    (!session.taskReminderAcknowledgedAt || session.taskReminderAcknowledgedAt < session.taskReminderAt),
  )

  return (
    <section className="min-w-0">
      <div className="flex items-center justify-between px-1 pb-1.5">
        <h3 className="text-xs font-semibold text-muted-foreground">
          {t('taskContinuity.title', { defaultValue: '任务进度' })}
        </h3>
        {saving ? (
          <span className="text-[10px] text-muted-foreground/70">{t('taskContinuity.saving')}</span>
        ) : saved ? (
          <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400">
            <Check className="h-3 w-3" />
            {t('taskContinuity.saved')}
          </span>
        ) : checkpoints.length > 0 && (
          <span className="text-[10px] tabular-nums text-muted-foreground/70">
            {t('taskContinuity.checkpointCount', { defaultValue: '{{count}} 个检查点', count: checkpoints.length })}
          </span>
        )}
      </div>

      <div className="rounded-touch border border-border/60 bg-background p-3 shadow-minimal" aria-busy={saving}>
        <label className="block text-[10px] font-medium text-muted-foreground">
          {t('taskContinuity.goal', { defaultValue: '当前目标' })}
        </label>
        <textarea
          value={goal}
          onChange={(event) => setGoal(event.target.value)}
          onBlur={saveGoal}
          placeholder={t('taskContinuity.goalPlaceholder', { defaultValue: '这个任务最终要完成什么？' })}
          rows={2}
          className="mt-1.5 w-full resize-none rounded-[7px] border border-transparent bg-foreground/[0.035] px-2.5 py-2 text-xs leading-5 text-foreground outline-none transition-colors placeholder:text-muted-foreground/55 hover:bg-foreground/[0.045] focus:border-foreground/15 focus:bg-background"
        />

        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="min-w-0 text-[10px] font-medium text-muted-foreground">
            {t('taskContinuity.priority', { defaultValue: '优先级' })}
            <select
              value={session.taskPriority ?? 'medium'}
              onChange={(event) => void runCommand({
                type: 'setTaskDetails',
                patch: { priority: event.target.value as TaskPriority },
              })}
              className="mt-1.5 h-8 w-full rounded-[7px] border border-border/50 bg-background px-2 text-xs text-foreground outline-none"
            >
              <option value="low">{t('taskContinuity.priorityLow', { defaultValue: '低' })}</option>
              <option value="medium">{t('taskContinuity.priorityMedium', { defaultValue: '普通' })}</option>
              <option value="high">{t('taskContinuity.priorityHigh', { defaultValue: '高' })}</option>
            </select>
          </label>
          <label className="min-w-0 text-[10px] font-medium text-muted-foreground">
            {t('taskContinuity.dueAt', { defaultValue: '截止时间' })}
            <input
              type="datetime-local"
              value={toDateTimeLocal(session.taskDueAt)}
              onChange={(event) => void runCommand({
                type: 'setTaskDetails',
                patch: { dueAt: fromDateTimeLocal(event.target.value) },
              })}
              className="mt-1.5 h-8 w-full rounded-[7px] border border-border/50 bg-background px-2 text-[11px] text-foreground outline-none"
            />
          </label>
        </div>

        <label className="mt-2 block text-[10px] font-medium text-muted-foreground">
          {t('taskContinuity.reminderAt', { defaultValue: '提醒时间' })}
          <input
            type="datetime-local"
            value={toDateTimeLocal(session.taskReminderAt)}
            onChange={(event) => void runCommand({
              type: 'setTaskDetails',
              patch: { reminderAt: fromDateTimeLocal(event.target.value) },
            })}
            className={cn(
              'mt-1.5 h-8 w-full rounded-[7px] border bg-background px-2 text-[11px] text-foreground outline-none',
              reminderDue ? 'border-amber-500/40' : 'border-border/50',
            )}
          />
        </label>

        {(due || reminderDue) && (
          <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
            <span>{due ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(due) : ''}</span>
            {reminderDue && (
              <button
                type="button"
                onClick={() => void runCommand({ type: 'setTaskDetails', patch: { acknowledgeReminder: true } })}
                className="rounded-control px-2 py-1 text-amber-600 transition-colors hover:bg-amber-500/10"
              >
                {t('taskContinuity.acknowledge', { defaultValue: '标记已处理' })}
              </button>
            )}
          </div>
        )}

        {latest && (
          <div className="mt-3 border-t border-border/50 pt-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-medium text-muted-foreground">
                  {t('taskContinuity.latestCheckpoint', { defaultValue: '最近检查点' })}
                </span>
                <span className={cn(
                  'rounded-full px-1.5 py-0.5 text-[9px] font-medium',
                  latest.outcome === 'failed'
                    ? 'bg-destructive/10 text-destructive'
                    : latest.outcome === 'interrupted'
                      ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
                      : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
                )}>
                  {t(`taskContinuity.outcome.${latest.outcome}`)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => void runCommand({ type: 'deleteTaskCheckpoint', checkpointId: latest.id })}
                className="flex size-6 items-center justify-center rounded-control text-muted-foreground/60 hover:bg-foreground/[0.05] hover:text-destructive"
                aria-label={t('taskContinuity.deleteCheckpoint', { defaultValue: '删除检查点' })}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
            <p className="mt-1 line-clamp-4 text-xs leading-5 text-foreground/80">{latest.summary}</p>
            {!!latest.nextSteps?.length && (
              <ul className="mt-2 space-y-1 text-[11px] leading-4 text-muted-foreground">
                {latest.nextSteps.slice(0, 3).map((item) => <li key={item}>· {item}</li>)}
              </ul>
            )}
            {!!latest.blockers?.length && (
              <div className="mt-2 rounded-[7px] bg-amber-500/[0.07] px-2.5 py-2 text-[11px] leading-4 text-amber-800 dark:text-amber-200">
                <span className="font-medium">{t('taskContinuity.blockers')}</span>
                <span className="ml-1">{latest.blockers.slice(0, 2).join(' · ')}</span>
              </div>
            )}
            {!!latest.relatedFiles?.length && (
              <div className="mt-2 flex flex-wrap gap-1">
                {latest.relatedFiles.slice(0, 3).map((file) => (
                  <span key={file} className="max-w-full truncate rounded-control bg-foreground/[0.04] px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">
                    {file}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="mt-3 flex items-center gap-2 border-t border-border/50 pt-3">
          <button
            type="button"
            disabled={saving}
            onClick={() => void runCommand({ type: 'createTaskCheckpoint' })}
            className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-[7px] border border-border/60 bg-background px-2 text-[11px] font-medium text-foreground transition-colors hover:bg-foreground/[0.03] disabled:opacity-50"
          >
            <ListChecks className="h-3.5 w-3.5" />
            {t('taskContinuity.saveCheckpoint', { defaultValue: '保存检查点' })}
          </button>
          <button
            type="button"
            disabled={session.isProcessing}
            onClick={continueTask}
            className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-[7px] bg-foreground px-2 text-[11px] font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            <Play className="h-3.5 w-3.5" />
            {t('taskContinuity.continue', { defaultValue: '继续任务' })}
          </button>
        </div>
      </div>
    </section>
  )
}
