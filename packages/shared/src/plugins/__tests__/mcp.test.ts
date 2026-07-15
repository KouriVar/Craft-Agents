import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { registerPluginPackage, setPluginEnabled } from '../config.ts';
import { loadPluginMcpServers } from '../mcp.ts';
import { loadPluginPackage } from '../storage.ts';

let tempDir: string;
let workspaceRoot: string;
let pluginRoot: string;

beforeEach(() => {
  tempDir = join(tmpdir(), `plugin-mcp-test-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  workspaceRoot = join(tempDir, 'workspace');
  pluginRoot = join(workspaceRoot, 'plugins', 'installed', 'canvasight');
  mkdirSync(workspaceRoot, { recursive: true });
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

function registerInstalledPlugin(): void {
  const pluginPackage = loadPluginPackage(pluginRoot);
  expect(pluginPackage).not.toBeNull();
  registerPluginPackage(workspaceRoot, pluginPackage!, { enabled: true, source: 'git' });
}

describe('loadPluginMcpServers', () => {
  it('loads MCP servers declared in plugin manifests', () => {
    writeJson(join(pluginRoot, '.codex-plugin', 'plugin.json'), {
      name: 'canvasight',
      mcpServers: {
        canvasight: {
          command: 'node',
          args: ['server.js'],
          env: { NODE_ENV: 'production' },
          envVars: ['CANVASIGHT_TOKEN'],
          cwd: 'server',
        },
      },
    });
    registerInstalledPlugin();

    expect(loadPluginMcpServers(workspaceRoot)).toEqual({
      canvasight: {
        type: 'stdio',
        command: 'node',
        args: ['server.js'],
        env: { NODE_ENV: 'production' },
        envVars: ['CANVASIGHT_TOKEN'],
        cwd: resolve(pluginRoot, 'server'),
      },
    });
  });

  it('loads MCP servers declared in .mcp.json files', () => {
    writeJson(join(pluginRoot, '.codex-plugin', 'plugin.json'), { name: 'multi-plugin' });
    writeJson(join(pluginRoot, '.mcp.json'), {
      mcpServers: {
        graph: { type: 'http', url: 'https://example.test/mcp', headers: { 'X-Plugin': 'yes' } },
        worker: { type: 'sse', url: 'https://example.test/sse', bearerTokenEnvVar: 'PLUGIN_TOKEN' },
      },
    });
    registerInstalledPlugin();

    expect(loadPluginMcpServers(workspaceRoot)).toEqual({
      'multi-plugin_graph': {
        type: 'http',
        url: 'https://example.test/mcp',
        headers: { 'X-Plugin': 'yes' },
        bearerTokenEnvVar: undefined,
      },
      'multi-plugin_worker': {
        type: 'sse',
        url: 'https://example.test/sse',
        headers: undefined,
        bearerTokenEnvVar: 'PLUGIN_TOKEN',
      },
    });
  });

  it('skips disabled plugin package MCP servers', () => {
    writeJson(join(pluginRoot, '.codex-plugin', 'plugin.json'), {
      name: 'disabled-plugin',
      mcpServers: {
        disabled: { command: 'node', args: ['server.js'] },
      },
    });
    registerInstalledPlugin();
    setPluginEnabled(workspaceRoot, 'disabled-plugin', false);

    expect(loadPluginMcpServers(workspaceRoot)).toEqual({});
  });
});
