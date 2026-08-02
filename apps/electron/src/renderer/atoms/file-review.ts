import { atom } from 'jotai'
import type { FilePreviewState } from '@/hooks/useLinkInterceptor'
import type { FileChange } from '@craft-agent/ui'

export type FileReviewOpenMode = 'fullscreen' | 'sidebar'

export interface DiffReviewPreview {
  changes: FileChange[]
  consolidated: boolean
  focusedChangeId?: string
}

/** Latest preview routed to the docked review panel. */
export const fileReviewPreviewAtom = atom<FilePreviewState | null>(null)
export const diffReviewPreviewAtom = atom<DiffReviewPreview | null>(null)
export const fileReviewOpenModeAtom = atom<FileReviewOpenMode>('fullscreen')
