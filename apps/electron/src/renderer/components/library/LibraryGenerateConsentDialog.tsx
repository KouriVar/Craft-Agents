/**
 * Consent + generate-mode + template dialog for「整理成文档」.
 */

import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  LIBRARY_TEMPLATE_IDS,
  type LibraryDocumentTemplateId,
  type LibraryGenerateMode,
} from '@craft-agent/shared/library'
import { cn } from '@/lib/utils'

export type LibraryConsentDecision =
  | { action: 'allow'; templateId: LibraryDocumentTemplateId; generateMode: LibraryGenerateMode }
  | { action: 'cancel' }
  | { action: 'denied_settings' }

export function LibraryGenerateConsentDialog({
  open,
  onOpenChange,
  mode,
  modelLabel,
  messageScopeLabel,
  defaultTemplateId = 'general',
  defaultGenerateMode = 'ai',
  onDecision,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'ask' | 'deny'
  modelLabel?: string
  messageScopeLabel?: string
  defaultTemplateId?: LibraryDocumentTemplateId
  defaultGenerateMode?: LibraryGenerateMode
  onDecision: (decision: LibraryConsentDecision) => void
}) {
  const { t } = useTranslation()
  const [templateId, setTemplateId] = useState<LibraryDocumentTemplateId>(defaultTemplateId)
  const [generateMode, setGenerateMode] = useState<LibraryGenerateMode>(defaultGenerateMode)

  useEffect(() => {
    if (open) {
      setTemplateId(defaultTemplateId)
      setGenerateMode(defaultGenerateMode)
    }
  }, [open, defaultTemplateId, defaultGenerateMode])

  const templateOptions = useMemo(() => LIBRARY_TEMPLATE_IDS.map((id) => ({
    id,
    label: t(`library.template.${id}`),
  })), [t])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{t('library.consentTitle')}</DialogTitle>
          <DialogDescription className="text-left text-xs leading-relaxed">
            {t('library.consentDescription')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 rounded-[8px] border border-border/50 bg-foreground/[0.02] px-3 py-2.5 text-[11px] text-muted-foreground">
          <p>{t('library.consentSource')}: {t('library.consentSourceSession')}</p>
          <p>{t('library.consentScope')}: {messageScopeLabel || t('library.consentScopeAll')}</p>
          <p>{t('library.consentModel')}: {modelLabel || t('library.consentModelDefault')}</p>
          <p>{t('library.consentPurpose')}</p>
          <p>{t('library.consentNoSessionMutate')}</p>
          <p>{t('library.consentNoCognition')}</p>
        </div>

        {mode === 'ask' && (
          <>
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-foreground">{t('library.generateModeLabel')}</p>
              <div className="space-y-1.5">
                {([
                  { id: 'ai' as const, label: t('library.generateModeAi'), hint: t('library.generateModeAiHint') },
                  { id: 'preserve' as const, label: t('library.generateModePreserve'), hint: t('library.generateModePreserveHint') },
                ]).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setGenerateMode(opt.id)}
                    className={cn(
                      'flex w-full flex-col rounded-control border px-2.5 py-2 text-left',
                      generateMode === opt.id
                        ? 'border-foreground/30 bg-foreground/[0.06]'
                        : 'border-border/40 hover:bg-foreground/[0.04]',
                    )}
                  >
                    <span className="text-[11px] font-medium text-foreground">
                      {generateMode === opt.id ? '● ' : '○ '}{opt.label}
                    </span>
                    <span className="mt-0.5 text-[10px] text-muted-foreground">{opt.hint}</span>
                  </button>
                ))}
              </div>
            </div>

            {generateMode === 'ai' && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-foreground">{t('library.chooseTemplate')}</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {templateOptions.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setTemplateId(opt.id)}
                      className={cn(
                        'rounded-control border px-2 py-1.5 text-left text-[11px]',
                        templateId === opt.id
                          ? 'border-foreground/30 bg-foreground/[0.06] text-foreground'
                          : 'border-border/40 text-muted-foreground hover:bg-foreground/[0.04]',
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {mode === 'deny' && (
          <p className="text-xs text-destructive">{t('library.consentDeniedHint')}</p>
        )}

        <DialogFooter className="gap-2 sm:justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              onDecision({ action: 'cancel' })
              onOpenChange(false)
            }}
          >
            {t('library.consentCancel')}
          </Button>
          {mode === 'deny' ? (
            <Button
              type="button"
              size="sm"
              onClick={() => {
                onDecision({ action: 'denied_settings' })
                onOpenChange(false)
              }}
            >
              {t('library.consentOpenPrivacy')}
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              onClick={() => {
                onDecision({ action: 'allow', templateId, generateMode })
                onOpenChange(false)
              }}
            >
              {t('library.consentAllowOnce')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
