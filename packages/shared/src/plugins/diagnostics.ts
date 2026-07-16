import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { validateMcpConnection, validateStdioMcpConnection } from '../mcp/validation.ts';
import { buildMcpStdioEnv } from '../mcp/client.ts';
import { atomicWriteFileSync, readJsonFileSync } from '../utils/files.ts';
import { loadPluginMcpServerDefinitions, preflightPluginMcpServer, resolvePluginMcpServerConfig } from './mcp.ts';
import type { SdkMcpServerConfig } from '../agent/backend/types.ts';
import type {
  PluginMcpServerDiagnostic,
  PluginMcpStatusFile,
} from './types.ts';

export const PLUGIN_MCP_STATUS_FILE = 'plugins/mcp-status.json';

export function getEmptyPluginMcpStatus(): PluginMcpStatusFile {
  return { version: 1, checkedAt: 0, servers: {} };
}

function isDiagnostic(value: unknown): value is PluginMcpServerDiagnostic {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.slug === 'string'
    && typeof record.pluginName === 'string'
    && typeof record.serverName === 'string'
    && (record.transport === 'stdio' || record.transport === 'http' || record.transport === 'sse')
    && (record.state === 'ready' || record.state === 'error' || record.state === 'missing-dependency')
    && typeof record.checkedAt === 'number'
    && typeof record.durationMs === 'number';
}

export function loadPluginMcpStatus(workspaceRootPath: string): PluginMcpStatusFile {
  const statusPath = join(workspaceRootPath, PLUGIN_MCP_STATUS_FILE);
  if (!existsSync(statusPath)) return getEmptyPluginMcpStatus();

  try {
    const raw = readJsonFileSync(statusPath) as Record<string, unknown>;
    const rawServers = raw?.servers && typeof raw.servers === 'object' && !Array.isArray(raw.servers)
      ? raw.servers as Record<string, unknown>
      : {};
    const servers = Object.fromEntries(
      Object.entries(rawServers).filter((entry): entry is [string, PluginMcpServerDiagnostic] => isDiagnostic(entry[1])),
    );
    return {
      version: 1,
      checkedAt: typeof raw?.checkedAt === 'number' ? raw.checkedAt : 0,
      servers,
    };
  } catch {
    return getEmptyPluginMcpStatus();
  }
}

export function savePluginMcpStatus(workspaceRootPath: string, status: PluginMcpStatusFile): void {
  const statusPath = join(workspaceRootPath, PLUGIN_MCP_STATUS_FILE);
  mkdirSync(dirname(statusPath), { recursive: true });
  atomicWriteFileSync(statusPath, JSON.stringify(status, null, 2));
}

export function recordPluginMcpAuthFailure(
  workspaceRootPath: string,
  sourceSlug: string,
  error: unknown,
): void {
  const definition = loadPluginMcpServerDefinitions(workspaceRootPath)
    .find(item => item.authSourceSlug === sourceSlug);
  if (!definition) return;

  const message = error instanceof Error ? error.message : String(error);
  const checkedAt = Date.now();
  const status = loadPluginMcpStatus(workspaceRootPath);
  status.checkedAt = checkedAt;
  status.servers[definition.slug] = {
    slug: definition.slug,
    pluginName: definition.pluginName,
    serverName: definition.serverName,
    transport: definition.config.type,
    state: 'error',
    checkedAt,
    durationMs: 0,
    error: message,
    errorType: message.includes('only allows approved OAuth host applications')
      ? 'host-not-approved'
      : 'unknown',
  };
  savePluginMcpStatus(workspaceRootPath, status);
}

export function loadPreflightedPluginMcpServers(
  workspaceRootPath: string,
): Record<string, SdkMcpServerConfig> {
  const checkedAt = Date.now();
  const currentStatus = loadPluginMcpStatus(workspaceRootPath);
  let statusChanged = false;
  const servers: Record<string, SdkMcpServerConfig> = {};

  for (const definition of loadPluginMcpServerDefinitions(workspaceRootPath)) {
    const preflight = preflightPluginMcpServer(definition);
    if (preflight.success) {
      servers[definition.slug] = definition.config;
      if (currentStatus.servers[definition.slug]?.state === 'missing-dependency') {
        delete currentStatus.servers[definition.slug];
        statusChanged = true;
      }
      continue;
    }

    currentStatus.servers[definition.slug] = {
      slug: definition.slug,
      pluginName: definition.pluginName,
      serverName: definition.serverName,
      transport: definition.config.type,
      state: 'missing-dependency',
      checkedAt,
      durationMs: 0,
      error: `Missing MCP dependencies: ${preflight.missingDependencies.join(', ')}`,
      errorType: 'missing-dependency',
      missingDependencies: preflight.missingDependencies,
    };
    statusChanged = true;
  }

  if (statusChanged) {
    currentStatus.checkedAt = checkedAt;
    savePluginMcpStatus(workspaceRootPath, currentStatus);
  }
  return servers;
}

export async function loadResolvedPluginMcpServers(
  workspaceRootPath: string,
): Promise<Record<string, SdkMcpServerConfig>> {
  const entries = await Promise.all(
    loadPluginMcpServerDefinitions(workspaceRootPath).map(async definition => {
      const preflight = preflightPluginMcpServer(definition);
      if (!preflight.success) return null;
      return [definition.slug, await resolvePluginMcpServerConfig(workspaceRootPath, definition)] as const;
    }),
  );
  return Object.fromEntries(entries.filter((entry): entry is readonly [string, SdkMcpServerConfig] => Boolean(entry)));
}

export async function diagnosePluginMcpServers(
  workspaceRootPath: string,
  options: { timeout?: number } = {},
): Promise<PluginMcpStatusFile> {
  const checkedAt = Date.now();
  const definitions = loadPluginMcpServerDefinitions(workspaceRootPath);
  const previousStatus = loadPluginMcpStatus(workspaceRootPath);
  const results = await Promise.all(definitions.map(async definition => {
    const startedAt = Date.now();
    const preflight = preflightPluginMcpServer(definition);
    if (!preflight.success) {
      return {
        slug: definition.slug,
        pluginName: definition.pluginName,
        serverName: definition.serverName,
        transport: definition.config.type,
        state: 'missing-dependency',
        checkedAt,
        durationMs: Date.now() - startedAt,
        error: `Missing MCP dependencies: ${preflight.missingDependencies.join(', ')}`,
        errorType: 'missing-dependency',
        missingDependencies: preflight.missingDependencies,
      } satisfies PluginMcpServerDiagnostic;
    }

    const config = await resolvePluginMcpServerConfig(workspaceRootPath, definition);
    const validation = config.type === 'stdio'
      ? await validateStdioMcpConnection({
          command: config.command,
          args: config.args,
          env: buildMcpStdioEnv(config),
          cwd: config.cwd,
          inheritProcessEnv: false,
          timeout: options.timeout,
        })
      : await validateMcpConnection({
          mcpUrl: config.url,
          mcpTransport: config.type,
          mcpHeaders: config.headers,
          mcpAccessToken: config.bearerTokenEnvVar ? process.env[config.bearerTokenEnvVar] : undefined,
        });

    const previous = previousStatus.servers[definition.slug];
    const preserveHostApproval = !validation.success
      && previous?.errorType === 'host-not-approved'
      && validation.errorType === 'needs-auth';
    return {
      slug: definition.slug,
      pluginName: definition.pluginName,
      serverName: definition.serverName,
      transport: config.type,
      state: validation.success ? 'ready' : 'error',
      checkedAt,
      durationMs: Date.now() - startedAt,
      tools: validation.tools,
      error: preserveHostApproval ? previous.error : validation.error,
      errorType: preserveHostApproval
        ? 'host-not-approved'
        : validation.errorType === 'needs-auth' || validation.errorType === 'invalid-schema' || validation.errorType === 'failed'
          ? validation.errorType
        : validation.success ? undefined : 'unknown',
    } satisfies PluginMcpServerDiagnostic;
  }));

  const status: PluginMcpStatusFile = {
    version: 1,
    checkedAt,
    servers: Object.fromEntries(results.map(result => [result.slug, result])),
  };
  savePluginMcpStatus(workspaceRootPath, status);
  return status;
}
