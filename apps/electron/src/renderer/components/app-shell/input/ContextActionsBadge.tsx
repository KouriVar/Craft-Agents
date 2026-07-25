/**
 * ContextActionsBadge — legacy toolbar entry for the full Context Actions menu.
 *
 * v0.16.9: FreeFormInput no longer mounts this UI. High-frequency actions go through
 * ContextSuggestionBadge → Suggestion Engine → registry.run. This component is kept
 * so ContextActionsMenu / host-binding patterns remain available for reuse; it is not
 * deleted with the framework.
 *
 * DropdownMenu → Command(cmdk) → ContextActionsMenu
 * No CommandDialog / modal / new overlay system.
 */

import * as React from 'react'
import { useAtomValue } from 'jotai'
import { useTranslation } from 'react-i18next'
import { ListChecks } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@craft-agent/ui'
import { DropdownMenu, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { StyledDropdownMenuContent } from '@/components/ui/styled-dropdown'
import { FreeFormInputContextBadge } from './FreeFormInputContextBadge'
import { ContextActionsMenu } from './ContextActionsMenu'
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
import type { ContextAction, PrivacyPolicySnapshot } from '@/context-actions/types'
import { useAppShellContext } from '@/context/AppShellContext'
import { useLibraryGenerateFromSession } from '@/hooks/useLibraryGenerateFromSession'
import { resolveLastActiveProject } from '@/lib/last-active-project'
import type { PrivacyPolicyDto } from '@craft-agent/shared/protocol'

function toPrivacySnapshot(policy: PrivacyPolicyDto | null): PrivacyPolicySnapshot | null {
  if (!policy) return null
  return {
    contextAwarenessEnabled: policy.contextAwarenessEnabled,
    today: { useContext: policy.today.useContext },
    privacyMode: policy.privacyMode,
    effectivePrivacyModeActive: policy.effectivePrivacyModeActive,
  }
}

export interface ContextActionsBadgeProps {
  workspaceId?: string
  sessionId?: string
  /** Compact toolbar: icon-only. */
  compact?: boolean
  disabled?: boolean
}

export function ContextActionsBadge({
  workspaceId,
  sessionId,
  compact = false,
  disabled = false,
}: ContextActionsBadgeProps) {
  const { t } = useTranslation()
  const { onSendMessage } = useAppShellContext()
  const sessionMetaMap = useAtomValue(sessionMetaMapAtom)
  const projects = useAtomValue(projectsAtom)
  const libraryGenerate = useLibraryGenerateFromSession(workspaceId)
  const [open, setOpen] = React.useState(false)
  const [exportTarget, setExportTarget] = React.useState(initialExportTargetState)
  const [privacy, setPrivacy] = React.useState<PrivacyPolicyDto | null>(null)

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

  // Resolve exportable Library document. While resolving, documentId is withheld
  // so library.export does not flash in/out of the menu.
  React.useEffect(() => {
    if (!workspaceId) {
      setExportTarget(initialExportTargetState())
      return
    }
    const session = sessionId ? sessionMetaMap.get(sessionId) ?? null : null
    const projectId = session?.projectId
      ?? resolveLastActiveProject(workspaceId, projects)?.config.id
      ?? null
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
  }, [workspaceId, sessionId, sessionMetaMap, projects])

  const context = React.useMemo(() => {
    if (!workspaceId) {
      return buildActionContext({ workspaceId: '' })
    }
    const session = sessionId ? sessionMetaMap.get(sessionId) ?? null : null
    return buildActionContext({
      workspaceId,
      sessionId,
      documentId: documentIdForActionContext(exportTarget),
      session,
      sessions: sessionMetaMap,
      projects,
      privacy: toPrivacySnapshot(privacy),
    })
  }, [workspaceId, sessionId, exportTarget, sessionMetaMap, projects, privacy])

  const handleSelect = React.useCallback((action: ContextAction) => {
    setOpen(false)
    void contextActionRegistry.run(action.id, context).catch((error) => {
      console.warn('[ContextActions] run failed', action.id, error)
    })
  }, [context])

  if (!workspaceId) return null

  return (
    <>
      {libraryGenerate.dialog}
      <DropdownMenu open={open} onOpenChange={setOpen}>
        {/*
          Tooltip wraps Trigger (not the reverse): DropdownMenuTrigger asChild must
          land on the real <button> inside FreeFormInputContextBadge. Passing
          tooltip= into the badge would make Tooltip the badge root and break Radix.
        */}
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <FreeFormInputContextBadge
                icon={<ListChecks className="h-4 w-4" />}
                label={t('contextActions.label')}
                isExpanded={compact ? false : true}
                hasSelection={false}
                showChevron={!compact}
                isOpen={open}
                disabled={disabled}
              />
            </DropdownMenuTrigger>
          </TooltipTrigger>
          {!open && (
            <TooltipContent side="top">
              {t('contextActions.label')}
            </TooltipContent>
          )}
        </Tooltip>
        <StyledDropdownMenuContent
          side="top"
          align="start"
          sideOffset={8}
          className="w-[280px] p-0 overflow-hidden whitespace-normal"
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          {/* Keep heading for a11y / product label; cmdk groups provide sections. */}
          <div className="px-3 pt-2.5 pb-1 text-xs font-medium text-muted-foreground">
            {t('contextActions.groupHeader')}
          </div>
          <ContextActionsMenu context={context} onSelect={handleSelect} />
        </StyledDropdownMenuContent>
      </DropdownMenu>
    </>
  )
}
