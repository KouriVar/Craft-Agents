import { accessSync, constants, existsSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import type { SdkMcpServerConfig } from '../agent/backend/types.ts';
import { MCP_BLOCKED_ENV_VARS } from '../mcp/client.ts';
import { getSourceCredentialManager } from '../sources/credential-manager.ts';
import { TokenRefreshManager } from '../sources/token-refresh-manager.ts';
import type { LoadedSource } from '../sources/types.ts';
import { readJsonFileSync } from '../utils/files.ts';
import { isPluginPackageEnabled, listPluginEntries } from './config.ts';
import { loadPluginPackage } from './storage.ts';
import type { LoadedPluginPackage } from './types.ts';

export interface PluginMcpServerDefinition {
  slug: string;
  pluginName: string;
  serverName: string;
  config: SdkMcpServerConfig;
  authType?: 'oauth' | 'chatgpt';
  authSourceSlug?: string;
  oauthResource?: string;
  scopes?: string[];
}

export interface PluginMcpPreflightResult {
  success: boolean;
  missingDependencies: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function normalizeStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const values = value
    .filter((entry): entry is string => typeof entry === 'string')
    .map(entry => entry.trim())
    .filter(Boolean);
  return values.length > 0 ? values : undefined;
}

function normalizeStringRecord(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) return undefined;
  const entries = Object.entries(value)
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    .map(([key, val]) => [key, val] as const);
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function safeSlug(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'plugin';
}

function resolveOptionalPath(basePath: string, value: unknown): string | undefined {
  const path = normalizeString(value);
  return path ? resolve(basePath, path) : undefined;
}

function normalizeServerConfig(basePath: string, value: unknown): SdkMcpServerConfig | null {
  if (!isRecord(value)) return null;
  const type = normalizeString(value.type) ?? normalizeString(value.transport);

  const command = normalizeString(value.command);
  if (type === 'stdio' || command) {
    if (!command) return null;
    return {
      type: 'stdio',
      command,
      args: normalizeStringList(value.args),
      env: normalizeStringRecord(value.env),
      envVars: normalizeStringList(value.envVars),
      cwd: resolveOptionalPath(basePath, value.cwd),
    };
  }

  const url = normalizeString(value.url);
  if (!url) return null;
  return {
    type: type === 'sse' ? 'sse' : 'http',
    url,
    headers: normalizeStringRecord(value.headers),
    bearerTokenEnvVar: normalizeString(value.bearerTokenEnvVar),
  };
}

function extractMcpServers(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) return {};
  const mcpServers = isRecord(value.mcpServers) ? value.mcpServers : undefined;
  const servers = isRecord(value.servers) ? value.servers : undefined;
  return mcpServers ?? servers ?? {};
}

function collectPluginPackages(workspaceRootPath: string): LoadedPluginPackage[] {
  const packages = new Map<string, LoadedPluginPackage>();

  const workspacePackage = loadPluginPackage(workspaceRootPath);
  if (workspacePackage && isPluginPackageEnabled(workspaceRootPath, workspacePackage)) {
    packages.set(workspacePackage.rootPath, workspacePackage);
  }

  for (const entry of listPluginEntries(workspaceRootPath)) {
    if (!entry.enabled || !entry.installPath || !existsSync(entry.installPath)) continue;
    const pluginPackage = loadPluginPackage(entry.installPath);
    if (pluginPackage && isPluginPackageEnabled(workspaceRootPath, pluginPackage)) {
      packages.set(pluginPackage.rootPath, pluginPackage);
    }
  }

  return [...packages.values()];
}

function addPluginMcpServers(
  output: Map<string, PluginMcpServerDefinition>,
  pluginPackage: LoadedPluginPackage,
  basePath: string,
  rawServers: Record<string, unknown>,
): void {
  const entries = Object.entries(rawServers);
  for (const [serverName, serverConfig] of entries) {
    const normalized = normalizeServerConfig(basePath, serverConfig);
    if (!normalized) continue;

    const pluginSlug = safeSlug(pluginPackage.manifest.name);
    const serverSlug = safeSlug(serverName);
    const slug = entries.length === 1 && serverSlug === pluginSlug
      ? pluginSlug
      : `${pluginSlug}_${serverSlug}`;
    const rawConfig = isRecord(serverConfig) ? serverConfig : {};
    const declaredAuth = normalizeString(rawConfig.auth)?.toLowerCase();
    const oauthResource = normalizeString(rawConfig.oauth_resource) ?? normalizeString(rawConfig.oauthResource);
    const authType = declaredAuth === 'chatgpt'
      ? 'chatgpt'
      : declaredAuth === 'oauth' || oauthResource
        ? 'oauth'
        : undefined;
    output.set(slug, {
      slug,
      pluginName: pluginPackage.manifest.name,
      serverName,
      config: normalized,
      authType,
      authSourceSlug: authType === 'oauth' ? `plugin-mcp-${slug}` : undefined,
      oauthResource,
      scopes: normalizeStringList(rawConfig.scopes),
    });
  }
}

export function loadPluginMcpServerDefinitions(workspaceRootPath: string): PluginMcpServerDefinition[] {
  const output = new Map<string, PluginMcpServerDefinition>();

  for (const pluginPackage of collectPluginPackages(workspaceRootPath)) {
    addPluginMcpServers(output, pluginPackage, pluginPackage.rootPath, extractMcpServers({ mcpServers: pluginPackage.manifest.mcpServers }));

    for (const configPath of pluginPackage.mcpConfigPaths) {
      try {
        addPluginMcpServers(output, pluginPackage, dirname(configPath), extractMcpServers(readJsonFileSync(configPath)));
      } catch {
        // Ignore malformed optional MCP config files; plugin manifest validation is separate.
      }
    }
  }

  return [...output.values()];
}

function commandExists(command: string, cwd: string | undefined, env: NodeJS.ProcessEnv = process.env): boolean {
  const candidates = command.includes('/')
    ? [resolve(cwd ?? process.cwd(), command)]
    : (env.PATH ?? '').split(':').filter(Boolean).map(path => resolve(path, command));
  return candidates.some(candidate => {
    try {
      accessSync(candidate, constants.X_OK);
      return true;
    } catch {
      return false;
    }
  });
}

export function preflightPluginMcpServer(
  definition: PluginMcpServerDefinition,
  env: NodeJS.ProcessEnv = process.env,
): PluginMcpPreflightResult {
  const missing = new Set<string>();
  const { config } = definition;

  if (config.type === 'stdio') {
    if (!commandExists(config.command, config.cwd, env)) missing.add(`command:${config.command}`);
    if (config.cwd && !existsSync(config.cwd)) missing.add(`cwd:${config.cwd}`);
    for (const name of config.envVars ?? []) {
      if (config.env?.[name] !== undefined) continue;
      if (MCP_BLOCKED_ENV_VARS.includes(name)) missing.add(`env-blocked:${name}`);
      else if (!env[name]) missing.add(`env:${name}`);
    }
  } else if (config.bearerTokenEnvVar && !env[config.bearerTokenEnvVar]) {
    missing.add(`env:${config.bearerTokenEnvVar}`);
  }

  return {
    success: missing.size === 0,
    missingDependencies: [...missing],
  };
}

export function loadPluginMcpServers(workspaceRootPath: string): Record<string, SdkMcpServerConfig> {
  return Object.fromEntries(
    loadPluginMcpServerDefinitions(workspaceRootPath).map(definition => [definition.slug, definition.config]),
  );
}

export function createPluginMcpAuthSource(
  workspaceRootPath: string,
  definition: PluginMcpServerDefinition,
): LoadedSource | null {
  if (definition.authType !== 'oauth' || definition.config.type === 'stdio' || !definition.authSourceSlug) return null;
  return {
    config: {
      id: definition.authSourceSlug,
      name: `${definition.pluginName} / ${definition.serverName}`,
      slug: definition.authSourceSlug,
      enabled: true,
      provider: definition.pluginName,
      type: 'mcp',
      createdAt: 0,
      updatedAt: 0,
      mcp: {
        transport: definition.config.type,
        url: definition.config.url,
        authType: 'oauth',
        headers: definition.config.headers,
        oauthResource: definition.oauthResource,
        oauthScopes: definition.scopes,
      },
    },
    guide: null,
    folderPath: resolve(workspaceRootPath, 'plugins'),
    workspaceRootPath,
    workspaceId: basename(workspaceRootPath),
  };
}

export function findPluginMcpAuthSource(workspaceRootPath: string, sourceSlug: string): LoadedSource | null {
  const definition = loadPluginMcpServerDefinitions(workspaceRootPath)
    .find(item => item.authSourceSlug === sourceSlug);
  return definition ? createPluginMcpAuthSource(workspaceRootPath, definition) : null;
}

export async function resolvePluginMcpServerConfig(
  workspaceRootPath: string,
  definition: PluginMcpServerDefinition,
): Promise<SdkMcpServerConfig> {
  if (definition.authType !== 'oauth' || definition.config.type === 'stdio') return definition.config;
  const source = createPluginMcpAuthSource(workspaceRootPath, definition);
  if (!source) return definition.config;

  const credentialManager = getSourceCredentialManager();
  const credential = await credentialManager.load(source);
  if (!credential) return definition.config;

  let token = credential.value;
  if (credentialManager.isExpired(credential) || credentialManager.needsRefresh(credential)) {
    const refreshed = await new TokenRefreshManager(credentialManager).ensureFreshToken(source);
    if (!refreshed.success || !refreshed.token) return definition.config;
    token = refreshed.token;
  }

  return {
    ...definition.config,
    headers: {
      ...definition.config.headers,
      Authorization: `Bearer ${token}`,
    },
  };
}
