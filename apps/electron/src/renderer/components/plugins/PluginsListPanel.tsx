import { Plug } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { WorkspacePluginEntry } from '@craft-agent/shared/plugins'
import { EntityList } from '@/components/ui/entity-list'
import { EntityListEmptyScreen } from '@/components/ui/entity-list-empty'
import { EntityRow } from '@/components/ui/entity-row'

interface PluginsListPanelProps {
  plugins: WorkspacePluginEntry[]
  selectedPluginName?: string | null
  onPluginClick: (plugin: WorkspacePluginEntry) => void
}

export function PluginsListPanel({ plugins, selectedPluginName, onPluginClick }: PluginsListPanelProps) {
  const { t } = useTranslation()

  return (
    <EntityList
      items={plugins}
      getKey={plugin => plugin.name}
      containerProps={{ 'data-list-role': 'plugins' }}
      emptyState={
        <EntityListEmptyScreen
          icon={<Plug />}
          title={t('plugins.empty', { defaultValue: 'No plugins installed' })}
          description={t('plugins.emptyDescription', { defaultValue: 'Use the add button to install from Git or add a local plugin.' })}
        />
      }
      renderItem={(plugin, _index, isFirst) => (
        <EntityRow
          icon={<Plug className="h-4 w-4 text-muted-foreground" />}
          title={plugin.displayName || plugin.name}
          titleSuffix={plugin.version ? <span className="text-[10px] text-muted-foreground">v{plugin.version}</span> : undefined}
          badges={
            <span className="flex min-w-0 items-center gap-1.5">
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${plugin.enabled ? 'bg-success' : 'bg-muted-foreground/40'}`} />
              <span className="truncate">{plugin.description || plugin.sourceUrl || plugin.installPath || plugin.name}</span>
            </span>
          }
          isSelected={selectedPluginName === plugin.name}
          showSeparator={!isFirst}
          onClick={() => onPluginClick(plugin)}
        />
      )}
    />
  )
}
