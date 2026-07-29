/**
 * ContextSuggestionBadge — single highest-priority action suggestion (v0.16.5+).
 *
 * Placement: ActiveOptionBadges row (same level as permission / session status).
 * Size matches MetadataBadge (Mode / Status); hover/open tokens match the quieter
 * input-toolbar pattern (transparent + foreground/5) — not a tinted CTA chip.
 * Interaction: body click → registry.run(primary); chevron → other suggestions (cmdk).
 *
 * v0.16.9: also binds ContextAction runtime host (sendMessage / library dialog) so
 * Suggestion → registry.run works after the toolbar「操作」entry was removed.
 */

import * as React from 'react'
import { useAtomValue } from 'jotai'
import { useTranslation } from 'react-i18next'
import { ChevronDown } from 'lucide-react'
import type { CognitionGuidanceDto, PrivacyPolicyDto } from '@craft-agent/shared/protocol'
import { DropdownMenu, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { StyledDropdownMenuContent } from '@/components/ui/styled-dropdown'
import { projectsAtom } from '@/atoms/projects'
import { sessionMetaMapAtom } from '@/atoms/sessions'
import { buildActionContext } from '@/context-actions/build-action-context'
import {
  beginExportTargetResolve,
  completeExportTargetResolve,
  documentIdForActionContext,
  exportTargetRequestKey,
  initialExportTargetState,
} from '@/context-actions/export-target-state'
import { resolveLibraryExportTarget } from '@/context-actions/handlers/library'
import { registerDefaultContextActions } from '@/context-actions/register-defaults'
import { contextActionRegistry } from '@/context-actions/registry'
import { bindContextActionHost } from '@/context-actions/runtime-host'
import { resolveContextActionSuggestions } from '@/context-actions/suggestions'
import type { ContextActionSuggestion, PrivacyPolicySnapshot } from '@/context-actions/types'
import { useAppShellContext } from '@/context/AppShellContext'
import { useLibraryGenerateFromSession } from '@/hooks/useLibraryGenerateFromSession'
import { cn } from '@/lib/utils'
import { ContextSuggestionMenu } from './ContextSuggestionMenu'

export interface ContextSuggestionBadgeProps {
  workspaceId?: string
  sessionId?: string
  disabled?: boolean
}

function toPrivacySnapshot(policy: PrivacyPolicyDto | null): PrivacyPolicySnapshot | null {
  if (!policy) return null
  return {
    contextAwarenessEnabled: policy.contextAwarenessEnabled,
    today: { useContext: policy.today.useContext },
    privacyMode: policy.privacyMode,
    effectivePrivacyModeActive: policy.effectivePrivacyModeActive,
  }
}

export function ContextSuggestionBadge({
  workspaceId,
  sessionId,
  disabled = false,
}: ContextSuggestionBadgeProps) {
  const { t } = useTranslation()
  const { onSendMessage } = useAppShellContext()
  const libraryGenerate = useLibraryGenerateFromSession(workspaceId)
  const sessionMetaMap = useAtomValue(sessionMetaMapAtom)
  const projects = useAtomValue(projectsAtom)

  const [menuOpen, setMenuOpen] = React.useState(false)
  const [privacy, setPrivacy] = React.useState<PrivacyPolicyDto | null>(null)
  const [guidance, setGuidance] = React.useState<CognitionGuidanceDto[]>([])
  const [exportTarget, setExportTarget] = React.useState(initialExportTargetState)

  const sendMessageRef = React.useRef(onSendMessage)
  sendMessageRef.current = onSendMessage
  const startLibraryRef = React.useRef(libraryGenerate.start)
  startLibraryRef.current = libraryGenerate.start

  React.useEffect(() => {
    registerDefaultContextActions()
  }, [])

  React.useEffect(() => {
    bindContextActionHost({
      sendMessage: (id, message) => sendMessageRef.current(id, message),
      startLibraryFromSession: (id) => startLibraryRef.current(id),
    })
    return () => bindContextActionHost(null)
  }, [])

  React.useEffect(() => {
    if (!workspaceId) {
      setPrivacy(null)
      return
    }
    let cancelled = false
    void window.electronAPI.getPrivacyPolicy({ workspaceId }).then((policy) => {
      if (!cancelled) setPrivacy(policy)
    }).catch(() => {
      if (!cancelled) setPrivacy(null)
    })
    return () => { cancelled = true }
  }, [workspaceId])

  React.useEffect(() => {
    if (!workspaceId || !sessionId) {
      setGuidance([])
      return
    }
    let cancelled = false
    void window.electronAPI.listCognitionGuidance({
      workspaceId,
      sessionId,
      limit: 12,
      forToday: true,
    }).then((items) => {
      if (!cancelled) setGuidance(items)
    }).catch(() => {
      if (!cancelled) setGuidance([])
    })
    return () => { cancelled = true }
  }, [workspaceId, sessionId])

  React.useEffect(() => {
    if (!workspaceId) {
      setExportTarget(initialExportTargetState())
      return
    }
    const session = sessionId ? sessionMetaMap.get(sessionId) ?? null : null
    const projectId = session?.projectId ?? null
    const requestKey = exportTargetRequestKey({ workspaceId, sessionId, projectId })
    setExportTarget(beginExportTargetResolve(requestKey))

    let cancelled = false
    void resolveLibraryExportTarget({
      workspaceId,
      sessionId,
      projectId,
    }).then((target) => {
      if (cancelled) return
      setExportTarget((prev) => completeExportTargetResolve(prev, requestKey, target?.id))
    }).catch(() => {
      if (cancelled) return
      setExportTarget((prev) => completeExportTargetResolve(prev, requestKey, undefined))
    })
    return () => { cancelled = true }
  }, [workspaceId, sessionId, sessionMetaMap])

  const session = sessionId ? sessionMetaMap.get(sessionId) ?? null : null
  const documentId = documentIdForActionContext(exportTarget)
  const hasLibraryDocument = Boolean(documentId)

  const context = React.useMemo(() => {
    if (!workspaceId) return buildActionContext({ workspaceId: '' })
    return buildActionContext({
      workspaceId,
      sessionId,
      documentId,
      session,
      sessions: sessionMetaMap,
      projects,
      privacy: toPrivacySnapshot(privacy),
    })
  }, [workspaceId, sessionId, documentId, session, sessionMetaMap, projects, privacy])

  const suggestions = React.useMemo(() => {
    if (!workspaceId || !sessionId || exportTarget.status === 'resolving') {
      return [] as ContextActionSuggestion[]
    }
    return resolveContextActionSuggestions({
      context,
      session,
      guidance,
      hasLibraryDocument,
    })
  }, [workspaceId, sessionId, exportTarget.status, context, session, guidance, hasLibraryDocument])

  const primary = suggestions[0]
  const others = suggestions.slice(1)

  const runSuggestion = React.useCallback((suggestion: ContextActionSuggestion) => {
    setMenuOpen(false)
    void contextActionRegistry.run(suggestion.actionId, context).catch((error) => {
      console.warn('[ContextSuggestions] run failed', suggestion.actionId, error)
    })
  }, [context])

  // Keep library consent dialog mounted even when no suggestion is visible.
  if (!workspaceId || !sessionId || !primary) {
    return <>{libraryGenerate.dialog}</>
  }

  const primaryAction = contextActionRegistry.get(primary.actionId)
  const label = primaryAction ? t(primaryAction.labelKey) : primary.actionId
  const hasAlternates = others.length > 0

  return (
    <>
      {libraryGenerate.dialog}
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        {/*
          Positioning anchor covers the whole badge (Mode/Status pattern).
          Visible controls sit above with pointer-events; open only via chevron.
        */}
        <div className="relative inline-flex items-center min-w-0 shrink-0">
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              tabIndex={-1}
              aria-hidden
              className="absolute inset-0 opacity-0 pointer-events-none"
            />
          </DropdownMenuTrigger>

          <div className="relative z-[1] inline-flex items-center min-w-0">
            <button
              type="button"
              disabled={disabled}
              title={label}
              onClick={(event) => {
                if (disabled) return
                if ((event.target as HTMLElement).closest('[data-suggestion-chevron]')) {
                  event.preventDefault()
                  event.stopPropagation()
                  setMenuOpen(true)
                  return
                }
                runSuggestion(primary)
              }}
              className={cn(
                'inline-flex items-center gap-1.5 shrink-0 select-none outline-none transition-colors',
                'h-7 pl-3 pr-2.5 rounded-control bg-foreground/5 text-foreground/70 shadow-tinted',
                'text-xs font-medium',
                'hover:bg-foreground/[0.07]',
                menuOpen && 'bg-foreground/[0.07]',
                'disabled:opacity-50 disabled:pointer-events-none',
              )}
              style={{ '--shadow-color': 'var(--foreground-rgb)' } as React.CSSProperties}
            >
              <span className="whitespace-nowrap">{label}</span>
              {hasAlternates && (
                <span
                  data-suggestion-chevron
                  className="-mr-0.5 inline-flex h-full items-center pl-0.5"
                >
                  <ChevronDown className="h-3 w-3 opacity-50 shrink-0" />
                </span>
              )}
            </button>
          </div>
        </div>

        {hasAlternates && (
          <StyledDropdownMenuContent
            side="top"
            align="start"
            sideOffset={4}
            className="w-[240px] min-w-[200px] p-0 overflow-hidden whitespace-normal"
            onCloseAutoFocus={(event) => {
              event.preventDefault()
              window.dispatchEvent(new CustomEvent('craft:focus-input', {
                detail: { sessionId },
              }))
            }}
          >
            <div className="px-3 pt-2.5 pb-1 text-xs font-medium text-muted-foreground">
              {t('contextSuggestions.menuHeader')}
            </div>
            <ContextSuggestionMenu suggestions={others} onSelect={runSuggestion} />
          </StyledDropdownMenuContent>
        )}
      </DropdownMenu>
    </>
  )
}
