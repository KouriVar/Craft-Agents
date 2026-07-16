import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerPluginPackage } from '../config.ts';
import {
  diagnosePluginMcpServers,
  loadPluginMcpStatus,
  loadPreflightedPluginMcpServers,
  recordPluginMcpAuthFailure,
} from '../diagnostics.ts';
import { loadPluginPackage } from '../storage.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const GOOD_MCP_SERVER = join(HERE, '..', '..', 'mcp', '__tests__', 'fixtures', 'mcp-server-good.mjs');

let tempDir: string;
let workspaceRoot: string;
let pluginRoot: string;

beforeEach(() => {
  tempDir = join(tmpdir(), `plugin-diagnostics-test-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  workspaceRoot = join(tempDir, 'workspace');
  pluginRoot = join(tempDir, 'plugin');
  mkdirSync(join(pluginRoot, '.codex-plugin'), { recursive: true });
  mkdirSync(workspaceRoot, { recursive: true });
});

afterEach(() => {
  if (existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
});

function registerManifest(manifest: Record<string, unknown>): void {
  writeFileSync(join(pluginRoot, '.codex-plugin', 'plugin.json'), JSON.stringify(manifest));
  const pluginPackage = loadPluginPackage(pluginRoot);
  expect(pluginPackage).not.toBeNull();
  registerPluginPackage(workspaceRoot, pluginPackage!, { enabled: true });
}

describe('plugin MCP diagnostics', () => {
  it('skips startup and records status when a declared environment dependency is missing', () => {
    registerManifest({
      name: 'needs-token',
      mcpServers: {
        worker: { command: 'node', args: [GOOD_MCP_SERVER], envVars: ['CRAFT_TEST_MISSING_TOKEN'] },
      },
    });

    expect(loadPreflightedPluginMcpServers(workspaceRoot)).toEqual({});
    const status = loadPluginMcpStatus(workspaceRoot);
    expect(status.servers['needs-token_worker']?.state).toBe('missing-dependency');
    expect(status.servers['needs-token_worker']?.missingDependencies).toEqual(['env:CRAFT_TEST_MISSING_TOKEN']);
  });

  it('connects, lists tools, and persists a ready status', async () => {
    registerManifest({
      name: 'healthy-plugin',
      mcpServers: {
        healthy: { command: 'node', args: [GOOD_MCP_SERVER] },
      },
    });

    const status = await diagnosePluginMcpServers(workspaceRoot, { timeout: 8000 });
    expect(status.servers['healthy-plugin_healthy']?.state).toBe('ready');
    expect(status.servers['healthy-plugin_healthy']?.tools).toEqual(['echo']);
    expect(loadPluginMcpStatus(workspaceRoot)).toEqual(status);
  }, 15000);

  it('reports host credentials blocked by the MCP subprocess policy', () => {
    registerManifest({
      name: 'blocked-token',
      mcpServers: {
        worker: { command: 'node', args: [GOOD_MCP_SERVER], envVars: ['OPENAI_API_KEY'] },
      },
    });

    expect(loadPreflightedPluginMcpServers(workspaceRoot)).toEqual({});
    expect(loadPluginMcpStatus(workspaceRoot).servers['blocked-token_worker']?.missingDependencies)
      .toEqual(['env-blocked:OPENAI_API_KEY']);
  });

  it('persists an OAuth host approval failure for plugin details', () => {
    registerManifest({
      name: 'figma',
      mcpServers: {
        figma: {
          type: 'http',
          url: 'https://mcp.figma.com/mcp',
          oauth_resource: 'https://mcp.figma.com/mcp',
        },
      },
    });

    recordPluginMcpAuthFailure(
      workspaceRoot,
      'plugin-mcp-figma',
      new Error('This MCP service only allows approved OAuth host applications.'),
    );

    expect(loadPluginMcpStatus(workspaceRoot).servers.figma).toMatchObject({
      pluginName: 'figma',
      serverName: 'figma',
      state: 'error',
      errorType: 'host-not-approved',
    });
  });
});
