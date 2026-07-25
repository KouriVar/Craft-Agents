/**
 * Project Resume helpers (v0.16.3) — derive "where did we leave off" from
 * existing SessionMeta. No new storage; pure client-side selection.
 */

import type { SessionMeta } from '@/atoms/sessions'

export function isSessionCompleted(meta: SessionMeta): boolean {
  return meta.kanbanColumn === 'done' || meta.sessionStatus === 'done'
}

export function hasResumeData(meta: SessionMeta): boolean {
  return Boolean(meta.taskGoal?.trim()) || (meta.taskCheckpoints?.length ?? 0) > 0
}

/**
 * Most recently active unfinished project session that carries continuity data
 * (taskGoal and/or taskCheckpoints). Returns null when nothing is resume-worthy.
 */
export function findProjectResumeSession(
  sessions: Iterable<SessionMeta>,
  projectId: string,
): SessionMeta | null {
  const candidates: SessionMeta[] = []
  for (const meta of sessions) {
    if (meta.projectId !== projectId) continue
    if (isSessionCompleted(meta)) continue
    if (!hasResumeData(meta)) continue
    candidates.push(meta)
  }
  candidates.sort(
    (a, b) => (b.lastMessageAt ?? b.createdAt ?? 0) - (a.lastMessageAt ?? a.createdAt ?? 0),
  )
  return candidates[0] ?? null
}

type Translate = (key: string, options?: Record<string, unknown>) => string

/**
 * Same continue-prompt shape as TaskContinuitySection.continueTask — kept as a
 * pure helper so Project Resume does not embed the full editing UI.
 */
export function buildContinueTaskPrompt(meta: SessionMeta, t: Translate): string {
  const latest = meta.taskCheckpoints?.at(-1)
  const nextSteps = latest?.nextSteps?.length
    ? latest.nextSteps.map((item) => `- ${item}`).join('\n')
    : ''
  if (latest) {
    return t('taskContinuity.continuePromptWithCheckpoint', {
      summary: latest.summary,
      nextSteps: nextSteps ? t('taskContinuity.continuePromptNextSteps', { nextSteps }) : '',
    })
  }
  return t('taskContinuity.continuePromptWithoutCheckpoint', {
    task: meta.taskGoal || meta.name || meta.preview || t('taskContinuity.currentTask'),
  })
}
