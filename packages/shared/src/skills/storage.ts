/**
 * Skills Storage
 *
 * CRUD operations for workspace skills.
 * Skills are stored in {workspace}/skills/{slug}/ directories.
 */

import {
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from 'fs';
import { homedir } from 'os';
import { dirname, join, resolve } from 'path';
import matter from 'gray-matter';
import { load as loadYaml } from 'js-yaml';
import type { LoadedSkill, SkillMetadata, SkillSource } from './types.ts';
import { getWorkspaceSkillsPath } from '../workspaces/storage.ts';
import { loadPluginPackage } from '../plugins/storage.ts';
import { isPluginPackageEnabled, listPluginEntries } from '../plugins/config.ts';
import {
  validateIconValue,
  findIconFile,
  downloadIcon,
  needsIconDownload,
  isIconUrl,
} from '../utils/icon.ts';
import { getBundledAssetsDir } from '../utils/paths.ts';

// ============================================================
// Agent Skills Paths (Issue #171)
// ============================================================

/** Global agent skills directory: ~/.agents/skills/ */
export const GLOBAL_AGENT_SKILLS_DIR = join(homedir(), '.agents', 'skills');

/** Project-level agent skills relative directory name */
export const PROJECT_AGENT_SKILLS_DIR = '.agents/skills';

/**
 * Return project-level skill directories for a working directory.
 *
 * Codex-style project skills can live in `.agents/skills` at the current
 * working directory or any parent up to the repository root. Parent folders
 * are returned first so deeper working-directory skills override them.
 */
export function getProjectSkillDirs(projectRoot: string): string[] {
  const start = resolve(projectRoot);
  if (!existsSync(start)) {
    return [join(start, PROJECT_AGENT_SKILLS_DIR)];
  }

  const dirs: string[] = [start];
  let current = start;
  let foundRepoRoot = existsSync(join(current, '.git'));

  while (!foundRepoRoot) {
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
    dirs.push(current);
    foundRepoRoot = existsSync(join(current, '.git'));
  }

  const searchableDirs = foundRepoRoot ? dirs.reverse() : [start];
  return searchableDirs.map(dir => join(dir, PROJECT_AGENT_SKILLS_DIR));
}

export function getProjectPackageRoots(projectRoot: string): string[] {
  const start = resolve(projectRoot);
  if (!existsSync(start)) {
    return [];
  }

  const dirs: string[] = [start];
  let current = start;
  let foundRepoRoot = existsSync(join(current, '.git'));

  while (!foundRepoRoot) {
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
    dirs.push(current);
    foundRepoRoot = existsSync(join(current, '.git'));
  }

  return foundRepoRoot ? dirs.reverse() : [start];
}

/**
 * Normalize string-list frontmatter to a clean array.
 * Accepts a single string or array of strings, trims whitespace, and deduplicates.
 */
function normalizeStringList(value: unknown): string[] | undefined {
  const asArray = typeof value === 'string'
    ? [value]
    : Array.isArray(value)
      ? value
      : undefined;

  if (!asArray) return undefined;

  const normalized = Array.from(new Set(
    asArray
      .filter((entry): entry is string => typeof entry === 'string')
      .map(entry => entry.trim())
      .filter(Boolean)
  ));

  return normalized.length > 0 ? normalized : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function normalizeString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function mergeStringLists(...lists: Array<string[] | undefined>): string[] | undefined {
  const merged = Array.from(new Set(lists.flatMap(list => list ?? [])));
  return merged.length > 0 ? merged : undefined;
}

function loadPortableOpenAiSkillMetadata(skillDir: string): Partial<SkillMetadata> {
  const openAiMetadataPath = join(skillDir, 'agents', 'openai.yaml');
  if (!existsSync(openAiMetadataPath)) {
    return {};
  }

  let parsed: unknown;
  try {
    parsed = loadYaml(readFileSync(openAiMetadataPath, 'utf-8'));
  } catch {
    return {};
  }

  const root = asRecord(parsed);
  if (!root) return {};

  const interfaceConfig = asRecord(root.interface);
  const policyConfig = asRecord(root.policy);
  const dependenciesConfig = asRecord(root.dependencies);

  const allowImplicit = policyConfig?.allow_implicit_invocation;

  return {
    displayName: normalizeString(interfaceConfig?.display_name),
    shortDescription: normalizeString(interfaceConfig?.short_description),
    defaultPrompt: normalizeString(interfaceConfig?.default_prompt),
    implicitInvocation: typeof allowImplicit === 'boolean' ? allowImplicit : undefined,
    requiredTools: normalizeStringList(dependenciesConfig?.tools),
    requiredSources: normalizeStringList(dependenciesConfig?.sources),
  };
}

// ============================================================
// Parsing
// ============================================================

/**
 * Parse SKILL.md content and extract frontmatter + body
 */
function parseSkillFile(content: string, skillDir: string): { metadata: SkillMetadata; body: string } | null {
  try {
    const parsed = matter(content);
    const portable = loadPortableOpenAiSkillMetadata(skillDir);

    // Validate required fields
    const name = normalizeString(parsed.data.name) ?? portable.displayName;
    const description = normalizeString(parsed.data.description) ?? portable.shortDescription;
    if (!name || !description) {
      return null;
    }

    // Validate and extract optional icon field
    // Only accepts emoji or URL - rejects inline SVG and relative paths
    const icon = validateIconValue(parsed.data.icon, 'Skills');

    return {
      metadata: {
        name,
        description,
        displayName: portable.displayName,
        shortDescription: portable.shortDescription,
        defaultPrompt: portable.defaultPrompt,
        implicitInvocation: portable.implicitInvocation,
        globs: normalizeStringList(parsed.data.globs),
        alwaysAllow: normalizeStringList(parsed.data.alwaysAllow),
        requiredTools: portable.requiredTools,
        icon,
        requiredSources: mergeStringLists(
          normalizeStringList(parsed.data.requiredSources),
          portable.requiredSources
        ),
      },
      body: parsed.content,
    };
  } catch {
    return null;
  }
}

// ============================================================
// Load Operations
// ============================================================

/**
 * Load a single skill from a directory
 * @param skillsDir - Absolute path to skills directory
 * @param slug - Skill directory name
 * @param source - Where this skill is loaded from
 */
function loadSkillFromDir(
  skillsDir: string,
  slug: string,
  source: SkillSource,
  plugin?: { name: string; displayName?: string; iconPath?: string; brandColor?: string },
): LoadedSkill | null {
  const skillDir = join(skillsDir, slug);
  const skillFile = join(skillDir, 'SKILL.md');

  // Check directory exists
  if (!existsSync(skillDir) || !statSync(skillDir).isDirectory()) {
    return null;
  }

  // Check SKILL.md exists
  if (!existsSync(skillFile)) {
    return null;
  }

  // Read and parse SKILL.md
  let content: string;
  try {
    content = readFileSync(skillFile, 'utf-8');
  } catch {
    return null;
  }

  const parsed = parseSkillFile(content, skillDir);
  if (!parsed) {
    return null;
  }

  return {
    slug,
    metadata: parsed.metadata,
    content: parsed.body,
    iconPath: findIconFile(skillDir),
    path: skillDir,
    source,
    pluginName: plugin?.name,
    pluginDisplayName: plugin?.displayName,
    pluginIconPath: plugin?.iconPath,
    pluginBrandColor: plugin?.brandColor,
  };
}

/**
 * Load all skills from a directory
 * @param skillsDir - Absolute path to skills directory
 * @param source - Where these skills are loaded from
 */
function loadSkillsFromDir(
  skillsDir: string,
  source: SkillSource,
  plugin?: { name: string; displayName?: string; iconPath?: string; brandColor?: string },
): LoadedSkill[] {
  if (!existsSync(skillsDir)) {
    return [];
  }

  const skills: LoadedSkill[] = [];

  try {
    const entries = readdirSync(skillsDir, { withFileTypes: true });
    for (const entry of entries) {
      // Accept regular directories and symlinks that point to directories.
      // isDirectory() alone returns false for symlinks, which silently drops
      // symlinked skill directories (e.g. from `ln -s`).
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      if (entry.isSymbolicLink()) {
        try {
          if (!statSync(join(skillsDir, entry.name)).isDirectory()) continue;
        } catch {
          continue; // Broken symlink — skip
        }
      }

      const skill = loadSkillFromDir(skillsDir, entry.name, source, plugin);
      if (skill) {
        skills.push(skill);
      }
    }
  } catch {
    // Ignore errors reading skills directory
  }

  return skills;
}

/**
 * Load a single skill from a workspace
 * @param workspaceRoot - Absolute path to workspace root
 * @param slug - Skill directory name
 */
export function loadSkill(workspaceRoot: string, slug: string): LoadedSkill | null {
  const skillsDir = getWorkspaceSkillsPath(workspaceRoot);
  return loadSkillFromDir(skillsDir, slug, 'workspace');
}

/**
 * Load all skills from a workspace
 * @param workspaceRoot - Absolute path to workspace root
 */
export function loadWorkspaceSkills(workspaceRoot: string): LoadedSkill[] {
  const skillsDir = getWorkspaceSkillsPath(workspaceRoot);
  return loadSkillsFromDir(skillsDir, 'workspace');
}

/** Load app-provided skills. These form the lowest-priority, read-only tier. */
export function loadBundledSkills(): LoadedSkill[] {
  const skillsDir = getBundledAssetsDir('skills');
  return skillsDir ? loadSkillsFromDir(skillsDir, 'builtin') : [];
}

// ── Skills cache ────────────────────────────────────────────────────────
// loadAllSkills reads from several skill tiers on every call (~100ms).
// The result rarely changes during a session, so we cache it per
// (workspaceRoot, projectRoot) pair with a 5-minute safety TTL.

const skillsCache = new Map<string, { skills: LoadedSkill[]; ts: number }>();
const SKILLS_CACHE_TTL = 5 * 60_000; // 5 minutes

/** Invalidate the skills cache (call on working dir change or skill file events). */
export function invalidateSkillsCache(): void {
  skillsCache.clear();
}

/**
 * Load all skills from all sources (builtin, global, managed plugins, workspace, project)
 * Skills with the same slug are overridden by higher-priority sources.
 * Priority: builtin (lowest) < global < plugin < workspace < project (highest)
 *
 * Results are cached per (workspaceRoot, projectRoot) pair. Call
 * invalidateSkillsCache() on working directory changes or skill file events.
 *
 * @param workspaceRoot - Absolute path to workspace root
 * @param projectRoot - Optional project root (working directory) for project-level skills
 */
export function loadAllSkills(workspaceRoot: string, projectRoot?: string): LoadedSkill[] {
  const cacheKey = `${workspaceRoot}::${projectRoot ?? ''}`;
  const now = Date.now();
  const cached = skillsCache.get(cacheKey);
  if (cached && now - cached.ts < SKILLS_CACHE_TTL) {
    return cached.skills;
  }

  const skillsBySlug = new Map<string, LoadedSkill>();

  // 1. Built-in app skills (lowest priority): resources/skills/
  for (const skill of loadBundledSkills()) {
    skillsBySlug.set(skill.slug, skill);
  }

  // 2. Global user skills: ~/.agents/skills/
  for (const skill of loadSkillsFromDir(GLOBAL_AGENT_SKILLS_DIR, 'global')) {
    skillsBySlug.set(skill.slug, skill);
  }

  // 3. Enabled plugins installed or registered in this workspace.
  for (const entry of listPluginEntries(workspaceRoot)) {
    if (!entry.enabled || !entry.installPath) continue;
    const pluginPackage = loadPluginPackage(entry.installPath);
    if (!pluginPackage) continue;
    const pluginPresentation = {
      name: pluginPackage.manifest.name,
      displayName: entry.displayName ?? pluginPackage.manifest.interface?.displayName,
      iconPath: entry.iconPath ?? pluginPackage.iconPath,
      brandColor: entry.brandColor ?? pluginPackage.manifest.interface?.brandColor,
    };
    for (const skillDir of pluginPackage.skillDirs) {
      for (const skill of loadSkillsFromDir(skillDir, 'plugin', pluginPresentation)) {
        skillsBySlug.set(skill.slug, skill);
      }
    }
  }

  // 4. Workspace skills (medium priority)
  for (const skill of loadWorkspaceSkills(workspaceRoot)) {
    skillsBySlug.set(skill.slug, skill);
  }

  // 5. Project skills (highest priority): plugin package skills and .agents/skills from repo root to working dir
  if (projectRoot) {
    for (const packageRoot of getProjectPackageRoots(projectRoot)) {
      const pluginPackage = loadPluginPackage(packageRoot);
      if (pluginPackage && isPluginPackageEnabled(workspaceRoot, pluginPackage)) {
        const pluginPresentation = {
          name: pluginPackage.manifest.name,
          displayName: pluginPackage.manifest.displayName ?? pluginPackage.manifest.interface?.displayName,
          iconPath: pluginPackage.iconPath,
          brandColor: pluginPackage.manifest.interface?.brandColor,
        };
        for (const skillDir of pluginPackage.skillDirs) {
          for (const skill of loadSkillsFromDir(skillDir, 'project', pluginPresentation)) {
            skillsBySlug.set(skill.slug, skill);
          }
        }
      }
      for (const skill of loadSkillsFromDir(join(packageRoot, PROJECT_AGENT_SKILLS_DIR), 'project')) {
        skillsBySlug.set(skill.slug, skill);
      }
    }
  }

  const result = Array.from(skillsBySlug.values());
  skillsCache.set(cacheKey, { skills: result, ts: now });
  return result;
}

/**
 * Load a single skill by slug from all sources (project > workspace > plugin > global > builtin).
 * Unlike loadAllSkills(), this only reads the specific slug directory — O(1) not O(N).
 *
 * @param workspaceRoot - Absolute path to workspace root
 * @param slug - Skill slug to load
 * @param projectRoot - Optional project root for project-level skills
 */
export function loadSkillBySlug(workspaceRoot: string, slug: string, projectRoot?: string): LoadedSkill | null {
  // Highest priority: project-level
  if (projectRoot) {
    for (const packageRoot of getProjectPackageRoots(projectRoot).reverse()) {
      const projectSkillsDir = join(packageRoot, PROJECT_AGENT_SKILLS_DIR);
      const projectSkill = loadSkillFromDir(projectSkillsDir, slug, 'project');
      if (projectSkill) return projectSkill;

      const pluginPackage = loadPluginPackage(packageRoot);
      if (pluginPackage && isPluginPackageEnabled(workspaceRoot, pluginPackage)) {
        const pluginPresentation = {
          name: pluginPackage.manifest.name,
          displayName: pluginPackage.manifest.displayName ?? pluginPackage.manifest.interface?.displayName,
          iconPath: pluginPackage.iconPath,
          brandColor: pluginPackage.manifest.interface?.brandColor,
        };
        for (const projectSkillsDir of [...pluginPackage.skillDirs].reverse()) {
          const skill = loadSkillFromDir(projectSkillsDir, slug, 'project', pluginPresentation);
          if (skill) return skill;
        }
      }
    }
  }

  // Medium priority: workspace
  const workspaceSkill = loadSkillFromDir(getWorkspaceSkillsPath(workspaceRoot), slug, 'workspace');
  if (workspaceSkill) return workspaceSkill;

  // Enabled workspace plugins are lower priority than user-authored workspace skills.
  for (const entry of listPluginEntries(workspaceRoot)) {
    if (!entry.enabled || !entry.installPath) continue;
    const pluginPackage = loadPluginPackage(entry.installPath);
    if (!pluginPackage) continue;
    const pluginPresentation = {
      name: pluginPackage.manifest.name,
      displayName: entry.displayName ?? pluginPackage.manifest.interface?.displayName,
      iconPath: entry.iconPath ?? pluginPackage.iconPath,
      brandColor: entry.brandColor ?? pluginPackage.manifest.interface?.brandColor,
    };
    for (const pluginSkillsDir of [...pluginPackage.skillDirs].reverse()) {
      const skill = loadSkillFromDir(pluginSkillsDir, slug, 'plugin', pluginPresentation);
      if (skill) return skill;
    }
  }

  // User-global overrides the app-provided version.
  const globalSkill = loadSkillFromDir(GLOBAL_AGENT_SKILLS_DIR, slug, 'global');
  if (globalSkill) return globalSkill;

  const bundledSkillsDir = getBundledAssetsDir('skills');
  return bundledSkillsDir ? loadSkillFromDir(bundledSkillsDir, slug, 'builtin') : null;
}

/**
 * Get icon path for a skill
 * @param workspaceRoot - Absolute path to workspace root
 * @param slug - Skill directory name
 */
export function getSkillIconPath(workspaceRoot: string, slug: string): string | null {
  const skillsDir = getWorkspaceSkillsPath(workspaceRoot);
  const skillDir = join(skillsDir, slug);

  if (!existsSync(skillDir)) {
    return null;
  }

  return findIconFile(skillDir) || null;
}

// ============================================================
// Delete Operations
// ============================================================

/**
 * Delete a skill from a workspace
 * @param workspaceRoot - Absolute path to workspace root
 * @param slug - Skill directory name
 */
export function deleteSkill(workspaceRoot: string, slug: string): boolean {
  const skillsDir = getWorkspaceSkillsPath(workspaceRoot);
  const skillDir = join(skillsDir, slug);

  if (!existsSync(skillDir)) {
    return false;
  }

  try {
    rmSync(skillDir, { recursive: true });
    return true;
  } catch {
    return false;
  }
}

// ============================================================
// Utility Functions
// ============================================================

/**
 * Check if a skill exists in a workspace
 * @param workspaceRoot - Absolute path to workspace root
 * @param slug - Skill directory name
 */
export function skillExists(workspaceRoot: string, slug: string): boolean {
  const skillsDir = getWorkspaceSkillsPath(workspaceRoot);
  const skillDir = join(skillsDir, slug);
  const skillFile = join(skillDir, 'SKILL.md');

  return existsSync(skillDir) && existsSync(skillFile);
}

/**
 * List skill slugs in a workspace
 * @param workspaceRoot - Absolute path to workspace root
 */
export function listSkillSlugs(workspaceRoot: string): string[] {
  const skillsDir = getWorkspaceSkillsPath(workspaceRoot);

  if (!existsSync(skillsDir)) {
    return [];
  }

  try {
    return readdirSync(skillsDir, { withFileTypes: true })
      .filter((entry) => {
        if (!entry.isDirectory() && !entry.isSymbolicLink()) return false;
        if (entry.isSymbolicLink()) {
          try {
            if (!statSync(join(skillsDir, entry.name)).isDirectory()) return false;
          } catch {
            return false; // Broken symlink
          }
        }
        const skillFile = join(skillsDir, entry.name, 'SKILL.md');
        return existsSync(skillFile);
      })
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

// ============================================================
// Icon Download (uses shared utilities)
// ============================================================

/**
 * Download an icon from a URL and save it to the skill directory.
 * Returns the path to the downloaded icon, or null on failure.
 */
export async function downloadSkillIcon(
  skillDir: string,
  iconUrl: string
): Promise<string | null> {
  return downloadIcon(skillDir, iconUrl, 'Skills');
}

/**
 * Check if a skill needs its icon downloaded.
 * Returns true if metadata has a URL icon and no local icon file exists.
 */
export function skillNeedsIconDownload(skill: LoadedSkill): boolean {
  return needsIconDownload(skill.metadata.icon, skill.iconPath);
}

// Re-export icon utilities for convenience
export { isIconUrl } from '../utils/icon.ts';
