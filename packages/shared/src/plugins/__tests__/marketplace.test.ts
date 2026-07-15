import { afterEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadPluginMarketplaceSources,
  parsePluginMarketplaceCatalog,
  savePluginMarketplaceSources,
} from '../marketplace.ts';

const source = { id: 'test', name: 'Test', source: 'owner/repo' };
const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('plugin marketplace catalog', () => {
  it('parses local and git-subdir entries', () => {
    const catalog = parsePluginMarketplaceCatalog(source, {
      name: 'catalog',
      interface: { displayName: 'Test catalog' },
      plugins: [
        { name: 'alpha', source: { source: 'local', path: './plugins/alpha' }, category: 'Tools' },
        { name: 'beta', source: { source: 'git-subdir', url: 'https://example.com/repo.git', path: 'beta' } },
      ],
    }, 123);

    expect(catalog.displayName).toBe('Test catalog');
    expect(catalog.refreshedAt).toBe(123);
    expect(catalog.plugins).toHaveLength(2);
    expect(catalog.plugins[0]?.packageSource).toEqual({ source: 'local', path: './plugins/alpha' });
  });

  it('marks npm packages unsupported', () => {
    const catalog = parsePluginMarketplaceCatalog(source, {
      plugins: [{ name: 'npm-plugin', source: { source: 'npm', package: '@example/plugin' } }],
    });
    expect(catalog.plugins[0]?.compatibility).toBe('unsupported');
  });

  it('keeps the OpenAI source built in and persists custom sources', () => {
    const root = mkdtempSync(join(tmpdir(), 'ca-marketplaces-'));
    tempRoots.push(root);
    savePluginMarketplaceSources(root, [
      { id: 'custom', name: 'Custom', source: 'example/plugins', ref: 'main' },
    ]);
    const sources = loadPluginMarketplaceSources(root);
    expect(sources[0]?.id).toBe('openai-official');
    expect(sources[0]?.builtin).toBe(true);
    expect(sources[1]).toMatchObject({ id: 'custom', source: 'example/plugins', ref: 'main' });
  });
});
