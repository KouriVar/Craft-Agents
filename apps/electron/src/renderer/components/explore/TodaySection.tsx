import { ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { SessionMeta } from '@/atoms/sessions'
import { cn } from '@/lib/utils'
import { buildTodayTasks, type TodayReason } from './task-today'

const REASON_DOT_STYLES: Record<TodayReason, string> = {
  reminder: 'bg-amber-500',
  overdue: 'bg-destructive',
  dueToday: 'bg-orange-500',
  failed: 'bg-destructive',
  waiting: 'bg-violet-500',
  active: 'bg-blue-500',
  automation: 'bg-cyan-500',
  unread: 'bg-accent',
  resume: 'bg-emerald-500',
  recent: 'bg-muted-foreground/55',
}

const REASON_TEXT_STYLES: Record<TodayReason, string> = {
  reminder: 'text-amber-700 dark:text-amber-300',
  overdue: 'text-destructive',
  dueToday: 'text-orange-700 dark:text-orange-300',
  failed: 'text-destructive',
  waiting: 'text-violet-700 dark:text-violet-300',
  active: 'text-blue-700 dark:text-blue-300',
  automation: 'text-cyan-700 dark:text-cyan-300',
  unread: 'text-accent',
  resume: 'text-emerald-700 dark:text-emerald-300',
  recent: 'text-muted-foreground',
}

export function TodaySection({ sessions, onOpenSession }: {
  sessions: SessionMeta[]
  onOpenSession: (sessionId: string) => void
}) {
  const { t, i18n } = useTranslation()
  const items = buildTodayTasks(sessions).slice(0, 6)

  return (
    <section aria-labelledby="today-heading" className="flex flex-col gap-2.5">
      <div className="flex items-end justify-between gap-3 px-0.5">
        <div>
          <h2 id="today-heading" className="text-sm font-medium text-foreground">
            {t('today.title', { defaultValue: '今天' })}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t('today.description', { defaultValue: '需要继续、确认或处理的任务' })}
          </p>
        </div>
        {items.length > 0 && (
          <span className="pb-0.5 text-[11px] tabular-nums text-muted-foreground/70">
            {t('today.itemCount', { count: items.length })}
          </span>
        )}
      </div>

      {items.length > 0 ? (
        <div className="overflow-hidden rounded-[12px] border border-border/55 bg-background shadow-minimal">
          {items.map(({ session, reason }) => {
            const checkpoint = session.taskCheckpoints?.at(-1)
            const detail = checkpoint?.nextSteps?.[0] || session.taskGoal || checkpoint?.summary || session.preview
            return (
              <button
                key={session.id}
                type="button"
                onClick={() => onOpenSession(session.id)}
                className="group flex min-h-[68px] w-full items-center gap-3.5 border-t border-border/45 px-4 py-3 text-left transition-colors first:border-t-0 hover:bg-foreground/[0.025] focus-visible:bg-foreground/[0.025] focus-visible:outline-none md:px-5"
              >
                <span className={cn('size-1.5 shrink-0 rounded-full', REASON_DOT_STYLES[reason])} aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">{session.name || session.preview || t('chat.titlePlaceholder')}</span>
                  <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs">
                    <span className={cn('shrink-0 font-medium', REASON_TEXT_STYLES[reason])}>
                      {t(`today.reason.${reason}`, { defaultValue: reason })}
                    </span>
                    {detail && (
                      <>
                        <span className="text-muted-foreground/35" aria-hidden="true">·</span>
                        <span className="truncate text-muted-foreground">{detail}</span>
                      </>
                    )}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2.5">
                  <span className="flex flex-col items-end gap-0.5">
                    {session.taskPriority === 'high' && (
                      <span className="text-[10px] font-medium text-destructive/80">
                        {t('taskContinuity.priorityHigh', { defaultValue: '高' })}
                      </span>
                    )}
                    {session.taskDueAt && (
                      <span className="text-[10px] tabular-nums text-muted-foreground/70">
                        {new Intl.DateTimeFormat(i18n.resolvedLanguage ?? i18n.language, {
                          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                        }).format(session.taskDueAt)}
                      </span>
                    )}
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground/25 opacity-0 transition-[opacity,transform] group-hover:translate-x-0.5 group-hover:opacity-100 group-focus-visible:opacity-100" />
                </span>
              </button>
            )
          })}
        </div>
      ) : (
        <div className="rounded-card border border-dashed border-border/70 px-5 py-7 text-center">
          <p className="text-sm font-medium text-foreground/80">{t('today.emptyTitle', { defaultValue: '今天没有待处理任务' })}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t('today.emptyDescription', { defaultValue: '新的提醒、执行结果和待继续任务会出现在这里。' })}</p>
        </div>
      )}
    </section>
  )
}
