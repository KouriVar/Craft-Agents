import { describe, expect, it } from 'bun:test';
import { InMemoryPiCredentialStore } from './credential-store.ts';

describe('InMemoryPiCredentialStore', () => {
  it('stores credentials without exposing secrets from list()', async () => {
    const store = new InMemoryPiCredentialStore();
    await store.modify('openai', async () => ({ type: 'api_key', key: 'secret' }));

    expect(await store.read('openai')).toEqual({ type: 'api_key', key: 'secret' });
    expect(await store.list()).toEqual([{ providerId: 'openai', type: 'api_key' }]);
  });

  it('serializes concurrent mutations for the same provider', async () => {
    const store = new InMemoryPiCredentialStore();
    const first = store.modify('github-copilot', async () => {
      await Promise.resolve();
      return { type: 'oauth', access: 'first', refresh: 'github', expires: 1 };
    });
    const second = store.modify('github-copilot', async (current) => ({
      type: 'oauth',
      access: `${current?.type === 'oauth' ? current.access : 'missing'}-second`,
      refresh: 'github',
      expires: 2,
    }));

    await Promise.all([first, second]);
    expect(await store.read('github-copilot')).toMatchObject({
      type: 'oauth',
      access: 'first-second',
      expires: 2,
    });
  });

  it('deletes credentials after pending writes complete', async () => {
    const store = new InMemoryPiCredentialStore();
    const write = store.modify('anthropic', async () => ({ type: 'api_key', key: 'secret' }));
    const deletion = store.delete('anthropic');
    await Promise.all([write, deletion]);
    expect(await store.read('anthropic')).toBeUndefined();
  });
});
