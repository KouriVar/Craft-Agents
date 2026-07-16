/**
 * Tests for Skills Storage
 *
 * Verifies the four-tier skill loading system:
 * 1. Built-in app skills: resources/skills/ (lowest priority)
 * 2. Global skills: ~/.agents/skills/
 * 3. Workspace skills: {workspaceRoot}/skills/
 * 4. Project skills: .agents/skills/ from working directory to Git root (highest priority)
 *
 * Uses real temp directories to test actual filesystem operations.
 *
 * Note: The global skills directory (~/.agents/skills/) is a module-level constant
 * that cannot be mocked reliably when tests run in parallel with other test files.
 * The loadAllSkills tests account for any pre-existing global skills by capturing a
 * baseline count and validating relative to it.
 */
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { homedir, tmpdir } from 'os';
import { join } from 'path';
import {
  loadAllSkills,
  loadBundledSkills,
  loadSkillBySlug,
  loadWorkspaceSkills,
  loadSkill,
  skillExists,
  listSkillSlugs,
  deleteSkill,
  invalidateSkillsCache,
} from '../storage.ts';
import { registerPluginPackage, setPluginEnabled } from '../../plugins/config.ts';
import { loadPluginPackage } from '../../plugins/storage.ts';

// ============================================================
// Temp Directory Setup
// ============================================================

let tempDir: string;
let workspaceRoot: string;
let projectRoot: string;

// The real global skills directory — we cannot mock this reliably.
const REAL_GLOBAL_SKILLS_DIR = join(homedir(), '.agents', 'skills');

// ============================================================
// Helpers
// ============================================================

/** Create a valid SKILL.md file in a skill directory */
function createSkill(
  skillsDir: string,
  slug: string,
  opts: { name?: string; description?: string; globs?: string[]; content?: string; icon?: string; requiredSources?: string[] } = {}
): string {
  const skillDir = join(skillsDir, slug);
  mkdirSync(skillDir, { recursive: true });

  const name = opts.name ?? slug.charAt(0).toUpperCase() + slug.slice(1);
  const description = opts.description ?? `A ${slug} skill`;
  const content = opts.content ?? `Instructions for ${slug}`;
  const globs = opts.globs ? `\nglobs:\n${opts.globs.map(g => `  - "${g}"`).join('\n')}` : '';
  const icon = opts.icon ? `\nicon: "${opts.icon}"` : '';
  const requiredSources = opts.requiredSources
    ? `\nrequiredSources:\n${opts.requiredSources.map(source => `  - "${source}"`).join('\n')}`
    : '';

  const skillMd = `---
name: "${name}"
description: "${description}"${globs}${icon}${requiredSources}
---

${content}
`;
  writeFileSync(join(skillDir, 'SKILL.md'), skillMd);
  return skillDir;
}

/** Create an invalid SKILL.md (missing required fields) */
function createInvalidSkill(skillsDir: string, slug: string): string {
  const skillDir = join(skillsDir, slug);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, 'SKILL.md'), '---\ntitle: "No name or description"\n---\nContent');
  return skillDir;
}

/** Create a directory without SKILL.md */
function createEmptySkillDir(skillsDir: string, slug: string): string {
  const skillDir = join(skillsDir, slug);
  mkdirSync(skillDir, { recursive: true });
  return skillDir;
}

/** Get the baseline slugs from built-in and real global skills. */
function getExistingGlobalSlugs(): Set<string> {
  const emptyWs = mkdtempSync(join(tmpdir(), 'skills-baseline-'));
  mkdirSync(join(emptyWs, 'skills'), { recursive: true });
  try {
    const skills = loadAllSkills(emptyWs);
    // Workspace and project tiers are empty, leaving built-in/global skills.
    return new Set(skills.map(s => s.slug));
  } finally {
    rmSync(emptyWs, { recursive: true, force: true });
  }
}

// ============================================================
// Test Setup
// ============================================================

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'skills-test-'));
  workspaceRoot = join(tempDir, 'workspace');
  projectRoot = join(tempDir, 'project');

  // Create base directories
  mkdirSync(join(workspaceRoot, 'skills'), { recursive: true });
  mkdirSync(projectRoot, { recursive: true });
});

afterEach(() => {
  if (tempDir && existsSync(tempDir)) {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

// ============================================================
// Tests: loadSkill (single workspace skill)
// ============================================================

describe('loadSkill', () => {
  it('should load a valid skill from workspace', () => {
    const skillsDir = join(workspaceRoot, 'skills');
    createSkill(skillsDir, 'commit', {
      name: 'Git Commit',
      description: 'Helps with git commits',
      content: 'Run git commit with a good message',
    });

    const skill = loadSkill(workspaceRoot, 'commit');

    expect(skill).not.toBeNull();
    expect(skill!.slug).toBe('commit');
    expect(skill!.metadata.name).toBe('Git Commit');
    expect(skill!.metadata.description).toBe('Helps with git commits');
    expect(skill!.content).toContain('Run git commit with a good message');
    expect(skill!.source).toBe('workspace');
    expect(skill!.path).toBe(join(skillsDir, 'commit'));
  });

  it('should return null for non-existent skill slug', () => {
    const skill = loadSkill(workspaceRoot, 'nonexistent');
    expect(skill).toBeNull();
  });

  it('should return null for directory without SKILL.md', () => {
    createEmptySkillDir(join(workspaceRoot, 'skills'), 'empty-skill');

    const skill = loadSkill(workspaceRoot, 'empty-skill');
    expect(skill).toBeNull();
  });

  it('should return null for invalid SKILL.md (missing required fields)', () => {
    createInvalidSkill(join(workspaceRoot, 'skills'), 'bad-skill');

    const skill = loadSkill(workspaceRoot, 'bad-skill');
    expect(skill).toBeNull();
  });

  it('should load skill with optional globs', () => {
    createSkill(join(workspaceRoot, 'skills'), 'frontend', {
      globs: ['*.tsx', '*.css'],
    });

    const skill = loadSkill(workspaceRoot, 'frontend');

    expect(skill).not.toBeNull();
    expect(skill!.metadata.globs).toEqual(['*.tsx', '*.css']);
  });

  it('should normalize scalar and mixed string-list metadata fields', () => {
    const skillDir = join(workspaceRoot, 'skills', 'string-lists');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, 'SKILL.md'), `---
name: "String Lists"
description: "Skill with portable scalar and mixed list metadata"
globs: "*.ts"
alwaysAllow:
  - Bash
  - " Bash "
  - 42
  - ""
requiredSources: linear
---

Use portable metadata.
`);

    const skill = loadSkill(workspaceRoot, 'string-lists');

    expect(skill).not.toBeNull();
    expect(skill!.metadata.globs).toEqual(['*.ts']);
    expect(skill!.metadata.alwaysAllow).toEqual(['Bash']);
    expect(skill!.metadata.requiredSources).toEqual(['linear']);
  });

  it('should load portable agents/openai.yaml metadata without overriding SKILL.md basics', () => {
    const skillDir = join(workspaceRoot, 'skills', 'portable-openai');
    mkdirSync(join(skillDir, 'agents'), { recursive: true });
    writeFileSync(join(skillDir, 'SKILL.md'), `---
name: "Craft Name"
description: "Craft description"
requiredSources:
  - linear
---

Use portable metadata.
`);
    writeFileSync(join(skillDir, 'agents', 'openai.yaml'), `interface:
  display_name: "OpenAI Display"
  short_description: "OpenAI short description"
  default_prompt: "Use this skill when a portable host suggests it."
policy:
  allow_implicit_invocation: false
dependencies:
  tools:
    - Bash
    - " Bash "
  sources:
    - github
`);

    const skill = loadSkill(workspaceRoot, 'portable-openai');

    expect(skill).not.toBeNull();
    expect(skill!.metadata.name).toBe('Craft Name');
    expect(skill!.metadata.description).toBe('Craft description');
    expect(skill!.metadata.displayName).toBe('OpenAI Display');
    expect(skill!.metadata.shortDescription).toBe('OpenAI short description');
    expect(skill!.metadata.defaultPrompt).toBe('Use this skill when a portable host suggests it.');
    expect(skill!.metadata.implicitInvocation).toBe(false);
    expect(skill!.metadata.requiredTools).toEqual(['Bash']);
    expect(skill!.metadata.requiredSources).toEqual(['linear', 'github']);
  });

  it('should use portable agents/openai.yaml display metadata as a fallback', () => {
    const skillDir = join(workspaceRoot, 'skills', 'portable-fallback');
    mkdirSync(join(skillDir, 'agents'), { recursive: true });
    writeFileSync(join(skillDir, 'SKILL.md'), `---
---

Use openai metadata fallback.
`);
    writeFileSync(join(skillDir, 'agents', 'openai.yaml'), `interface:
  display_name: "Portable Fallback"
  short_description: "Description from portable metadata"
`);

    const skill = loadSkill(workspaceRoot, 'portable-fallback');

    expect(skill).not.toBeNull();
    expect(skill!.metadata.name).toBe('Portable Fallback');
    expect(skill!.metadata.description).toBe('Description from portable metadata');
  });

  it('should load skill with normalized requiredSources', () => {
    createSkill(join(workspaceRoot, 'skills'), 'with-sources', {
      requiredSources: ['linear', ' github ', 'linear'],
    });

    const skill = loadSkill(workspaceRoot, 'with-sources');

    expect(skill).not.toBeNull();
    expect(skill!.metadata.requiredSources).toEqual(['linear', 'github']);
  });

  it('should normalize single-string requiredSources into an array', () => {
    const skillDir = join(workspaceRoot, 'skills', 'single-source');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, 'SKILL.md'), `---
name: "Single Source"
description: "Skill with scalar requiredSources"
requiredSources: linear
---

Use linear tools.
`);

    const skill = loadSkill(workspaceRoot, 'single-source');

    expect(skill).not.toBeNull();
    expect(skill!.metadata.requiredSources).toEqual(['linear']);
  });

  it('should ignore invalid requiredSources entries', () => {
    const skillDir = join(workspaceRoot, 'skills', 'invalid-sources');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, 'SKILL.md'), `---
name: "Invalid Sources"
description: "Skill with mixed requiredSources values"
requiredSources:
  - linear
  - 123
  - true
  - "  "
---

Use linear tools.
`);

    const skill = loadSkill(workspaceRoot, 'invalid-sources');

    expect(skill).not.toBeNull();
    expect(skill!.metadata.requiredSources).toEqual(['linear']);
  });

  it('should set iconPath when icon file exists', () => {
    const skillDir = createSkill(join(workspaceRoot, 'skills'), 'with-icon');
    writeFileSync(join(skillDir, 'icon.svg'), '<svg></svg>');

    const skill = loadSkill(workspaceRoot, 'with-icon');

    expect(skill).not.toBeNull();
    expect(skill!.iconPath).toBe(join(skillDir, 'icon.svg'));
  });

  it('should not set iconPath when no icon file exists', () => {
    createSkill(join(workspaceRoot, 'skills'), 'no-icon');

    const skill = loadSkill(workspaceRoot, 'no-icon');

    expect(skill).not.toBeNull();
    expect(skill!.iconPath).toBeUndefined();
  });
});

// ============================================================
// Tests: loadWorkspaceSkills (all skills from workspace)
// ============================================================

describe('loadWorkspaceSkills', () => {
  it('should load multiple skills from workspace', () => {
    const skillsDir = join(workspaceRoot, 'skills');
    createSkill(skillsDir, 'commit');
    createSkill(skillsDir, 'review');
    createSkill(skillsDir, 'deploy');

    const skills = loadWorkspaceSkills(workspaceRoot);

    expect(skills).toHaveLength(3);
    const slugs = skills.map(s => s.slug).sort();
    expect(slugs).toEqual(['commit', 'deploy', 'review']);
    // All should be workspace source
    for (const skill of skills) {
      expect(skill.source).toBe('workspace');
    }
  });

  it('should return empty array for empty skills directory', () => {
    // workspaceRoot/skills/ exists but has no subdirectories
    const skills = loadWorkspaceSkills(workspaceRoot);
    expect(skills).toEqual([]);
  });

  it('should return empty array for non-existent workspace root', () => {
    const skills = loadWorkspaceSkills(join(tempDir, 'nonexistent'));
    expect(skills).toEqual([]);
  });

  it('should skip directories without SKILL.md', () => {
    const skillsDir = join(workspaceRoot, 'skills');
    createSkill(skillsDir, 'valid-skill');
    createEmptySkillDir(skillsDir, 'no-skill-md');

    const skills = loadWorkspaceSkills(workspaceRoot);

    expect(skills).toHaveLength(1);
    expect(skills[0]!.slug).toBe('valid-skill');
  });

  it('should skip invalid SKILL.md files', () => {
    const skillsDir = join(workspaceRoot, 'skills');
    createSkill(skillsDir, 'valid');
    createInvalidSkill(skillsDir, 'invalid');

    const skills = loadWorkspaceSkills(workspaceRoot);

    expect(skills).toHaveLength(1);
    expect(skills[0]!.slug).toBe('valid');
  });

  it('should skip non-directory entries', () => {
    const skillsDir = join(workspaceRoot, 'skills');
    createSkill(skillsDir, 'real-skill');
    // Create a plain file in the skills directory (not a subdirectory)
    writeFileSync(join(skillsDir, 'readme.txt'), 'This is not a skill');

    const skills = loadWorkspaceSkills(workspaceRoot);

    expect(skills).toHaveLength(1);
    expect(skills[0]!.slug).toBe('real-skill');
  });
});

// ============================================================
// Tests: loadAllSkills (four-tier loading)
//
// These tests account for pre-existing global skills at ~/.agents/skills/.
// We capture a baseline and verify our test skills appear with correct sources.
// ============================================================

describe('loadBundledSkills', () => {
  it('loads the bundled visualize skill as a read-only built-in', () => {
    const visualize = loadBundledSkills().find((skill) => skill.slug === 'visualize');
    expect(visualize).toBeDefined();
    expect(visualize!.source).toBe('builtin');
    expect(visualize!.path).toContain('resources/skills/visualize');
  });

  it('allows a user-global visualize skill to override the bundled version', () => {
    const skill = loadSkillBySlug(workspaceRoot, 'visualize');
    const hasGlobalOverride = existsSync(join(REAL_GLOBAL_SKILLS_DIR, 'visualize', 'SKILL.md'));
    expect(skill).not.toBeNull();
    expect(skill!.source).toBe(hasGlobalOverride ? 'global' : 'builtin');
  });

  it('allows a workspace skill to override the bundled version', () => {
    createSkill(join(workspaceRoot, 'skills'), 'visualize', {
      name: 'Workspace Visualize',
      description: 'Workspace override',
    });
    const skill = loadSkillBySlug(workspaceRoot, 'visualize');
    expect(skill).not.toBeNull();
    expect(skill!.source).toBe('workspace');
    expect(skill!.metadata.name).toBe('Workspace Visualize');
  });
});

describe('loadAllSkills', () => {
  const getWorkspaceSkillsDir = () => join(workspaceRoot, 'skills');
  const getProjectSkillsDir = () => join(projectRoot, '.agents', 'skills');

  // Use unique slugs that won't collide with real global skills
  const TEST_PREFIX = '_test_storage_';

  it('should load workspace and project skills alongside any existing global skills', () => {
    const baselineGlobal = getExistingGlobalSlugs();
    const wsDir = getWorkspaceSkillsDir();
    const projDir = getProjectSkillsDir();
    mkdirSync(projDir, { recursive: true });

    createSkill(wsDir, `${TEST_PREFIX}ws`, { name: 'Workspace Skill', description: 'From workspace' });
    createSkill(projDir, `${TEST_PREFIX}proj`, { name: 'Project Skill', description: 'From project' });

    const skills = loadAllSkills(workspaceRoot, projectRoot);

    // Should have baseline global skills + our 2 test skills
    expect(skills.length).toBe(baselineGlobal.size + 2);

    const wsSkill = skills.find(s => s.slug === `${TEST_PREFIX}ws`);
    const projSkill = skills.find(s => s.slug === `${TEST_PREFIX}proj`);

    expect(wsSkill).toBeDefined();
    expect(wsSkill!.source).toBe('workspace');

    expect(projSkill).toBeDefined();
    expect(projSkill!.source).toBe('project');

    // Baseline app/global skills remain present unless overridden.
    for (const globalSlug of baselineGlobal) {
      const skill = skills.find(s => s.slug === globalSlug);
      expect(skill).toBeDefined();
      expect(['builtin', 'global']).toContain(skill!.source);
    }
  });

  it('should override global skills with workspace skills when slug matches', () => {
    const baselineGlobal = getExistingGlobalSlugs();

    // Only test override if there are actually global skills to override
    if (baselineGlobal.size === 0) {
      // No global skills — just verify workspace skills load
      const wsDir = getWorkspaceSkillsDir();
      createSkill(wsDir, `${TEST_PREFIX}ws_only`, { name: 'WS Only', description: 'WS only skill' });
      const skills = loadAllSkills(workspaceRoot);
      expect(skills.find(s => s.slug === `${TEST_PREFIX}ws_only`)).toBeDefined();
      return;
    }

    // Override one of the existing global skills with a workspace skill
    const globalSlugToOverride = [...baselineGlobal][0]!;
    const wsDir = getWorkspaceSkillsDir();
    createSkill(wsDir, globalSlugToOverride, {
      name: 'Workspace Override',
      description: 'This overrides the global skill',
    });

    const skills = loadAllSkills(workspaceRoot);

    const overridden = skills.find(s => s.slug === globalSlugToOverride);
    expect(overridden).toBeDefined();
    expect(overridden!.source).toBe('workspace');
    expect(overridden!.metadata.name).toBe('Workspace Override');

    // Total count should be same as baseline (overridden, not added)
    expect(skills.length).toBe(baselineGlobal.size);
  });

  it('should override workspace skills with project skills (same slug)', () => {
    const baselineGlobal = getExistingGlobalSlugs();
    const wsDir = getWorkspaceSkillsDir();
    const projDir = getProjectSkillsDir();
    mkdirSync(projDir, { recursive: true });

    createSkill(wsDir, `${TEST_PREFIX}deploy`, { name: 'Workspace Deploy', description: 'Workspace version' });
    createSkill(projDir, `${TEST_PREFIX}deploy`, { name: 'Project Deploy', description: 'Project version' });

    const skills = loadAllSkills(workspaceRoot, projectRoot);

    // Only 1 skill for this slug (project overrides workspace), plus baseline globals
    expect(skills.length).toBe(baselineGlobal.size + 1);
    const deploy = skills.find(s => s.slug === `${TEST_PREFIX}deploy`);
    expect(deploy).toBeDefined();
    expect(deploy!.source).toBe('project');
    expect(deploy!.metadata.name).toBe('Project Deploy');
    expect(deploy!.metadata.description).toBe('Project version');
  });

  it('should discover project skills from the working directory up to the repo root', () => {
    const baselineGlobal = getExistingGlobalSlugs();
    const repoRoot = join(tempDir, 'repo');
    const nestedRoot = join(repoRoot, 'packages', 'web');
    const repoSkillsDir = join(repoRoot, '.agents', 'skills');
    mkdirSync(join(repoRoot, '.git'), { recursive: true });
    mkdirSync(nestedRoot, { recursive: true });
    mkdirSync(repoSkillsDir, { recursive: true });

    createSkill(repoSkillsDir, `${TEST_PREFIX}repo`, {
      name: 'Repo Skill',
      description: 'From repo root',
    });

    const skills = loadAllSkills(workspaceRoot, nestedRoot);
    const repoSkill = skills.find(s => s.slug === `${TEST_PREFIX}repo`);

    expect(skills.length).toBe(baselineGlobal.size + 1);
    expect(repoSkill).toBeDefined();
    expect(repoSkill!.source).toBe('project');
    expect(repoSkill!.path).toBe(join(repoSkillsDir, `${TEST_PREFIX}repo`));
  });

  it('should prefer the nearest project skill when ancestor directories share a slug', () => {
    const baselineGlobal = getExistingGlobalSlugs();
    const repoRoot = join(tempDir, 'repo-override');
    const nestedRoot = join(repoRoot, 'apps', 'desktop');
    const repoSkillsDir = join(repoRoot, '.agents', 'skills');
    const nestedSkillsDir = join(nestedRoot, '.agents', 'skills');
    mkdirSync(join(repoRoot, '.git'), { recursive: true });
    mkdirSync(nestedSkillsDir, { recursive: true });
    mkdirSync(repoSkillsDir, { recursive: true });

    createSkill(repoSkillsDir, `${TEST_PREFIX}nearest`, {
      name: 'Repo Version',
      description: 'From repo root',
    });
    createSkill(nestedSkillsDir, `${TEST_PREFIX}nearest`, {
      name: 'Nested Version',
      description: 'From nested working directory',
    });

    const skills = loadAllSkills(workspaceRoot, nestedRoot);
    const selected = skills.find(s => s.slug === `${TEST_PREFIX}nearest`);
    const direct = loadSkillBySlug(workspaceRoot, `${TEST_PREFIX}nearest`, nestedRoot);

    expect(skills.length).toBe(baselineGlobal.size + 1);
    expect(selected).toBeDefined();
    expect(selected!.metadata.name).toBe('Nested Version');
    expect(selected!.path).toBe(join(nestedSkillsDir, `${TEST_PREFIX}nearest`));
    expect(direct).not.toBeNull();
    expect(direct!.metadata.name).toBe('Nested Version');
  });

  it('should discover skills from project plugin packages', () => {
    const baselineGlobal = getExistingGlobalSlugs();
    const repoRoot = join(tempDir, 'plugin-repo');
    const nestedRoot = join(repoRoot, 'packages', 'app');
    const pluginSkillsDir = join(repoRoot, 'skills');
    const extraSkillsDir = join(repoRoot, 'extra-skills');
    mkdirSync(join(repoRoot, '.git'), { recursive: true });
    mkdirSync(join(repoRoot, '.codex-plugin'), { recursive: true });
    mkdirSync(nestedRoot, { recursive: true });
    mkdirSync(pluginSkillsDir, { recursive: true });
    mkdirSync(extraSkillsDir, { recursive: true });
    writeFileSync(join(repoRoot, '.codex-plugin', 'plugin.json'), JSON.stringify({
      name: 'plugin-repo',
      skills: ['extra-skills'],
    }));

    createSkill(pluginSkillsDir, `${TEST_PREFIX}plugin_default`, { name: 'Plugin Default' });
    createSkill(extraSkillsDir, `${TEST_PREFIX}plugin_extra`, { name: 'Plugin Extra' });

    const skills = loadAllSkills(workspaceRoot, nestedRoot);
    const defaultSkill = skills.find(s => s.slug === `${TEST_PREFIX}plugin_default`);
    const extraSkill = skills.find(s => s.slug === `${TEST_PREFIX}plugin_extra`);

    expect(skills.length).toBe(baselineGlobal.size + 2);
    expect(defaultSkill).toBeDefined();
    expect(defaultSkill!.source).toBe('project');
    expect(defaultSkill!.path).toBe(join(pluginSkillsDir, `${TEST_PREFIX}plugin_default`));
    expect(extraSkill).toBeDefined();
    expect(extraSkill!.source).toBe('project');
    expect(extraSkill!.path).toBe(join(extraSkillsDir, `${TEST_PREFIX}plugin_extra`));
  });

  it('should discover enabled managed plugin skills and preserve the plugin name', () => {
    const baselineGlobal = getExistingGlobalSlugs();
    const pluginRoot = join(workspaceRoot, 'plugins', 'installed', 'managed-plugin');
    const pluginSkillsDir = join(pluginRoot, 'skills');
    mkdirSync(join(pluginRoot, '.codex-plugin'), { recursive: true });
    writeFileSync(join(pluginRoot, '.codex-plugin', 'plugin.json'), JSON.stringify({ name: 'managed-plugin' }));
    createSkill(pluginSkillsDir, `${TEST_PREFIX}managed`, { name: 'Managed Plugin Skill' });

    const pluginPackage = loadPluginPackage(pluginRoot);
    expect(pluginPackage).not.toBeNull();
    registerPluginPackage(workspaceRoot, pluginPackage!, { enabled: true, source: 'git' });
    invalidateSkillsCache();

    const skills = loadAllSkills(workspaceRoot);
    const selected = skills.find(s => s.slug === `${TEST_PREFIX}managed`);
    const direct = loadSkillBySlug(workspaceRoot, `${TEST_PREFIX}managed`);

    expect(skills.length).toBe(baselineGlobal.size + 1);
    expect(selected?.source).toBe('plugin');
    expect(selected?.pluginName).toBe('managed-plugin');
    expect(direct?.pluginName).toBe('managed-plugin');

    setPluginEnabled(workspaceRoot, 'managed-plugin', false);
    invalidateSkillsCache();
    expect(loadSkillBySlug(workspaceRoot, `${TEST_PREFIX}managed`)).toBeNull();
    expect(loadAllSkills(workspaceRoot).find(s => s.slug === `${TEST_PREFIX}managed`)).toBeUndefined();
  });

  it('should prefer .agents project skills over package-local plugin skills with the same slug', () => {
    const baselineGlobal = getExistingGlobalSlugs();
    const repoRoot = join(tempDir, 'plugin-override-repo');
    const pluginSkillsDir = join(repoRoot, 'skills');
    const projectSkillsDir = join(repoRoot, '.agents', 'skills');
    mkdirSync(join(repoRoot, '.git'), { recursive: true });
    mkdirSync(join(repoRoot, '.codex-plugin'), { recursive: true });
    mkdirSync(pluginSkillsDir, { recursive: true });
    mkdirSync(projectSkillsDir, { recursive: true });
    writeFileSync(join(repoRoot, '.codex-plugin', 'plugin.json'), JSON.stringify({ name: 'plugin-override' }));

    createSkill(pluginSkillsDir, `${TEST_PREFIX}plugin_override`, { name: 'Plugin Version' });
    createSkill(projectSkillsDir, `${TEST_PREFIX}plugin_override`, { name: 'Agents Version' });

    const skills = loadAllSkills(workspaceRoot, repoRoot);
    const selected = skills.find(s => s.slug === `${TEST_PREFIX}plugin_override`);
    const direct = loadSkillBySlug(workspaceRoot, `${TEST_PREFIX}plugin_override`, repoRoot);

    expect(skills.length).toBe(baselineGlobal.size + 1);
    expect(selected).toBeDefined();
    expect(selected!.metadata.name).toBe('Agents Version');
    expect(direct).not.toBeNull();
    expect(direct!.metadata.name).toBe('Agents Version');
  });

  it('should skip package-local plugin skills when the plugin is disabled', () => {
    const baselineGlobal = getExistingGlobalSlugs();
    const repoRoot = join(tempDir, 'disabled-plugin-repo');
    const pluginSkillsDir = join(repoRoot, 'skills');
    mkdirSync(join(repoRoot, '.git'), { recursive: true });
    mkdirSync(join(repoRoot, '.codex-plugin'), { recursive: true });
    mkdirSync(pluginSkillsDir, { recursive: true });
    writeFileSync(join(repoRoot, '.codex-plugin', 'plugin.json'), JSON.stringify({ name: 'disabled-plugin' }));
    createSkill(pluginSkillsDir, `${TEST_PREFIX}disabled_plugin_skill`, { name: 'Disabled Plugin Skill' });

    setPluginEnabled(workspaceRoot, 'disabled-plugin', false);

    const skills = loadAllSkills(workspaceRoot, repoRoot);
    const direct = loadSkillBySlug(workspaceRoot, `${TEST_PREFIX}disabled_plugin_skill`, repoRoot);

    expect(skills.length).toBe(baselineGlobal.size);
    expect(skills.find(s => s.slug === `${TEST_PREFIX}disabled_plugin_skill`)).toBeUndefined();
    expect(direct).toBeNull();
  });

  it('should handle full user-tier override: project > workspace > global/builtin', () => {
    const baselineGlobal = getExistingGlobalSlugs();
    const wsDir = getWorkspaceSkillsDir();
    const projDir = getProjectSkillsDir();
    mkdirSync(projDir, { recursive: true });

    // Same slug at workspace and project tiers
    createSkill(wsDir, `${TEST_PREFIX}shared`, { name: 'Workspace', description: 'Workspace version' });
    createSkill(projDir, `${TEST_PREFIX}shared`, { name: 'Project', description: 'Project version' });

    // Unique skills at each controllable tier
    createSkill(wsDir, `${TEST_PREFIX}only_ws`, { description: 'Only in workspace' });
    createSkill(projDir, `${TEST_PREFIX}only_proj`, { description: 'Only in project' });

    const skills = loadAllSkills(workspaceRoot, projectRoot);

    // Shared skill should be project version (highest priority)
    const shared = skills.find(s => s.slug === `${TEST_PREFIX}shared`);
    expect(shared).toBeDefined();
    expect(shared!.source).toBe('project');
    expect(shared!.metadata.name).toBe('Project');

    // Unique skills should keep their sources
    expect(skills.find(s => s.slug === `${TEST_PREFIX}only_ws`)!.source).toBe('workspace');
    expect(skills.find(s => s.slug === `${TEST_PREFIX}only_proj`)!.source).toBe('project');

    // Total: baseline globals + shared (1, deduplicated) + only_ws + only_proj = baseline + 3
    expect(skills.length).toBe(baselineGlobal.size + 3);
  });

  it('should handle missing project directory gracefully', () => {
    const baselineGlobal = getExistingGlobalSlugs();
    const wsDir = getWorkspaceSkillsDir();
    createSkill(wsDir, `${TEST_PREFIX}ws_skill`);

    // Pass a non-existent project root
    const skills = loadAllSkills(workspaceRoot, join(tempDir, 'nonexistent-project'));

    expect(skills.length).toBe(baselineGlobal.size + 1);
    const wsSkill = skills.find(s => s.slug === `${TEST_PREFIX}ws_skill`);
    expect(wsSkill).toBeDefined();
    expect(wsSkill!.source).toBe('workspace');
  });

  it('should skip project tier when projectRoot is undefined', () => {
    const baselineGlobal = getExistingGlobalSlugs();
    const projDir = getProjectSkillsDir();
    mkdirSync(projDir, { recursive: true });
    createSkill(projDir, `${TEST_PREFIX}project_only`);

    const wsDir = getWorkspaceSkillsDir();
    createSkill(wsDir, `${TEST_PREFIX}ws_skill`);

    // No projectRoot passed — project tier should be skipped
    const skills = loadAllSkills(workspaceRoot);

    // Should NOT contain the project-only skill
    expect(skills.find(s => s.slug === `${TEST_PREFIX}project_only`)).toBeUndefined();
    // Should contain the workspace skill
    expect(skills.find(s => s.slug === `${TEST_PREFIX}ws_skill`)).toBeDefined();
    expect(skills.length).toBe(baselineGlobal.size + 1);
  });

  it('should return only built-in and global skills when workspace and project are empty', () => {
    const baselineGlobal = getExistingGlobalSlugs();

    const skills = loadAllSkills(workspaceRoot);

    // With empty workspace and no project, only app/global skills remain.
    expect(skills.length).toBe(baselineGlobal.size);
    for (const skill of skills) {
      expect(['builtin', 'global']).toContain(skill.source);
    }
  });

  it('should correctly assign source for workspace and project tiers', () => {
    const baselineGlobal = getExistingGlobalSlugs();
    const wsDir = getWorkspaceSkillsDir();
    const projDir = getProjectSkillsDir();
    mkdirSync(projDir, { recursive: true });

    createSkill(wsDir, `${TEST_PREFIX}w1`);
    createSkill(wsDir, `${TEST_PREFIX}w2`);
    createSkill(projDir, `${TEST_PREFIX}p1`);

    const skills = loadAllSkills(workspaceRoot, projectRoot);

    const testSkills = skills.filter(s => s.slug.startsWith(TEST_PREFIX));
    expect(testSkills.filter(s => s.source === 'workspace')).toHaveLength(2);
    expect(testSkills.filter(s => s.source === 'project')).toHaveLength(1);

    // Baseline skills come from either the app bundle or the user-global tier.
    const globalSkills = skills.filter(s => !s.slug.startsWith(TEST_PREFIX));
    for (const skill of globalSkills) {
      expect(['builtin', 'global']).toContain(skill.source);
    }
  });

  it('should deduplicate by slug across workspace and project tiers', () => {
    const baselineGlobal = getExistingGlobalSlugs();
    const wsDir = getWorkspaceSkillsDir();
    const projDir = getProjectSkillsDir();
    mkdirSync(projDir, { recursive: true });

    // Same slug in workspace and project — only project should remain
    createSkill(wsDir, `${TEST_PREFIX}dup`, { name: 'WS Dup', description: 'From workspace' });
    createSkill(projDir, `${TEST_PREFIX}dup`, { name: 'Proj Dup', description: 'From project' });
    // Unique skills
    createSkill(wsDir, `${TEST_PREFIX}unique_ws`);
    createSkill(projDir, `${TEST_PREFIX}unique_proj`);

    const skills = loadAllSkills(workspaceRoot, projectRoot);

    // 3 test skills (dup deduplicated to 1 + 2 uniques) + baseline
    const testSkills = skills.filter(s => s.slug.startsWith(TEST_PREFIX));
    expect(testSkills).toHaveLength(3);

    const dup = skills.find(s => s.slug === `${TEST_PREFIX}dup`);
    expect(dup!.source).toBe('project');
    expect(dup!.metadata.name).toBe('Proj Dup');
  });
});

// ============================================================
// Tests: skillExists
// ============================================================

describe('skillExists', () => {
  it('should return true for existing skill with SKILL.md', () => {
    createSkill(join(workspaceRoot, 'skills'), 'exists-skill');
    expect(skillExists(workspaceRoot, 'exists-skill')).toBe(true);
  });

  it('should return false for non-existent skill', () => {
    expect(skillExists(workspaceRoot, 'ghost-skill')).toBe(false);
  });

  it('should return false for directory without SKILL.md', () => {
    createEmptySkillDir(join(workspaceRoot, 'skills'), 'empty');
    expect(skillExists(workspaceRoot, 'empty')).toBe(false);
  });
});

// ============================================================
// Tests: listSkillSlugs
// ============================================================

describe('listSkillSlugs', () => {
  it('should list all valid skill slugs', () => {
    const skillsDir = join(workspaceRoot, 'skills');
    createSkill(skillsDir, 'alpha');
    createSkill(skillsDir, 'beta');
    createEmptySkillDir(skillsDir, 'no-skill-md');

    const slugs = listSkillSlugs(workspaceRoot);
    expect(slugs.sort()).toEqual(['alpha', 'beta']);
  });

  it('should return empty array for empty skills directory', () => {
    const slugs = listSkillSlugs(workspaceRoot);
    expect(slugs).toEqual([]);
  });

  it('should return empty array for non-existent workspace', () => {
    const slugs = listSkillSlugs(join(tempDir, 'nonexistent'));
    expect(slugs).toEqual([]);
  });
});

// ============================================================
// Tests: deleteSkill
// ============================================================

describe('deleteSkill', () => {
  it('should delete an existing skill', () => {
    const skillsDir = join(workspaceRoot, 'skills');
    createSkill(skillsDir, 'to-delete');
    expect(skillExists(workspaceRoot, 'to-delete')).toBe(true);

    const result = deleteSkill(workspaceRoot, 'to-delete');

    expect(result).toBe(true);
    expect(skillExists(workspaceRoot, 'to-delete')).toBe(false);
  });

  it('should return false for non-existent skill', () => {
    const result = deleteSkill(workspaceRoot, 'nonexistent');
    expect(result).toBe(false);
  });
});
