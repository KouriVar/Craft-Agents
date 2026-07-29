/**
 * PhaseBadge
 *
 * Colored badge indicating the phase/timing of an automation trigger event.
 * Derives from getEventCategory() to avoid duplicating event classification.
 */

import { getEventCategory, type AutomationTrigger, type EventCategory } from './types'
import { Info_Badge, type BadgeColor } from '@/components/info'

const CATEGORY_BADGE: Record<EventCategory, { label: string; color: BadgeColor }> = {
  'scheduled':   { label: '定时', color: 'success' },
  'agent-pre':   { label: '执行前', color: 'warning' },
  'agent-post':  { label: '执行后', color: 'success' },
  'agent-error': { label: '失败时', color: 'destructive' },
  'label':       { label: '事件', color: 'default' },
  'permission':  { label: '事件', color: 'default' },
  'flag':        { label: '事件', color: 'default' },
  'todo':        { label: '事件', color: 'default' },
  'session':     { label: '事件', color: 'default' },
  'other':       { label: '事件', color: 'default' },
}

export interface PhaseBadgeProps {
  event: AutomationTrigger
  className?: string
}

export function PhaseBadge({ event, className }: PhaseBadgeProps) {
  const category = getEventCategory(event)
  const badge = CATEGORY_BADGE[category]

  return (
    <Info_Badge color={badge.color} className={className}>
      {badge.label}
    </Info_Badge>
  )
}
