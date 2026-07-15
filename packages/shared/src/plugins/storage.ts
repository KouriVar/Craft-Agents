import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { LoadedPluginPackage, PluginDependencyEntry, PluginManifest, PluginManifestFormat } from './types.ts';

export const CRAFT_PLUGIN_MANIFEST_DIR = '.craft-plugin';
export const CODEX_PLUGIN_MANIFEST_DIR = '.codex-plugin';
export const CLAUDE_PLUGIN_MANIFEST_DIR = '.claude-plugin';
export const PLUGIN_MANIFEST_FILE = 'plugin.json';

const MANIFEST_CANDIDATES: Array<{ format: PluginManifestFormat; dir: string }> = [
  { format: 'craft', dir: CRAFT_PLUGIN_MANIFEST_DIR },
  { format: 'codex', dir: CODEX_PLUGIN_MANIFEST_DIR },
  { format: 'claude', dir: CLAUDE_PLUGIN_MANIFEST_DIR },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function normalizeStringList(value: unknown): string[] | undefined {
  const values = typeof value === 'string'
    ? [value]
    : Array.isArray(value)
      ? value
      : undefined;

  if (!values) return undefined;

  const normalized = Array.from(new Set(
    values
      .filter((entry): entry is string => typeof entry === 'string')
      .map(entry => entry.trim())
      .filter(Boolean)
  ));

  return normalized.length > 0 ? normalized : undefined;
}

function normalizeManifest(value: unknown): PluginManifest | null {
  if (!isRecord(value)) return null;
  const name = normalizeString(value.name);
  if (!name) return null;

  const manifest: PluginManifest = {
    name,
    displayName: normalizeString(value.displayName),
    version: normalizeString(value.version),
    description: normalizeString(value.description),
    homepage: normalizeString(value.homepage),
    repository: normalizeString(value.repository),
    license: normalizeString(value.license),
    keywords: normalizeStringList(value.keywords),
    defaultEnabled: typeof value.defaultEnabled === 'boolean' ? value.defaultEnabled : undefined,
    skills: typeof value.skills === 'string' || Array.isArray(value.skills) ? value.skills as string | string[] : undefined,
    mcpServers: value.mcpServers,
  };

  if (typeof value.author === 'string') {
    manifest.author = value.author;
  } else if (isRecord(value.author)) {
    manifest.author = {
      name: normalizeString(value.author.name),
      email: normalizeString(value.author.email),
      url: normalizeString(value.author.url),
    };
  }

  if (Array.isArray(value.dependencies)) {
    manifest.dependencies = value.dependencies
      .map((dependency): PluginDependencyEntry | null => {
        if (typeof dependency === 'string' && dependency.trim()) {
          return dependency.trim();
        }
        if (isRecord(dependency)) {
          const dependencyName = normalizeString(dependency.name);
          if (!dependencyName) return null;
          return {
            name: dependencyName,
            marketplace: normalizeString(dependency.marketplace),
          };
        }
        return null;
      })
      .filter((dependency): dependency is PluginDependencyEntry => Boolean(dependency));
  }

  return manifest;
}

function isDirectory(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function existingDirectories(paths: string[]): string[] {
  return Array.from(new Set(paths.map(path => resolve(path)))).filter(isDirectory);
}

function existingFiles(paths: string[]): string[] {
  return Array.from(new Set(paths.map(path => resolve(path)))).filter(path => {
    try {
      return existsSync(path) && statSync(path).isFile();
    } catch {
      return false;
    }
  });
}

function resolveRelativePaths(rootPath: string, values: string[] | undefined): string[] {
  return (values ?? []).map(value => resolve(rootPath, value));
}

function readManifestAt(path: string): PluginManifest | null {
  try {
    return normalizeManifest(JSON.parse(readFileSync(path, 'utf-8')));
  } catch {
    return null;
  }
}

export function findPluginManifest(rootPath: string): { path: string; format: PluginManifestFormat; manifest: PluginManifest } | null {
  const root = resolve(rootPath);

  for (const candidate of MANIFEST_CANDIDATES) {
    const manifestPath = join(root, candidate.dir, PLUGIN_MANIFEST_FILE);
    const manifest = readManifestAt(manifestPath);
    if (manifest) {
      return { path: manifestPath, format: candidate.format, manifest };
    }
  }

  return null;
}

export function loadPluginPackage(rootPath: string): LoadedPluginPackage | null {
  const root = resolve(rootPath);
  const resolvedManifest = findPluginManifest(root);
  if (!resolvedManifest) return null;

  const manifestSkillDirs = resolveRelativePaths(root, normalizeStringList(resolvedManifest.manifest.skills));
  const defaultSkillDirs = [join(root, 'skills')];

  return {
    rootPath: root,
    manifestPath: resolvedManifest.path,
    manifestFormat: resolvedManifest.format,
    manifest: resolvedManifest.manifest,
    skillDirs: existingDirectories([...defaultSkillDirs, ...manifestSkillDirs]),
    mcpConfigPaths: existingFiles([
      join(root, '.mcp.json'),
      join(root, CODEX_PLUGIN_MANIFEST_DIR, 'mcp.json'),
      join(root, CRAFT_PLUGIN_MANIFEST_DIR, 'mcp.json'),
    ]),
    appConfigPaths: existingFiles([
      join(root, '.app.json'),
      join(root, CODEX_PLUGIN_MANIFEST_DIR, 'app.json'),
      join(root, CRAFT_PLUGIN_MANIFEST_DIR, 'app.json'),
    ]),
    widgetAssetDirs: existingDirectories([
      join(root, 'widgets'),
      join(root, 'assets'),
      join(root, '.scatter', 'assets'),
    ]),
  };
}
