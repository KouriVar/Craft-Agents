/**
 * Session context-action handlers — orchestrate existing helpers / electronAPI.
 */

import i18n from 'i18next'
import { getDefaultStore } from 'jotai'
import { sessionMetaMapAtom, type SessionMeta } from '@/atoms/sessions'
import { navigate, routes } from '@/lib/navigate'
import {
  buildContinueTaskPrompt,
  findProjectResumeSession,
  hasResumeData,
  isSessionCompleted,
} from '@/lib/project-resume'
import { requireContextActionHost } from '../runtime-host'
import type { ActionContext, ContextAction, ContextActionPayload } from '../types'

function resolveContinueTarget(context: ActionContext): SessionMeta | null {
  const metaMap = getDefaultStore().get(sessionMetaMapAtom)

  if (context.sessionId) {
    const current = metaMap.get(context.sessionId)
    if (current && !isSessionCompleted(current) && hasResumeData(current)) {
      return current
    }
  }

  if (context.projectId) {
    return findProjectResumeSession(metaMap.values(), context.projectId)
  }

  return null
}

export async function runSessionContinue(
  context: ActionContext,
  _payload?: ContextActionPayload,
): Promise<void> {
  const target = resolveContinueTarget(context)
  if (!target) return

  const prompt = buildContinueTaskPrompt(target, (key, opts) => i18n.t(key, opts))
  navigate(routes.view.allSessions(target.id))
  requireContextActionHost().sendMessage(target.id, prompt)
}

export async function runSessionArchive(
  context: ActionContext,
  _payload?: ContextActionPayload,
): Promise<void> {
  if (!context.sessionId) return
  await window.electronAPI.sessionCommand(context.sessionId, { type: 'archive' })
}

export const sessionContinueAction: ContextAction = {
  id: 'session.continue',
  group: 'session',
  labelKey: 'contextActions.session.continue',
  icon: 'Play',
  surfaces: ['dropdown', 'command-menu'],
  isAvailable: (context) => context.flags.canContinue,
  run: runSessionContinue,
}

export const sessionArchiveAction: ContextAction = {
  id: 'session.archive',
  group: 'session',
  labelKey: 'contextActions.session.archive',
  icon: 'Archive',
  surfaces: ['dropdown', 'command-menu'],
  isAvailable: (context) => Boolean(context.sessionId) && context.flags.canArchive,
  run: runSessionArchive,
}
