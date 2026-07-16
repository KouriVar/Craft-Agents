import { afterEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { assessPluginCompatibility, createNativeConnectorSourceInput } from '../compatibility.ts';
import { loadPluginPackage } from '../storage.ts';

const roots: string[] = [];

function pluginRoot(name: string): string {
  const root = join(tmpdir(), `plugin-compat-${name}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  roots.push(root);
  mkdirSync(root, { recursive: true });
  return root;
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2));
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    if (existsSync(root)) rmSync(root, { recursive: true, force: true });
  }
});

describe('plugin compatibility assessment', () => {
  it('treats Figma as an OAuth MCP plugin whose host approval is resolved at sign-in', () => {
    const root = pluginRoot('figma');
    writeJson(join(root, '.codex-plugin', 'plugin.json'), { name: 'figma' });
    writeJson(join(root, '.mcp.json'), {
      mcpServers: {
        figma: {
          type: 'http',
          url: 'https://mcp.figma.com/mcp',
          oauth_resource: 'https://mcp.figma.com/mcp',
        },
      },
    });
    writeJson(join(root, '.app.json'), {
      apps: { figma: { id: 'connector_figma' } },
    });

    const report = assessPluginCompatibility(loadPluginPackage(root)!);
    expect(report.level).toBe('needs-auth');
    expect(report.authRequirements).toContainEqual({
      kind: 'mcp-oauth',
      name: 'figma',
      sourceSlug: 'plugin-mcp-figma',
      supported: true,
    });
    expect(report.reasons).not.toContain('无法直接使用 OpenAI Connector：figma');
  });

  it('maps Gmail connector auth to a CA native Google source', () => {
    const root = pluginRoot('gmail');
    writeJson(join(root, '.codex-plugin', 'plugin.json'), { name: 'gmail' });
    writeJson(join(root, '.app.json'), {
      apps: { gmail: { id: 'connector_gmail' } },
    });

    const pluginPackage = loadPluginPackage(root)!;
    const report = assessPluginCompatibility(pluginPackage);
    expect(report.level).toBe('needs-auth');
    expect(report.authRequirements).toContainEqual({
      kind: 'native-source',
      name: 'gmail',
      provider: 'google',
      service: 'gmail',
      supported: true,
    });
    expect(createNativeConnectorSourceInput(report.connectors[0]!)).toMatchObject({
      provider: 'google',
      type: 'api',
      api: {
        baseUrl: 'https://gmail.googleapis.com/gmail/v1',
        authType: 'oauth',
        googleService: 'gmail',
      },
    });
  });

  it('marks unknown OpenAI-only connectors unsupported', () => {
    const root = pluginRoot('private-app');
    writeJson(join(root, '.codex-plugin', 'plugin.json'), { name: 'private-app' });
    writeJson(join(root, '.app.json'), {
      apps: { private: { id: 'connector_private' } },
    });

    const report = assessPluginCompatibility(loadPluginPackage(root)!);
    expect(report.level).toBe('unsupported');
    expect(report.authRequirements[0]).toMatchObject({
      kind: 'openai-connector',
      supported: false,
    });
  });
});
