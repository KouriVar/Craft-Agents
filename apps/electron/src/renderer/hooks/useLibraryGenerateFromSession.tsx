/**
 * Shared hook: open consent dialog → generate document from session (AI or preserve).
 */

import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type { LibraryDocumentTemplateId } from '@craft-agent/shared/protocol'
import { createDocumentFromSession, type LibraryConsentPromptResult } from '@/lib/library-from-session'
import { navigate, routes } from '@/lib/navigate'
import { LibraryGenerateConsentDialog } from '@/components/library/LibraryGenerateConsentDialog'

export function useLibraryGenerateFromSession(workspaceId: string | null | undefined) {
  const { t, i18n } = useTranslation()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'ask' | 'deny'>('ask')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'preparing' | 'generating' | 'writing' | 'done' | 'error'>('idle')
  const [resolver, setResolver] = useState<((r: LibraryConsentPromptResult) => void) | null>(null)

  const promptConsent = useCallback((info: { decision: 'ask' | 'deny' }) => {
    return new Promise<LibraryConsentPromptResult>((resolve) => {
      setMode(info.decision)
      setOpen(true)
      setResolver(() => resolve)
    })
  }, [])

  const start = useCallback(async (targetSessionId: string, templateId?: LibraryDocumentTemplateId) => {
    if (!workspaceId) return
    setSessionId(targetSessionId)
    setStatus('preparing')
    const toastId = toast.loading(t('library.statusPreparing'))

    const result = await createDocumentFromSession({
      workspaceId,
      sessionId: targetSessionId,
      templateId,
      locale: i18n.resolvedLanguage || i18n.language,
      t,
      promptConsent,
      onStatus: (s) => {
        setStatus(s)
        if (s === 'generating') toast.loading(t('library.statusGenerating'), { id: toastId })
        else if (s === 'writing') toast.loading(t('library.statusWriting'), { id: toastId })
      },
    })

    if (result.openPrivacySettings) {
      toast.error(t('library.consentDeniedHint'), { id: toastId })
      navigate(routes.view.settings('privacy'))
      setStatus('error')
      return
    }

    if (!result.ok) {
      if (result.error === 'session_too_long') {
        const used = result.sessionStats?.usedMessages ?? 0
        const total = result.sessionStats?.totalMessages ?? 0
        toast.error(t('library.sessionTooLong', { used, total }), { id: toastId })
      } else if (result.error !== 'consent_denied') {
        toast.error(t('library.createFromSessionFailed', { detail: result.error || '' }), { id: toastId })
      } else {
        toast.dismiss(toastId)
      }
      setStatus('error')
      return
    }

    if (result.generationMode === 'excerpt_fallback') {
      toast.warning(result.warning || t('library.aiFallbackWarning'), { id: toastId })
    } else if (result.generationMode === 'preserve') {
      toast.success(t('library.statusDonePreserve'), { id: toastId })
    } else {
      toast.success(t('library.statusDone'), { id: toastId })
    }
    setStatus('done')
  }, [workspaceId, t, i18n.language, i18n.resolvedLanguage, promptConsent])

  const dialog = (
    <LibraryGenerateConsentDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next && resolver) {
          resolver({ action: 'cancel' })
          setResolver(null)
        }
      }}
      mode={mode}
      onDecision={(decision) => {
        resolver?.(decision)
        setResolver(null)
      }}
    />
  )

  return { start, dialog, status, sessionId }
}
