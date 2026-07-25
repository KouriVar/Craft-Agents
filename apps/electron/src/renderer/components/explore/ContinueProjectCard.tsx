/**
 * Lightweight "Continue last project" entry for Explore/Today (v0.16.3 Task 2).
 * Does not change launch routing — user must click.
 */

import { FolderKanban, Play } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { LoadedProject } from '@craft-agent/shared/projects/types'
import type { SessionMeta } from '@/atoms/sessions'
import { Button } from '@/components/ui/button'

interface ContinueProjectCardProps {
  project: LoadedProject
  resumeSession: SessionMeta | null
  onOpenProject: () => void
  onContinue?: () => void
  continueDisabled?: boolean
}

export function ContinueProjectCard({
  project,
  resumeSession,
  onOpenProject,
  onContinue,
  continueDisabled,
}: ContinueProjectCardProps) {
  const { t } = useTranslation()
  const checkpoint = resumeSession?.taskCheckpoints?.at(-1)
  const goal = resumeSession?.taskGoal?.trim()
  const summary = checkpoint?.summary?.trim()
  const nextStep = checkpoint?.nextSteps?.[0]

  return (
    <section
      aria-label={t('projectInfo.resumeTitle')}
      className="rounded-[10px] border border-border/60 bg-background p-3 shadow-minimal"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-xs font-semibold text-muted-foreground">
            {t('projectInfo.resumeTitle')}
          </h3>
          <button
            type="button"
            onClick={onOpenProject}
            className="mt-1 flex max-w-full items-center gap-1.5 text-left"
          >
            {project.config.color && (
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: project.config.color }}
              />
            )}
            {!project.config.color && (
              <FolderKanban className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            )}
            <span className="truncate text-sm font-medium text-foreground hover:underline">
              {project.config.name}
            </span>
          </button>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button size="sm" variant="ghost" onClick={onOpenProject}>
            {t('today.continueProject.openProject')}
          </Button>
          {resumeSession && onContinue && (
            <Button size="sm" onClick={onContinue} disabled={continueDisabled}>
              <Play className="mr-1 h-3.5 w-3.5" />
              {t('taskContinuity.continue')}
            </Button>
          )}
        </div>
      </div>

      {(goal || summary || nextStep) && (
        <div className="mt-3 border-t border-border/50 pt-3 text-xs leading-5 text-foreground/80">
          {goal && (
            <p className="line-clamp-2">
              <span className="text-[10px] font-medium text-muted-foreground">
                {t('taskContinuity.goal')}
              </span>
              <span className="mt-0.5 block">{goal}</span>
            </p>
          )}
          {summary && (
            <p className={`line-clamp-2 ${goal ? 'mt-2' : ''}`}>
              <span className="text-[10px] font-medium text-muted-foreground">
                {t('taskContinuity.latestCheckpoint')}
              </span>
              <span className="mt-0.5 block text-foreground/75">{summary}</span>
            </p>
          )}
          {nextStep && (
            <p className="mt-2 text-[11px] text-muted-foreground line-clamp-1">
              · {nextStep}
            </p>
          )}
        </div>
      )}
    </section>
  )
}
