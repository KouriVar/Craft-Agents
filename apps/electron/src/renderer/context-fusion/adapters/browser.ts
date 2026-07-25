/**
 * Browser adapter — reuse findProjectBrowserTabs (read-time session→project attribution).
 * Does not modify Browser DTO / profile / snapshot schema.
 */

import type { SessionMeta } from '@/atoms/sessions'
import type { BrowserWorkspaceTab } from '@/atoms/browser-workspace'
import { findProjectBrowserTabs } from '@/lib/project-browser-tabs'
import type { FusionBrowserSlice, FusionProjectSlice } from '../types'

export function emptyFusionBrowserSlice(): FusionBrowserSlice {
  return {
    relatedTabs: [],
    relatedTabCount: 0,
    hasVisibleRelated: false,
  }
}

export function adaptBrowser(input: {
  tabs: readonly BrowserWorkspaceTab[] | null | undefined
  sessions: Map<string, SessionMeta> | Iterable<SessionMeta> | null | undefined
  project: FusionProjectSlice | null
  limit?: number
}): FusionBrowserSlice {
  if (!input.project || !input.tabs?.length || !input.sessions) {
    return emptyFusionBrowserSlice()
  }

  const relatedTabs = findProjectBrowserTabs(
    input.tabs,
    input.sessions,
    input.project.id,
    { limit: input.limit ?? 5 },
  )

  return {
    relatedTabs,
    relatedTabCount: relatedTabs.length,
    hasVisibleRelated: relatedTabs.length > 0,
  }
}
