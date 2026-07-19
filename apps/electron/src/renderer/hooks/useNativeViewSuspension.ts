import { useEffect, useRef, useState } from 'react'
import { useSetAtom } from 'jotai'
import {
  browserNotificationBottomAtom,
  updateBrowserNativeViewPauseReasonAtom,
  type BrowserNativeViewPauseReason,
} from '@/atoms/browser-workspace'
import { detectNativeViewPauseReasons } from '@/lib/overlay-detection'

/**
 * Coordinates renderer-owned overlays with Electron's native browser view.
 * Native WebContentsViews render above the React DOM, so overlays temporarily
 * pause them and notifications reserve only the strip occupied by toasts.
 */
export function useNativeViewSuspension(showWhatsNew: boolean): void {
  const [overlayReasons, setOverlayReasons] = useState<BrowserNativeViewPauseReason[]>([])
  const updatePauseReason = useSetAtom(updateBrowserNativeViewPauseReasonAtom)
  const setNotificationBottom = useSetAtom(browserNotificationBottomAtom)
  const heldReasonsRef = useRef(new Set<BrowserNativeViewPauseReason>())

  useEffect(() => {
    let frame = 0
    const update = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setOverlayReasons(detectNativeViewPauseReasons()))
    }
    const observer = new MutationObserver(update)
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-state', 'role'],
    })
    update()
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [])

  useEffect(() => {
    const next = new Set(overlayReasons)
    if (showWhatsNew) next.add('whats-new')
    const held = heldReasonsRef.current
    for (const reason of held) {
      if (!next.has(reason)) updatePauseReason({ reason, active: false })
    }
    for (const reason of next) {
      if (!held.has(reason)) updatePauseReason({ reason, active: true })
    }
    heldReasonsRef.current = next
  }, [overlayReasons, showWhatsNew, updatePauseReason])

  useEffect(() => () => {
    for (const reason of heldReasonsRef.current) {
      updatePauseReason({ reason, active: false })
    }
    heldReasonsRef.current.clear()
  }, [updatePauseReason])

  useEffect(() => {
    let frame = 0
    const update = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const bottom = Array.from(document.querySelectorAll<HTMLElement>('[data-sonner-toast]'))
          .reduce((maximum, element) => Math.max(maximum, element.getBoundingClientRect().bottom), 0)
        setNotificationBottom(Math.ceil(bottom))
      })
    }
    const observer = new MutationObserver(update)
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-mounted', 'data-removed', 'data-visible'],
    })
    update()
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      setNotificationBottom(0)
    }
  }, [setNotificationBottom])
}
