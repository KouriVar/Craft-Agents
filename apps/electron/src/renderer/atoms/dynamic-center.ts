import { atom } from 'jotai'
import type { DynamicItem } from '@craft-agent/shared/dynamic'

export type DynamicCenterFilter = 'all' | 'unread' | 'read' | 'actionable' | 'automation' | 'system'

export const dynamicCenterFilterAtom = atom<DynamicCenterFilter>('all')
export const dynamicCenterItemsAtom = atom<DynamicItem[]>([])
export const dynamicCenterSelectedIdAtom = atom<string | null>(null)
export const dynamicCenterRefreshAtom = atom(0)

