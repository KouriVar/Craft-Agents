/**
 * ContextActionsMenu — cmdk Command list of available ContextActions.
 * Rendered inside DropdownMenu content (not CommandDialog / Modal).
 */

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { Archive, Download, FileText, FolderKanban, Play, type LucideIcon } from 'lucide-react'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { groupActionsForMenu, groupLabelKey } from '@/context-actions/menu-layout'
import { contextActionRegistry } from '@/context-actions/registry'
import type { ActionContext, ContextAction } from '@/context-actions/types'

/** Existing lucide icons only — no custom icon system. */
const ICON_MAP: Record<string, LucideIcon> = {
  Archive,
  Download,
  FileText,
  FolderKanban,
  Play,
}

export interface ContextActionsMenuProps {
  context: ActionContext
  onSelect: (action: ContextAction) => void
}

export function ContextActionsMenu({ context, onSelect }: ContextActionsMenuProps) {
  const { t } = useTranslation()
  const actions = React.useMemo(
    () => contextActionRegistry.listForSurface('dropdown', context),
    [context],
  )
  const groups = React.useMemo(() => groupActionsForMenu(actions), [actions])

  return (
    <Command className="rounded-lg">
      <CommandInput placeholder={t('contextActions.searchPlaceholder')} />
      <CommandList className="max-h-[280px]">
        <CommandEmpty>{t('contextActions.empty')}</CommandEmpty>
        {groups.map(({ group, items }) => (
          <CommandGroup
            key={group}
            heading={t(groupLabelKey(group))}
          >
            {items.map((action) => {
              const Icon = ICON_MAP[action.icon]
              return (
                <CommandItem
                  key={action.id}
                  value={`${action.id} ${t(action.labelKey)}`}
                  onSelect={() => onSelect(action)}
                >
                  {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
                  <span>{t(action.labelKey)}</span>
                </CommandItem>
              )
            })}
          </CommandGroup>
        ))}
      </CommandList>
    </Command>
  )
}
