import { atom } from 'jotai'
import type { BrowserInstanceInfo } from '../../shared/types'

export type BrowserWorkspaceTab = BrowserInstanceInfo
export type BrowserNavigatorKind = 'tabs' | 'bookmarks' | 'history' | 'downloads'

export const BROWSER_NEW_TAB_URL = 'about:blank'

/** Runtime-backed browser tabs visible in the active workspace. */
export const browserWorkspaceTabsAtom = atom<BrowserWorkspaceTab[]>([])
export const browserNavigatorKindAtom = atom<BrowserNavigatorKind>('tabs')
/** Hides native browser views while a renderer-level global overlay is open. */
export const browserNativeViewsSuspendedAtom = atom(false)
/** Viewport-space bottom edge reserved for renderer notifications above native browser views. */
export const browserNotificationBottomAtom = atom(0)
