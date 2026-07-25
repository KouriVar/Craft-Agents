/**
 * ContextSuggestionMenu — cmdk list of alternate Context Action suggestions.
 * Rendered inside DropdownMenu content (not CommandDialog / Modal).
 */

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
  Archive,
  Download,
  FileText,
  FolderKanban,
  Play,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { contextActionRegistry } from '@/context-actions/registry'
import type { ContextActionSuggestion } from '@/context-actions/types'

const ICON_MAP: Record<string, LucideIcon> = {
  Archive,
  Download,
  FileText,
  FolderKanban,
  Play,
  Sparkles,
}

export interface ContextSuggestionMenuProps {
  suggestions: ContextActionSuggestion[]
  onSelect: (suggestion: ContextActionSuggestion) => void
}

export function ContextSuggestionMenu({ suggestions, onSelect }: ContextSuggestionMenuProps) {
  const { t } = useTranslation()

  return (
    <Command className="rounded-lg">
      <CommandInput placeholder={t('contextSuggestions.searchPlaceholder')} />
      <CommandList className="max-h-[240px]">
        <CommandEmpty>{t('contextSuggestions.empty')}</CommandEmpty>
        <CommandGroup>
          {suggestions.map((suggestion) => {
            const action = contextActionRegistry.get(suggestion.actionId)
            if (!action) return null
            const Icon = ICON_MAP[action.icon] ?? Sparkles
            return (
              <CommandItem
                key={suggestion.actionId}
                value={`${suggestion.actionId} ${t(action.labelKey)}`}
                onSelect={() => onSelect(suggestion)}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{t(action.labelKey)}</span>
              </CommandItem>
            )
          })}
        </CommandGroup>
      </CommandList>
    </Command>
  )
}
