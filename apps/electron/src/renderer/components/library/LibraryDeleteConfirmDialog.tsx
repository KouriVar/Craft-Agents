/**
 * LibraryDeleteConfirmDialog — CA Dialog confirmation for library document delete.
 * Replaces window.confirm while keeping the same delete API call at the call site.
 */

import { useState } from 'react'
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

export function LibraryDeleteConfirmDialog({
  open,
  documentTitle,
  onOpenChange,
  onConfirm,
}: {
  open: boolean
  documentTitle: string
  onOpenChange: (open: boolean) => void
  onConfirm: () => void | Promise<void>
}) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)

  const handleConfirm = async () => {
    if (busy) return
    setBusy(true)
    try {
      await onConfirm()
      onOpenChange(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('library.delete')}</DialogTitle>
          <DialogDescription>
            {t('library.deleteConfirm', { name: documentTitle || t('library.documentKind') })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button variant="destructive" onClick={() => { void handleConfirm() }} disabled={busy}>
            {t('common.delete')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
