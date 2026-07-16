import { AlertTriangle, CheckCircle2, KeyRound, Plug, XCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { WorkspacePluginEntry } from '@craft-agent/shared/plugins'
import { EntityList } from '@/components/ui/entity-list'
import { EntityListEmptyScreen } from '@/components/ui/entity-list-empty'
import { EntityRow } from '@/components/ui/entity-row'
import { PluginAvatar } from '@/components/ui/plugin-avatar'

interface PluginsListPanelProps {
  workspaceId: string
  plugins: WorkspacePluginEntry[]
  selectedPluginName?: string | null
  onPluginClick: (plugin: WorkspacePluginEntry) => void
}

export function PluginsListPanel({ workspaceId, plugins, selectedPluginName, onPluginClick }: PluginsListPanelProps) {
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
          icon={<PluginAvatar plugin={plugin} workspaceId={workspaceId} size="sm" />}
          title={plugin.displayName || plugin.name}
          titleSuffix={plugin.version ? <span className="text-[10px] text-muted-foreground">v{plugin.version}</span> : undefined}
          badges={
            <span className="flex min-w-0 items-center gap-1.5">
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${plugin.enabled ? 'bg-success' : 'bg-muted-foreground/40'}`} />
              {plugin.compatibility?.level === 'ready' && <CheckCircle2 className="h-3 w-3 shrink-0 text-success" />}
              {plugin.compatibility?.level === 'needs-auth' && <KeyRound className="h-3 w-3 shrink-0 text-warning" />}
              {plugin.compatibility?.level === 'partial' && <AlertTriangle className="h-3 w-3 shrink-0 text-warning" />}
              {plugin.compatibility?.level === 'unsupported' && <XCircle className="h-3 w-3 shrink-0 text-destructive" />}
              <span className="truncate">{plugin.compatibility?.summary || plugin.description || plugin.sourceUrl || plugin.installPath || plugin.name}</span>
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
