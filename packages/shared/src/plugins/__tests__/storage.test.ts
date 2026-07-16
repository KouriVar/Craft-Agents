import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import {
  findPluginManifest,
  loadPluginPackage,
} from '../storage.ts';

let tempDir: string;

beforeEach(() => {
  tempDir = join(tmpdir(), `plugin-package-test-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(tempDir, { recursive: true });
});

afterEach(() => {
  if (tempDir && existsSync(tempDir)) {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2));
}

describe('findPluginManifest', () => {
  it('loads a Codex plugin manifest', () => {
    writeJson(join(tempDir, '.codex-plugin', 'plugin.json'), {
      name: 'canvasight',
      displayName: 'Canvasight',
      version: '0.4.20',
      description: 'Canvas graph widget',
      keywords: ['canvas', ' graph ', 'canvas'],
      defaultEnabled: true,
    });

    const manifest = findPluginManifest(tempDir);

    expect(manifest).not.toBeNull();
    expect(manifest!.format).toBe('codex');
    expect(manifest!.manifest.name).toBe('canvasight');
    expect(manifest!.manifest.displayName).toBe('Canvasight');
    expect(manifest!.manifest.keywords).toEqual(['canvas', 'graph']);
  });

  it('prefers a Craft manifest when multiple manifest formats are present', () => {
    writeJson(join(tempDir, '.codex-plugin', 'plugin.json'), { name: 'codex-plugin' });
    writeJson(join(tempDir, '.craft-plugin', 'plugin.json'), { name: 'craft-plugin' });

    const manifest = findPluginManifest(tempDir);

    expect(manifest).not.toBeNull();
    expect(manifest!.format).toBe('craft');
    expect(manifest!.manifest.name).toBe('craft-plugin');
  });

  it('ignores invalid manifests', () => {
    mkdirSync(join(tempDir, '.codex-plugin'), { recursive: true });
    writeFileSync(join(tempDir, '.codex-plugin', 'plugin.json'), '{ nope');

    expect(findPluginManifest(tempDir)).toBeNull();
  });
});

describe('loadPluginPackage', () => {
  it('normalizes plugin package capabilities from common open package files', () => {
    writeJson(join(tempDir, '.codex-plugin', 'plugin.json'), {
      name: 'portable-plugin',
      skills: ['skills', 'extra-skills'],
      dependencies: [
        'base-plugin',
        { name: 'widget-runtime', marketplace: 'local' },
      ],
      mcpServers: {
        graph: { command: 'node', args: ['server.js'] },
      },
      interface: {
        displayName: 'Portable Plugin',
        brandColor: '#123456',
        composerIcon: './assets/plugin-icon.svg',
      },
    });
    mkdirSync(join(tempDir, 'skills'), { recursive: true });
    mkdirSync(join(tempDir, 'extra-skills'), { recursive: true });
    mkdirSync(join(tempDir, 'widgets'), { recursive: true });
    mkdirSync(join(tempDir, '.scatter', 'assets'), { recursive: true });
    mkdirSync(join(tempDir, 'assets'), { recursive: true });
    writeFileSync(join(tempDir, 'assets', 'plugin-icon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
    writeJson(join(tempDir, '.mcp.json'), { mcpServers: {} });
    writeJson(join(tempDir, '.app.json'), { app: {} });

    const pluginPackage = loadPluginPackage(tempDir);

    expect(pluginPackage).not.toBeNull();
    expect(pluginPackage!.manifestFormat).toBe('codex');
    expect(pluginPackage!.manifest.name).toBe('portable-plugin');
    expect(pluginPackage!.manifest.dependencies).toEqual([
      'base-plugin',
      { name: 'widget-runtime', marketplace: 'local' },
    ]);
    expect(pluginPackage!.manifest.interface?.displayName).toBe('Portable Plugin');
    expect(pluginPackage!.manifest.interface?.brandColor).toBe('#123456');
    expect(pluginPackage!.iconPath).toBe(resolve(tempDir, 'assets', 'plugin-icon.svg'));
    expect(pluginPackage!.skillDirs).toEqual([
      resolve(tempDir, 'skills'),
      resolve(tempDir, 'extra-skills'),
    ]);
    expect(pluginPackage!.mcpConfigPaths).toEqual([resolve(tempDir, '.mcp.json')]);
    expect(pluginPackage!.appConfigPaths).toEqual([resolve(tempDir, '.app.json')]);
    expect(pluginPackage!.widgetAssetDirs).toEqual([
      resolve(tempDir, 'widgets'),
      resolve(tempDir, 'assets'),
      resolve(tempDir, '.scatter', 'assets'),
    ]);
  });

  it('returns null when no supported plugin manifest exists', () => {
    expect(loadPluginPackage(tempDir)).toBeNull();
  });
});
