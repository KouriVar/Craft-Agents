import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  isPluginEnabled,
  listPluginEntries,
  loadPluginConfig,
  removeManagedPlugin,
  registerPluginPackage,
  savePluginConfig,
  setPluginEnabled,
  unregisterPlugin,
} from '../config.ts';
import { loadPluginPackage } from '../storage.ts';

let tempDir: string;
let workspaceRoot: string;
let pluginRoot: string;

beforeEach(() => {
  tempDir = join(tmpdir(), `plugin-config-test-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  workspaceRoot = join(tempDir, 'workspace');
  pluginRoot = join(tempDir, 'plugins', 'canvasight');
  mkdirSync(workspaceRoot, { recursive: true });
  mkdirSync(join(pluginRoot, '.codex-plugin'), { recursive: true });
  writeFileSync(join(pluginRoot, '.codex-plugin', 'plugin.json'), JSON.stringify({
    name: 'canvasight',
    displayName: 'Canvasight',
    version: '0.4.20',
    description: 'Graph canvas plugin',
    defaultEnabled: false,
  }));
});

afterEach(() => {
  if (tempDir && existsSync(tempDir)) {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

describe('plugin config storage', () => {
  it('returns a default empty config when no config exists', () => {
    expect(loadPluginConfig(workspaceRoot)).toEqual({ version: 1, plugins: {} });
    expect(listPluginEntries(workspaceRoot)).toEqual([]);
  });

  it('registers a local plugin package in workspace plugin config', () => {
    const pluginPackage = loadPluginPackage(pluginRoot);
    expect(pluginPackage).not.toBeNull();

    const entry = registerPluginPackage(workspaceRoot, pluginPackage!);

    expect(entry.name).toBe('canvasight');
    expect(entry.enabled).toBe(false);
    expect(entry.installPath).toBe(resolve(pluginRoot));
    expect(entry.manifestPath).toBe(resolve(pluginRoot, '.codex-plugin', 'plugin.json'));
    expect(entry.manifestFormat).toBe('codex');
    expect(entry.displayName).toBe('Canvasight');
    expect(entry.description).toBe('Graph canvas plugin');
    expect(entry.source).toBe('local');
    expect(isPluginEnabled(workspaceRoot, 'canvasight')).toBe(false);
  });

  it('records git source metadata for installed plugin packages', () => {
    const pluginPackage = loadPluginPackage(pluginRoot);
    expect(pluginPackage).not.toBeNull();

    const entry = registerPluginPackage(workspaceRoot, pluginPackage!, {
      source: 'git',
      sourceUrl: 'https://github.com/Niall-Young/Canvasight.git',
      gitRef: 'v0.4.20',
    });

    expect(entry.source).toBe('git');
    expect(entry.sourceUrl).toBe('https://github.com/Niall-Young/Canvasight.git');
    expect(entry.gitRef).toBe('v0.4.20');
    expect(loadPluginConfig(workspaceRoot).plugins.canvasight?.sourceUrl).toBe('https://github.com/Niall-Young/Canvasight.git');
  });

  it('preserves explicit enabled state when a plugin package is re-registered', () => {
    const pluginPackage = loadPluginPackage(pluginRoot);
    expect(pluginPackage).not.toBeNull();

    setPluginEnabled(workspaceRoot, 'canvasight', true);
    const entry = registerPluginPackage(workspaceRoot, pluginPackage!);

    expect(entry.enabled).toBe(true);
  });

  it('can enable and disable configured plugins', () => {
    const enabled = setPluginEnabled(workspaceRoot, 'canvasight', true);
    expect(enabled.enabled).toBe(true);
    expect(isPluginEnabled(workspaceRoot, 'canvasight')).toBe(true);

    const disabled = setPluginEnabled(workspaceRoot, 'canvasight', false);
    expect(disabled.enabled).toBe(false);
    expect(isPluginEnabled(workspaceRoot, 'canvasight')).toBe(false);
  });

  it('normalizes saved config entries', () => {
    savePluginConfig(workspaceRoot, {
      version: 1,
      plugins: {
        zed: {
          name: 'zed',
          enabled: true,
          installPath: './relative-plugin',
          source: 'local',
          updatedAt: 1,
        },
      },
    });

    expect(loadPluginConfig(workspaceRoot).plugins.zed?.installPath).toBe(resolve(workspaceRoot, 'relative-plugin'));
  });

  it('falls back to defaults for invalid config JSON', () => {
    mkdirSync(join(workspaceRoot, 'plugins'), { recursive: true });
    writeFileSync(join(workspaceRoot, 'plugins', 'config.json'), '{ bad');

    expect(loadPluginConfig(workspaceRoot)).toEqual({ version: 1, plugins: {} });
  });

  it('unregisters a plugin without deleting its install path', () => {
    const pluginPackage = loadPluginPackage(pluginRoot);
    expect(pluginPackage).not.toBeNull();
    registerPluginPackage(workspaceRoot, pluginPackage!, { enabled: true });

    const removed = unregisterPlugin(workspaceRoot, 'canvasight');

    expect(removed?.name).toBe('canvasight');
    expect(loadPluginConfig(workspaceRoot).plugins.canvasight).toBeUndefined();
    expect(existsSync(pluginRoot)).toBe(true);
  });

  it('removes managed plugin directories only from plugins/installed', () => {
    const managedPluginRoot = join(workspaceRoot, 'plugins', 'installed', 'managed-plugin');
    mkdirSync(join(managedPluginRoot, '.codex-plugin'), { recursive: true });
    writeFileSync(join(managedPluginRoot, '.codex-plugin', 'plugin.json'), JSON.stringify({ name: 'managed-plugin' }));
    const pluginPackage = loadPluginPackage(managedPluginRoot);
    expect(pluginPackage).not.toBeNull();
    registerPluginPackage(workspaceRoot, pluginPackage!, { enabled: true });

    const removed = removeManagedPlugin(workspaceRoot, 'managed-plugin');

    expect(removed?.name).toBe('managed-plugin');
    expect(loadPluginConfig(workspaceRoot).plugins['managed-plugin']).toBeUndefined();
    expect(existsSync(managedPluginRoot)).toBe(false);
  });
});
