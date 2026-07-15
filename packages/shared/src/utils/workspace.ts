import { findPluginManifest } from '../plugins/storage.ts';

/**
 * Read the SDK/plugin package name from a supported plugin manifest.
 *
 * Craft Agent recognizes Craft, Codex, and Claude-style plugin manifests,
 * using the manifest `name` field instead of path.basename().
 *
 * @returns The plugin name, or null if the manifest doesn't exist or is unreadable
 */
export function readPluginName(workspaceRootPath: string): string | null {
  return findPluginManifest(workspaceRootPath)?.manifest.name ?? null;
}

// Re-export browser-safe slug extraction for convenience
export { extractWorkspaceSlugFromPath } from './workspace-slug.ts';

/**
 * Extract workspace slug for SDK skill qualification.
 *
 * Reads the actual plugin name from supported plugin manifests,
 * falling back to the last path component of the root path.
 *
 * NOTE: Requires Node.js (fs/path). For browser contexts, use extractWorkspaceSlugFromPath
 * from './workspace-slug.ts' instead.
 */
export function extractWorkspaceSlug(rootPath: string, fallbackId: string): string {
  // Read the actual SDK plugin name — this is what the SDK uses to resolve skills
  const pluginName = readPluginName(rootPath);
  if (pluginName) return pluginName;

  // Fallback to last path component (legacy behavior)
  const pathParts = rootPath.split(/[\\/]/).filter(Boolean);
  return pathParts[pathParts.length - 1] || fallbackId;
}
