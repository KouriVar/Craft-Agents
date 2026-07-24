/**
 * PendingQueue UI — unified pending cards with continue / complete+archive / snooze.
 */

import { useMemo, useState, type CSSProperties } from 'react'
import {
  Archive,
  CheckCircle2,
  ChevronRight,
  Clock3,
  MoreHorizontal,
  Play,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  StyledDropdownMenuContent,
  StyledDropdownMenuItem,
  StyledDropdownMenuSeparator,
} from '@/components/ui/styled-dropdown'
import type { PendingItem } from './pending-queue'
import { pendingSnoozeKey } from './pending-queue'

export type SnoozePreset = 'tomorrow' | '3days' | 'nextWeek' | 'indefinite'

export function PendingQueueSection({
  items,
  busyId,
  onContinue,
  onCompleteAndArchive,
  onSnooze,
  onShowEvidence,
}: {
  items: PendingItem[]
  busyId?: string | null
  onContinue: (item: PendingItem) => void
  onCompleteAndArchive: (item: PendingItem) => void
  onSnooze: (item: PendingItem, preset: SnoozePreset) => void
  onShowEvidence?: (item: PendingItem) => void
}) {
  const { t, i18n } = useTranslation()

  return (
    <section aria-labelledby="pending-heading" className="flex flex-col gap-2.5">
      <div className="flex items-end justify-between gap-3 px-0.5">
        <div>
          <h2 id="pending-heading" className="text-sm font-medium text-foreground">
            {t('today.pending.title')}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t('today.pending.description')}
          </p>
        </div>
        {items.length > 0 && (
          <span className="pb-0.5 text-[11px] tabular-nums text-muted-foreground/70">
            {t('today.pending.itemCount', { count: items.length })}
          </span>
        )}
      </div>

      {items.length === 0 ? (
        <div className="rounded-[12px] border border-border/55 bg-background px-5 py-8 shadow-minimal">
          <p className="text-sm font-medium text-foreground">{t('today.pending.emptyTitle')}</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{t('today.pending.emptyDescription')}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-[12px] border border-border/55 bg-background shadow-minimal">
          {items.map((item) => {
            const busy = busyId === item.id
            return (
              <div
                key={item.id}
                className="flex flex-col gap-2.5 border-t border-border/45 px-4 py-3.5 first:border-t-0 md:px-5"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <span
                    className={cn(
                      'mt-1.5 size-1.5 shrink-0 rounded-full',
                      item.reasonCodes.includes('overdue') || item.reasonCodes.includes('failed')
                        ? 'bg-destructive'
                        : item.reasonCodes.includes('reminder') || item.reasonCodes.includes('dueToday')
                          ? 'bg-amber-500'
                          : 'bg-accent',
                    )}
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
                      {item.priority === 'high' && (
                        <span className="shrink-0 text-[10px] font-medium text-destructive/80">
                          {t('taskContinuity.priorityHigh', { defaultValue: '高' })}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 text-xs">
                      <span className="font-medium text-muted-foreground">
                        {t(item.statusLabelKey)}
                      </span>
                      <span className="text-muted-foreground/35" aria-hidden="true">·</span>
                      <span className="text-muted-foreground">{t(item.reasonLabelKey)}</span>
                      {item.dueAt && (
                        <>
                          <span className="text-muted-foreground/35" aria-hidden="true">·</span>
                          <span className="tabular-nums text-muted-foreground/80">
                            {new Intl.DateTimeFormat(i18n.resolvedLanguage ?? i18n.language, {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            }).format(item.dueAt)}
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 pl-4">
                  <ActionButton
                    disabled={busy || !item.sessionId}
                    onClick={() => onContinue(item)}
                    icon={Play}
                    label={t('today.pending.continue')}
                    primary
                  />
                  <ActionButton
                    disabled={busy || !item.sessionId}
                    onClick={() => onCompleteAndArchive(item)}
                    icon={CheckCircle2}
                    label={t('today.pending.completeAndArchive')}
                  />
                  <SnoozeMenu
                    disabled={busy}
                    onSnooze={(preset) => onSnooze(item, preset)}
                  />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        disabled={busy}
                        aria-label={t('today.pending.more')}
                        className="flex size-8 items-center justify-center rounded-control text-muted-foreground transition-colors hover:bg-foreground/[0.05] hover:text-foreground disabled:opacity-50"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <StyledDropdownMenuContent align="end" sideOffset={6} minWidth="min-w-48">
                      {onShowEvidence && (
                        <StyledDropdownMenuItem onClick={() => onShowEvidence(item)}>
                          {t('today.pending.viewEvidence')}
                        </StyledDropdownMenuItem>
                      )}
                      <StyledDropdownMenuItem
                        disabled={!item.sessionId}
                        onClick={() => onCompleteAndArchive(item)}
                      >
                        <Archive className="mr-2 h-3.5 w-3.5" />
                        {t('today.pending.archiveOnlyHint')}
                      </StyledDropdownMenuItem>
                    </StyledDropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

function ActionButton({
  label,
  icon: Icon,
  onClick,
  disabled,
  primary,
}: {
  label: string
  icon: typeof Play
  onClick: () => void
  disabled?: boolean
  primary?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-control px-2.5 text-xs font-medium transition-colors disabled:opacity-50',
        primary
          ? 'bg-accent text-white shadow-tinted hover:bg-accent/90'
          : 'bg-foreground/[0.04] text-foreground hover:bg-foreground/[0.07]',
      )}
      style={primary ? { '--shadow-color': 'var(--accent-rgb)' } as CSSProperties : undefined}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  )
}

function SnoozeMenu({
  disabled,
  onSnooze,
}: {
  disabled?: boolean
  onSnooze: (preset: SnoozePreset) => void
}) {
  const { t } = useTranslation()
  const [openHint, setOpenHint] = useState(false)
  return (
    <DropdownMenu onOpenChange={setOpenHint}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="inline-flex h-8 items-center gap-1.5 rounded-control bg-foreground/[0.04] px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-foreground/[0.07] disabled:opacity-50"
        >
          <Clock3 className="h-3.5 w-3.5" />
          {t('today.pending.snooze')}
        </button>
      </DropdownMenuTrigger>
      <StyledDropdownMenuContent align="start" sideOffset={6} minWidth="min-w-52">
        <StyledDropdownMenuItem onClick={() => onSnooze('tomorrow')}>
          {t('today.pending.snoozeTomorrow')}
        </StyledDropdownMenuItem>
        <StyledDropdownMenuItem onClick={() => onSnooze('3days')}>
          {t('today.pending.snooze3Days')}
        </StyledDropdownMenuItem>
        <StyledDropdownMenuItem onClick={() => onSnooze('nextWeek')}>
          {t('today.pending.snoozeNextWeek')}
        </StyledDropdownMenuItem>
        <StyledDropdownMenuSeparator />
        <StyledDropdownMenuItem onClick={() => onSnooze('indefinite')}>
          {t('today.pending.snoozeIndefinite')}
        </StyledDropdownMenuItem>
        {openHint && (
          <p className="px-2 pb-2 pt-1 text-[10px] leading-4 text-muted-foreground">
            {t('today.pending.snoozeIndefiniteHint')}
          </p>
        )}
      </StyledDropdownMenuContent>
    </DropdownMenu>
  )
}

export function PendingEvidencePanel({
  item,
  onClose,
}: {
  item: PendingItem
  onClose: () => void
}) {
  const { t } = useTranslation()
  const sources = useMemo(() => item.sources.join(', '), [item.sources])
  return (
    <div className="rounded-[12px] border border-border/55 bg-background p-4 shadow-minimal">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-foreground">{t('today.pending.evidenceTitle')}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{item.title}</p>
        </div>
        <button type="button" onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">
          {t('common.close', { defaultValue: 'Close' })}
        </button>
      </div>
      <dl className="mt-3 space-y-2 text-xs">
        <div>
          <dt className="text-muted-foreground">{t('today.pending.evidenceReasons')}</dt>
          <dd className="mt-0.5 text-foreground">{item.reasonCodes.join(', ')}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t('today.pending.evidenceSources')}</dt>
          <dd className="mt-0.5 text-foreground">{sources}</dd>
        </div>
        {item.evidenceRef?.guidanceId && (
          <div>
            <dt className="text-muted-foreground">Guidance</dt>
            <dd className="mt-0.5 font-mono text-foreground">{item.evidenceRef.guidanceId}</dd>
          </div>
        )}
        {item.evidenceRef?.loopId && (
          <div>
            <dt className="text-muted-foreground">Loop</dt>
            <dd className="mt-0.5 font-mono text-foreground">{item.evidenceRef.loopId}</dd>
          </div>
        )}
        {item.sourceKinds && item.sourceKinds.length > 0 && (
          <div>
            <dt className="text-muted-foreground">sourceKinds</dt>
            <dd className="mt-0.5 font-mono text-foreground">{item.sourceKinds.join(', ')}</dd>
          </div>
        )}
        <div>
          <dt className="text-muted-foreground">targetKey</dt>
          <dd className="mt-0.5 font-mono text-foreground">{pendingSnoozeKey(item)}</dd>
        </div>
      </dl>
    </div>
  )
}
