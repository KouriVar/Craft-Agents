import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type {
  PluginMarketplaceCatalog,
  PluginMarketplaceConfig,
  PluginMarketplaceEntry,
  PluginMarketplacePackageSource,
  PluginMarketplaceSource,
} from './types.ts';

export const PLUGIN_MARKETPLACE_CONFIG_FILE = join('plugins', 'marketplaces.json');
export const DEFAULT_PLUGIN_MARKETPLACE: PluginMarketplaceSource = {
  id: 'openai-official',
  name: 'OpenAI',
  source: 'openai/plugins',
  ref: 'main',
  builtin: true,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function normalizePackageSource(value: unknown): PluginMarketplacePackageSource | null {
  if (typeof value === 'string' && value.trim()) {
    return { source: 'local', path: value.trim() };
  }
  if (!isRecord(value)) return null;
  const kind = stringValue(value.source);
  if (kind === 'local') {
    const path = stringValue(value.path);
    return path ? { source: 'local', path } : null;
  }
  if (kind === 'url') {
    const url = stringValue(value.url);
    return url ? { source: 'url', url, ref: stringValue(value.ref) } : null;
  }
  if (kind === 'git-subdir') {
    const url = stringValue(value.url);
    const path = stringValue(value.path);
    return url && path ? { source: 'git-subdir', url, path, ref: stringValue(value.ref) } : null;
  }
  if (kind === 'npm') {
    const packageName = stringValue(value.package);
    return packageName ? { source: 'npm', package: packageName, version: stringValue(value.version) } : null;
  }
  return null;
}

export function marketplaceSourceId(source: string): string {
  const slug = source.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return slug || `marketplace-${Date.now()}`;
}

export function loadPluginMarketplaceSources(workspaceRootPath: string): PluginMarketplaceSource[] {
  const configPath = join(workspaceRootPath, PLUGIN_MARKETPLACE_CONFIG_FILE);
  let custom: PluginMarketplaceSource[] = [];
  try {
    if (existsSync(configPath)) {
      const parsed = JSON.parse(readFileSync(configPath, 'utf-8')) as PluginMarketplaceConfig;
      if (parsed?.version === 1 && Array.isArray(parsed.sources)) {
        custom = parsed.sources.filter(source => source && typeof source.id === 'string' && typeof source.source === 'string');
      }
    }
  } catch {
    custom = [];
  }
  return [DEFAULT_PLUGIN_MARKETPLACE, ...custom.filter(source => source.id !== DEFAULT_PLUGIN_MARKETPLACE.id)];
}

export function savePluginMarketplaceSources(workspaceRootPath: string, sources: PluginMarketplaceSource[]): void {
  const configPath = join(workspaceRootPath, PLUGIN_MARKETPLACE_CONFIG_FILE);
  mkdirSync(dirname(configPath), { recursive: true });
  const config: PluginMarketplaceConfig = {
    version: 1,
    sources: sources.filter(source => !source.builtin),
  };
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf-8');
}

export function parsePluginMarketplaceCatalog(
  source: PluginMarketplaceSource,
  value: unknown,
  refreshedAt = Date.now(),
): PluginMarketplaceCatalog {
  if (!isRecord(value) || !Array.isArray(value.plugins)) {
    throw new Error('Invalid marketplace catalog: plugins[] is required');
  }
  const interfaceValue = isRecord(value.interface) ? value.interface : undefined;
  const displayName = stringValue(interfaceValue?.displayName) || stringValue(value.name) || source.name;
  const plugins: PluginMarketplaceEntry[] = [];
  for (const item of value.plugins) {
    if (!isRecord(item)) continue;
    const name = stringValue(item.name);
    const packageSource = normalizePackageSource(item.source);
    if (!name || !packageSource) continue;
    const policy = isRecord(item.policy) ? item.policy : undefined;
    const unsupported = packageSource.source === 'npm';
    plugins.push({
      marketplaceId: source.id,
      name,
      displayName: stringValue(item.displayName),
      description: stringValue(item.description),
      category: stringValue(item.category),
      installation: stringValue(policy?.installation),
      authentication: stringValue(policy?.authentication),
      packageSource,
      compatibility: unsupported ? 'unsupported' : 'unknown',
      compatibilityReason: unsupported ? 'NPM marketplace packages are not supported yet.' : undefined,
    });
  }
  return { source, displayName, plugins, refreshedAt };
}
