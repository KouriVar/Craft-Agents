import { Plug } from 'lucide-react'
import { EntityIcon } from '@/components/ui/entity-icon'
import { useEntityIcon } from '@/lib/icon-cache'
import type { IconSize } from '@craft-agent/shared/icons'
import type { WorkspacePluginEntry } from '@craft-agent/shared/plugins'

interface PluginAvatarProps {
  plugin: Pick<WorkspacePluginEntry, 'name' | 'displayName' | 'iconPath'>
  workspaceId: string
  size?: IconSize
  className?: string
}

export function PluginAvatar({ plugin, workspaceId, size = 'md', className }: PluginAvatarProps) {
  const icon = useEntityIcon({
    workspaceId,
    entityType: 'plugin',
    identifier: plugin.name,
    iconPath: plugin.iconPath,
  })

  return (
    <EntityIcon
      icon={icon}
      size={size}
      fallbackIcon={Plug}
      alt={plugin.displayName ?? plugin.name}
      className={className}
    />
  )
}
