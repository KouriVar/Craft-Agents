import { atom } from 'jotai'
import type { BrowserInstanceInfo } from '../../shared/types'

export type BrowserWorkspaceTab = BrowserInstanceInfo
export type BrowserNavigatorKind = 'tabs' | 'bookmarks' | 'history' | 'downloads'

export const BROWSER_NEW_TAB_URL = 'about:blank'

/** Runtime-backed browser tabs visible in the active workspace. */
export const browserWorkspaceTabsAtom = atom<BrowserWorkspaceTab[]>([])
export const browserNavigatorKindAtom = atom<BrowserNavigatorKind>('tabs')
export type BrowserNativeViewPauseReason =
  | 'dialog'
  | 'drawer'
  | 'menu'
  | 'popover'
  | 'select'
  | 'inline-menu'
  | 'island-dialog'
  | 'whats-new'
  | 'notification'

/** Active owners of the native-view pause. Reasons make overlap diagnosable. */
export const browserNativeViewPauseReasonsAtom = atom<ReadonlySet<BrowserNativeViewPauseReason>>(
  new Set<BrowserNativeViewPauseReason>(),
)

/** Acquire or release one pause reason without disturbing other open overlays. */
export const updateBrowserNativeViewPauseReasonAtom = atom(
  null,
  (get, set, update: { reason: BrowserNativeViewPauseReason; active: boolean }) => {
    const current = get(browserNativeViewPauseReasonsAtom)
    const next = new Set(current)
    if (update.active) next.add(update.reason)
    else next.delete(update.reason)
    if (next.size === current.size && [...next].every((reason) => current.has(reason))) return
    set(browserNativeViewPauseReasonsAtom, next)
  },
)

/** Hides native browser views while at least one renderer overlay owns a pause. */
export const browserNativeViewsSuspendedAtom = atom(
  (get) => get(browserNativeViewPauseReasonsAtom).size > 0,
)
/** Viewport-space bottom edge reserved for renderer notifications above native browser views. */
export const browserNotificationBottomAtom = atom(0)
