import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { atomicWriteFileSync, readJsonFileSync } from '../utils/files.ts';
import type { LoadedPluginPackage, WorkspacePluginConfig, WorkspacePluginEntry } from './types.ts';
import { loadPluginPackage } from './storage.ts';
import { assessPluginCompatibility } from './compatibility.ts';

export const PLUGIN_CONFIG_DIR = 'plugins';
export const PLUGIN_CONFIG_FILE = 'plugins/config.json';

export function getDefaultPluginConfig(): WorkspacePluginConfig {
  return {
    version: 1,
    plugins: {},
  };
}

function normalizeEntry(workspaceRootPath: string, name: string, value: unknown): WorkspacePluginEntry | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const entryName = typeof record.name === 'string' && record.name.trim() ? record.name.trim() : name;

  return {
    name: entryName,
    enabled: typeof record.enabled === 'boolean' ? record.enabled : true,
    installPath: typeof record.installPath === 'string' && record.installPath.trim() ? resolve(workspaceRootPath, record.installPath) : undefined,
    manifestPath: typeof record.manifestPath === 'string' && record.manifestPath.trim() ? resolve(workspaceRootPath, record.manifestPath) : undefined,
    manifestFormat: record.manifestFormat === 'craft' || record.manifestFormat === 'codex' || record.manifestFormat === 'claude'
      ? record.manifestFormat
      : undefined,
    version: typeof record.version === 'string' && record.version.trim() ? record.version.trim() : undefined,
    displayName: typeof record.displayName === 'string' && record.displayName.trim() ? record.displayName.trim() : undefined,
    description: typeof record.description === 'string' && record.description.trim() ? record.description.trim() : undefined,
    iconPath: typeof record.iconPath === 'string' && record.iconPath.trim() ? resolve(workspaceRootPath, record.iconPath) : undefined,
    brandColor: typeof record.brandColor === 'string' && record.brandColor.trim() ? record.brandColor.trim() : undefined,
    source: record.source === 'local' || record.source === 'git' || record.source === 'unknown' ? record.source : 'unknown',
    sourceUrl: typeof record.sourceUrl === 'string' && record.sourceUrl.trim() ? record.sourceUrl.trim() : undefined,
    gitRef: typeof record.gitRef === 'string' && record.gitRef.trim() ? record.gitRef.trim() : undefined,
    updatedAt: typeof record.updatedAt === 'number' && Number.isFinite(record.updatedAt) ? record.updatedAt : Date.now(),
  };
}

function normalizeConfig(workspaceRootPath: string, value: unknown): WorkspacePluginConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return getDefaultPluginConfig();
  }

  const record = value as Record<string, unknown>;
  const pluginsRecord = record.plugins && typeof record.plugins === 'object' && !Array.isArray(record.plugins)
    ? record.plugins as Record<string, unknown>
    : {};

  const plugins: Record<string, WorkspacePluginEntry> = {};
  for (const [name, entry] of Object.entries(pluginsRecord)) {
    const normalized = normalizeEntry(workspaceRootPath, name, entry);
    if (normalized) {
      plugins[normalized.name] = normalized;
    }
  }

  return {
    version: 1,
    plugins,
  };
}

export function loadPluginConfig(workspaceRootPath: string): WorkspacePluginConfig {
  const configPath = join(workspaceRootPath, PLUGIN_CONFIG_FILE);
  if (!existsSync(configPath)) {
    return getDefaultPluginConfig();
  }

  try {
    return normalizeConfig(workspaceRootPath, readJsonFileSync(configPath));
  } catch {
    return getDefaultPluginConfig();
  }
}

export function savePluginConfig(workspaceRootPath: string, config: WorkspacePluginConfig): void {
  const configDir = join(workspaceRootPath, PLUGIN_CONFIG_DIR);
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  atomicWriteFileSync(
    join(workspaceRootPath, PLUGIN_CONFIG_FILE),
    JSON.stringify(normalizeConfig(workspaceRootPath, config), null, 2)
  );
}

export function listPluginEntries(workspaceRootPath: string): WorkspacePluginEntry[] {
  const config = loadPluginConfig(workspaceRootPath);
  let changed = false;
  for (const entry of Object.values(config.plugins)) {
    if (!entry.installPath) continue;
    const pluginPackage = loadPluginPackage(entry.installPath);
    if (!pluginPackage) continue;
    const iconPath = cachePluginIcon(workspaceRootPath, pluginPackage);
    const displayName = pluginPackage.manifest.displayName ?? pluginPackage.manifest.interface?.displayName;
    const brandColor = pluginPackage.manifest.interface?.brandColor;
    entry.compatibility = assessPluginCompatibility(pluginPackage);
    if (iconPath && iconPath !== entry.iconPath) {
      entry.iconPath = iconPath;
      changed = true;
    }
    if (displayName && displayName !== entry.displayName) {
      entry.displayName = displayName;
      changed = true;
    }
    if (brandColor && brandColor !== entry.brandColor) {
      entry.brandColor = brandColor;
      changed = true;
    }
  }
  if (changed) savePluginConfig(workspaceRootPath, config);
  return Object.values(config.plugins).sort((a, b) => a.name.localeCompare(b.name));
}

export function isPluginEnabled(workspaceRootPath: string, pluginName: string): boolean {
  const config = loadPluginConfig(workspaceRootPath);
  return config.plugins[pluginName]?.enabled ?? true;
}

export function isPluginPackageEnabled(workspaceRootPath: string, pluginPackage: LoadedPluginPackage): boolean {
  const config = loadPluginConfig(workspaceRootPath);
  return config.plugins[pluginPackage.manifest.name]?.enabled
    ?? pluginPackage.manifest.defaultEnabled
    ?? true;
}

function cachePluginIcon(workspaceRootPath: string, pluginPackage: LoadedPluginPackage): string | undefined {
  if (!pluginPackage.iconPath || !existsSync(pluginPackage.iconPath)) return undefined;
  const ext = extname(pluginPackage.iconPath).toLowerCase();
  if (!['.svg', '.png', '.jpg', '.jpeg', '.webp', '.ico', '.gif'].includes(ext)) return undefined;
  const safeName = pluginPackage.manifest.name.replace(/[^a-zA-Z0-9._-]+/g, '-');
  const iconDir = join(workspaceRootPath, PLUGIN_CONFIG_DIR, 'icons');
  const target = join(iconDir, `${safeName}${ext}`);
  try {
    mkdirSync(iconDir, { recursive: true });
    if (resolve(pluginPackage.iconPath) !== resolve(target)) copyFileSync(pluginPackage.iconPath, target);
    return target;
  } catch {
    return undefined;
  }
}

export function setPluginEnabled(workspaceRootPath: string, pluginName: string, enabled: boolean): WorkspacePluginEntry {
  const config = loadPluginConfig(workspaceRootPath);
  const existing = config.plugins[pluginName];
  const entry: WorkspacePluginEntry = {
    name: pluginName,
    enabled,
    installPath: existing?.installPath,
    manifestPath: existing?.manifestPath,
    manifestFormat: existing?.manifestFormat,
    version: existing?.version,
    displayName: existing?.displayName,
    description: existing?.description,
    iconPath: existing?.iconPath,
    brandColor: existing?.brandColor,
    source: existing?.source ?? 'unknown',
    sourceUrl: existing?.sourceUrl,
    gitRef: existing?.gitRef,
    updatedAt: Date.now(),
    compatibility: existing?.compatibility,
  };

  config.plugins[pluginName] = entry;
  savePluginConfig(workspaceRootPath, config);
  return entry;
}

export function registerPluginPackage(
  workspaceRootPath: string,
  pluginPackage: LoadedPluginPackage,
  options: { enabled?: boolean; source?: WorkspacePluginEntry['source']; sourceUrl?: string; gitRef?: string } = {}
): WorkspacePluginEntry {
  const config = loadPluginConfig(workspaceRootPath);
  const existing = config.plugins[pluginPackage.manifest.name];
  const entry: WorkspacePluginEntry = {
    name: pluginPackage.manifest.name,
    enabled: options.enabled ?? existing?.enabled ?? pluginPackage.manifest.defaultEnabled ?? true,
    installPath: pluginPackage.rootPath,
    manifestPath: pluginPackage.manifestPath,
    manifestFormat: pluginPackage.manifestFormat,
    version: pluginPackage.manifest.version,
    displayName: pluginPackage.manifest.displayName ?? pluginPackage.manifest.interface?.displayName,
    description: pluginPackage.manifest.description,
    iconPath: cachePluginIcon(workspaceRootPath, pluginPackage) ?? existing?.iconPath,
    brandColor: pluginPackage.manifest.interface?.brandColor ?? existing?.brandColor,
    source: options.source ?? existing?.source ?? 'local',
    sourceUrl: options.sourceUrl ?? existing?.sourceUrl,
    gitRef: options.gitRef ?? existing?.gitRef,
    updatedAt: Date.now(),
    compatibility: assessPluginCompatibility(pluginPackage),
  };

  config.plugins[entry.name] = entry;
  savePluginConfig(workspaceRootPath, config);
  return entry;
}

export function unregisterPlugin(workspaceRootPath: string, pluginName: string): WorkspacePluginEntry | null {
  const config = loadPluginConfig(workspaceRootPath);
  const existing = config.plugins[pluginName];
  if (!existing) return null;

  delete config.plugins[pluginName];
  savePluginConfig(workspaceRootPath, config);
  if (existing.iconPath) {
    const managedIconRoot = resolve(workspaceRootPath, PLUGIN_CONFIG_DIR, 'icons');
    const iconPath = resolve(existing.iconPath);
    if (iconPath.startsWith(`${managedIconRoot}/`)) {
      rmSync(iconPath, { force: true });
    }
  }
  return existing;
}

export function removeManagedPlugin(workspaceRootPath: string, pluginName: string): WorkspacePluginEntry | null {
  const existing = unregisterPlugin(workspaceRootPath, pluginName);
  if (!existing?.installPath) return existing;

  const managedPluginsRoot = resolve(workspaceRootPath, PLUGIN_CONFIG_DIR, 'installed');
  const installPath = resolve(existing.installPath);
  if (installPath.startsWith(`${managedPluginsRoot}/`) || installPath === managedPluginsRoot) {
    rmSync(installPath, { recursive: true, force: true });
  }

  return existing;
}
