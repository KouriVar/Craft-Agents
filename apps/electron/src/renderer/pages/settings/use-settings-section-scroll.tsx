/** Scroll-to-section helpers for consolidated settings pages. */

import { useEffect } from 'react'
import { cn } from '@/lib/utils'

/**
 * Scroll to a settings section once the page mounts (legacy deep-link / nav section).
 */
export function useSettingsSectionScroll(section: string | null | undefined) {
  useEffect(() => {
    if (!section) return
    const timer = window.setTimeout(() => {
      document.getElementById(section)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 80)
    return () => window.clearTimeout(timer)
  }, [section])
}

/** Wrap a settings block with a stable section id for deep links. */
export function SettingsAnchor({
  id,
  children,
  className,
}: {
  id: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div id={id} className={cn('scroll-mt-14', className)}>
      {children}
    </div>
  )
}
