import { describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { mkdtempSync } from 'fs';
import {
  V020_BASELINE_STEP_ID,
  establishV020MigrationBaseline,
  resolveWorkspaceDataPath,
  scanLegacyTaskData,
  verifyV020Backup,
} from '../v020-baseline.ts';

function workspace(id: string, rootPath: string, remote = false) {
  return {
    id,
    name: id,
    slug: id,
    rootPath,
    createdAt: 1,
    remoteServer: remote ? { url: 'https://remote.example.test', token: 'not-read', remoteWorkspaceId: id } : undefined,
  } as any;
}

describe('v0.20 migration baseline', () => {
  it('expands home-relative workspace paths before scanning or copying', () => {
    expect(resolveWorkspaceDataPath('~')).not.toBe('~');
    expect(resolveWorkspaceDataPath('~/.craft-agent/workspaces/demo')).toContain('/.craft-agent/workspaces/demo');
  });
  it('backs up config and workspace data, excludes credentials, and verifies the snapshot', () => {
    const root = mkdtempSync(join(tmpdir(), 'v020-baseline-'));
    const configDir = join(root, 'config');
    const workspaceRoot = join(root, 'workspace');
    mkdirSync(configDir, { recursive: true });
    mkdirSync(join(workspaceRoot, 'sessions', 's1'), { recursive: true });
    mkdirSync(join(workspaceRoot, 'sources', 'demo'), { recursive: true });
    writeFileSync(join(configDir, 'config.json'), JSON.stringify({ workspaces: [] }), { encoding: 'utf-8', flag: 'w' });
    writeFileSync(join(workspaceRoot, 'sessions', 's1', 'session.json'), '{"id":"s1"}');
    writeFileSync(join(workspaceRoot, 'sources', 'demo', '.credential-cache.json'), 'secret');
    writeFileSync(join(workspaceRoot, 'credentials.enc'), 'secret');

    const result = establishV020MigrationBaseline({
      workspaces: [workspace('local', workspaceRoot)],
      appVersion: '0.20.0-dev',
      dataSchemaVersion: 'pre-v020',
      configDir,
      now: new Date('2026-07-27T00:00:00.000Z'),
    });

    expect(result.manifest.migrationStepId).toBe(V020_BASELINE_STEP_ID);
    expect(existsSync(join(result.backupPath, 'config', 'config.json'))).toBe(true);
    expect(existsSync(join(result.backupPath, 'workspaces', 'local', 'sessions', 's1', 'session.json'))).toBe(true);
    expect(existsSync(join(result.backupPath, 'workspaces', 'local', 'credentials.enc'))).toBe(false);
    expect(existsSync(join(result.backupPath, 'workspaces', 'local', 'sources', 'demo', '.credential-cache.json'))).toBe(false);
    expect(verifyV020Backup(result.backupPath).files.length).toBeGreaterThan(0);
    expect(JSON.parse(readFileSync(join(result.backupPath, 'migration-state.json'), 'utf-8')).status).toBe('completed');
  });

  it('reports local task data, missing roots, and remote workspaces without mutation', () => {
    const root = mkdtempSync(join(tmpdir(), 'v020-task-scan-'));
    const workspaceRoot = join(root, 'workspace');
    mkdirSync(join(workspaceRoot, 'tasks', 'daily', 'runs', 'run-1'), { recursive: true });
    writeFileSync(join(workspaceRoot, 'tasks', 'daily', 'task.yaml'), 'id: daily');

    const report = scanLegacyTaskData([
      workspace('local', workspaceRoot),
      workspace('missing', join(root, 'missing')),
      workspace('remote', join(root, 'remote'), true),
    ], new Date('2026-07-27T00:00:00.000Z'));

    expect(report.totalTaskCount).toBe(1);
    expect(report.totalRunCount).toBe(1);
    expect(report.workspaces.map(item => item.status)).toEqual(['scanned', 'root_missing', 'remote_preflight_required']);
  });
});
