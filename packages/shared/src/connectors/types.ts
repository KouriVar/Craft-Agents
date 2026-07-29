import type { CreateSourceInput, FolderSourceConfig, LoadedSource, SourceConnectionStatus, SourceType } from '../sources/types.ts'

/** User-facing capability connection. Transport and authentication stay internal drivers. */
export interface Connector {
  id: string
  name: string
  provider: string
  driver: SourceType
  enabled: boolean
  connectionStatus?: SourceConnectionStatus
  connectionError?: string
  icon?: string
  tagline?: string
  sourceSlug: string
}

export type CreateConnectorInput = CreateSourceInput
export type UpdateConnectorInput = Partial<Pick<FolderSourceConfig, 'name' | 'provider' | 'enabled' | 'icon' | 'tagline' | 'mcp' | 'api' | 'local'>>

export function connectorFromSource(source: LoadedSource): Connector {
  const { config } = source
  return {
    id: config.id,
    name: config.name,
    provider: config.provider,
    driver: config.type,
    enabled: config.enabled,
    connectionStatus: config.connectionStatus,
    connectionError: config.connectionError,
    icon: config.icon,
    tagline: config.tagline,
    sourceSlug: config.slug,
  }
}
