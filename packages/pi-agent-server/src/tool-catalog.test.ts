import { describe, expect, it } from 'bun:test';
import { ProxyToolCatalog } from './tool-catalog.ts';

const tool = (name: string, description = name) => ({
  name,
  description,
  inputSchema: { type: 'object' },
});

describe('ProxyToolCatalog', () => {
  it('keeps inactive definitions available for later additive activation', () => {
    const catalog = new ProxyToolCatalog();
    catalog.replaceScope('pool', [tool('alpha')]);
    catalog.replaceScope('pool', []);
    const update = catalog.replaceScope('pool', [tool('alpha')], new Set(['alpha']));
    expect(update).toEqual({ changed: true, requiresRebuild: false, activeNames: ['alpha'] });
    expect(catalog.getDefinitions().map(item => item.name)).toEqual(['alpha']);
  });

  it('requires rebuilding for a new or changed definition', () => {
    const catalog = new ProxyToolCatalog();
    catalog.replaceScope('pool', [tool('alpha')]);
    expect(catalog.replaceScope('pool', [tool('alpha'), tool('beta')], new Set(['alpha'])).requiresRebuild).toBe(true);
    expect(catalog.replaceScope('pool', [tool('alpha', 'changed'), tool('beta')], new Set(['alpha', 'beta'])).requiresRebuild).toBe(true);
  });

  it('replaces active names per scope without disturbing other scopes', () => {
    const catalog = new ProxyToolCatalog();
    catalog.replaceScope('session', [tool('plan')]);
    catalog.replaceScope('pool', [tool('alpha')]);
    const update = catalog.replaceScope('pool', []);
    expect(update.activeNames).toEqual(['plan']);
  });
});
