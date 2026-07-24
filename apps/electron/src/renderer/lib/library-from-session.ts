/**
 * Create a library document from a session (interactive privacy-aware + AI/preserve).
 * Always collects generateMode from the user before writing.
 */

import type { LibraryDocumentTemplateId, LibraryGenerateMode } from '@craft-agent/shared/protocol'
import { navigate, routes } from '@/lib/navigate'

export type CreateDocumentFromSessionResult = {
  ok: boolean
  error?: string
  privacyDecision?: 'allow' | 'ask' | 'deny'
  generationMode?: 'ai' | 'excerpt_fallback' | 'preserve'
  warning?: string
  openPrivacySettings?: boolean
  needsMessageRange?: boolean
  sessionStats?: {
    totalMessages: number
    usedMessages: number
    estimatedChars: number
    truncated: boolean
    preserveBlockCount: number
  }
}

export type LibraryConsentPromptResult =
  | { action: 'allow'; templateId: LibraryDocumentTemplateId; generateMode: LibraryGenerateMode }
  | { action: 'cancel' }
  | { action: 'denied_settings' }

export async function createDocumentFromSession(options: {
  workspaceId: string
  sessionId: string
  templateId?: LibraryDocumentTemplateId
  generateMode?: LibraryGenerateMode
  messageIds?: string[]
  locale?: string
  t: (key: string, opts?: Record<string, unknown>) => string
  /**
   * Always shown before generate so the user can pick AI vs preserve (+ template).
   * Also used when privacy is deny.
   */
  promptConsent: (info: {
    decision: 'ask' | 'deny'
    reason?: string
  }) => Promise<LibraryConsentPromptResult>
  onStatus?: (status: 'preparing' | 'generating' | 'writing' | 'done' | 'error') => void
}): Promise<CreateDocumentFromSessionResult> {
  options.onStatus?.('preparing')

  // Mode selection first — required even when privacy is allow
  const choice = await options.promptConsent({ decision: 'ask' })
  if (choice.action === 'cancel') {
    options.onStatus?.('error')
    return { ok: false, error: 'consent_denied' }
  }
  if (choice.action === 'denied_settings') {
    options.onStatus?.('error')
    return { ok: false, error: 'permission_denied', privacyDecision: 'deny', openPrivacySettings: true }
  }

  const templateId = choice.templateId
  const generateMode = choice.generateMode
  options.onStatus?.(generateMode === 'preserve' ? 'writing' : 'generating')

  const invoke = (consentToken?: string) => window.electronAPI.createLibraryDocumentFromSession({
    workspaceId: options.workspaceId,
    sessionId: options.sessionId,
    templateId,
    generateMode,
    messageIds: options.messageIds,
    locale: options.locale,
    consentToken,
  })

  let result = await invoke()

  // Privacy deny after user already picked mode
  if (result.privacy?.decision === 'deny') {
    options.onStatus?.('error')
    const denyChoice = await options.promptConsent({ decision: 'deny', reason: result.privacy.reason })
    if (denyChoice.action === 'denied_settings') {
      return { ok: false, error: 'permission_denied', privacyDecision: 'deny', openPrivacySettings: true }
    }
    return {
      ok: false,
      error: result.error || result.privacy.reason || 'permission_denied',
      privacyDecision: 'deny',
      openPrivacySettings: true,
    }
  }

  // Ask: server returns one-time consentToken — never send consentGranted boolean
  if (!result.ok && (result.error === 'consent_required' || result.privacy?.decision === 'ask') && result.consentToken) {
    result = await invoke(result.consentToken)
  }

  if (result.needsMessageRange) {
    options.onStatus?.('error')
    return {
      ok: false,
      error: 'session_too_long',
      needsMessageRange: true,
      sessionStats: result.sessionStats,
    }
  }

  if (result.ok && result.document) {
    options.onStatus?.('writing')
    options.onStatus?.('done')
    navigate(routes.view.library(result.document.meta.id))
    return {
      ok: true,
      generationMode: result.generation?.mode,
      warning: result.generation?.warning,
      sessionStats: result.sessionStats,
      privacyDecision: result.privacy?.decision,
    }
  }

  options.onStatus?.('error')
  return {
    ok: false,
    error: result.error || result.privacy?.reason || 'failed',
    generationMode: result.generation?.mode,
    warning: result.generation?.warning,
  }
}
