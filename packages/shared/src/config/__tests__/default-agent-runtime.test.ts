import { describe, expect, it } from 'bun:test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { AGENT_RUNTIMES } from '../../agent/runtime-types.ts';

const storageUrl = pathToFileURL(join(import.meta.dir, '..', 'storage.ts')).href;

function setup() {
  const configDir = mkdtempSync(join(tmpdir(), 'craft-agent-runtime-'));
  const configPath = join(configDir, 'config.json');
  writeFileSync(configPath, JSON.stringify({ workspaces: [], activeWorkspaceId: null, activeSessionId: null }));
  return { configDir, configPath };
}

function evaluate(configDir: string, code: string): string {
  const run = Bun.spawnSync([process.execPath, '--eval', `import { getDefaultAgentRuntime, setDefaultAgentRuntime } from '${storageUrl}'; ${code}`], {
    env: { ...process.env, CRAFT_CONFIG_DIR: configDir }, stdout: 'pipe', stderr: 'pipe',
  });
  if (run.exitCode !== 0) throw new Error(run.stderr.toString());
  return run.stdout.toString().trim();
}

describe('default agent runtime storage', () => {
  it('is unset for existing installations', () => {
    const { configDir } = setup();
    expect(evaluate(configDir, 'console.log(String(getDefaultAgentRuntime()))')).toBe('null');
  });

  it('persists every supported runtime', () => {
    const { configDir, configPath } = setup();
    for (const runtime of AGENT_RUNTIMES) {
      evaluate(configDir, `setDefaultAgentRuntime('${runtime}')`);
      expect(evaluate(configDir, 'console.log(String(getDefaultAgentRuntime()))')).toBe(runtime);
    }
    expect(JSON.parse(readFileSync(configPath, 'utf8')).defaultAgentRuntime).toBe('codex');
  });
});
