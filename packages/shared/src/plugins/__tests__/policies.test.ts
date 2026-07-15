import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadPluginPolicies, resolvePluginToolPolicy, setPluginToolPolicy } from '../policies.ts';

let workspaceRoot: string;

beforeEach(() => {
  workspaceRoot = join(tmpdir(), `plugin-policy-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(workspaceRoot, { recursive: true });
});

afterEach(() => rmSync(workspaceRoot, { recursive: true, force: true }));

describe('plugin tool policies', () => {
  it('stores defaults and resolves per-tool overrides', () => {
    setPluginToolPolicy(workspaceRoot, 'canvasight', {
      defaultAction: 'ask',
      tools: { canvasight_widget_api: 'allow' },
    });
    expect(resolvePluginToolPolicy(workspaceRoot, 'canvasight', 'open_canvasight')).toBe('ask');
    expect(resolvePluginToolPolicy(workspaceRoot, 'canvasight', 'canvasight_widget_api')).toBe('allow');
  });

  it('normalizes invalid or malformed policy files', () => {
    mkdirSync(join(workspaceRoot, 'plugins'), { recursive: true });
    writeFileSync(join(workspaceRoot, 'plugins', 'policies.json'), '{broken');
    expect(loadPluginPolicies(workspaceRoot)).toEqual({ version: 1, plugins: {} });
  });
});
