import {
  createSource,
  deleteSource,
  loadSource,
  loadWorkspaceSources,
  saveSourceConfig,
} from '../sources/index.ts'
import type { Connector, CreateConnectorInput, UpdateConnectorInput } from './types.ts'
import { connectorFromSource } from './types.ts'

/** Compatibility-backed Connector CRUD. Existing Source files and credentials remain authoritative. */
export function listConnectors(workspaceRootPath: string): Connector[] {
  return loadWorkspaceSources(workspaceRootPath).map(connectorFromSource)
}

export function getConnector(workspaceRootPath: string, sourceSlug: string): Connector | null {
  const source = loadSource(workspaceRootPath, sourceSlug)
  return source ? connectorFromSource(source) : null
}

export async function createConnector(workspaceRootPath: string, input: CreateConnectorInput): Promise<Connector> {
  const config = await createSource(workspaceRootPath, input)
  const source = loadSource(workspaceRootPath, config.slug)
  if (!source) throw new Error(`Connector ${config.slug} could not be loaded after creation`)
  return connectorFromSource(source)
}

export function updateConnector(
  workspaceRootPath: string,
  sourceSlug: string,
  patch: UpdateConnectorInput,
): Connector | null {
  const source = loadSource(workspaceRootPath, sourceSlug)
  if (!source) return null
  saveSourceConfig(workspaceRootPath, { ...source.config, ...patch })
  return getConnector(workspaceRootPath, sourceSlug)
}

export function deleteConnector(workspaceRootPath: string, sourceSlug: string): boolean {
  if (!loadSource(workspaceRootPath, sourceSlug)) return false
  deleteSource(workspaceRootPath, sourceSlug)
  return true
}

export type { Connector, CreateConnectorInput, UpdateConnectorInput } from './types.ts'
