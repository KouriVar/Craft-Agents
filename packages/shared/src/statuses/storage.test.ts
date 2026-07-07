import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, test } from 'bun:test';
import type { WorkspaceStatusConfig } from './types.ts';
import { getDefaultStatusConfig, loadStatusConfig } from './storage.ts';

function createWorkspace(): string {
  return mkdtempSync(join(tmpdir(), 'craft-agent-statuses-'));
}

function writeStatusConfig(workspaceRoot: string, config: WorkspaceStatusConfig): void {
  const statusesDir = join(workspaceRoot, 'statuses');
  mkdirSync(statusesDir, { recursive: true });
  writeFileSync(join(statusesDir, 'config.json'), JSON.stringify(config, null, 2), 'utf-8');
}

describe('status storage defaults', () => {
  test('defaults to the current-session status only', () => {
    const config = getDefaultStatusConfig();

    expect(config.defaultStatusId).toBe('todo');
    expect(config.statuses.map(status => status.id)).toEqual(['todo']);
    expect(config.statuses[0]?.label).toBe('Todo');
  });

  test('removes hidden built-in statuses from existing workspace configs', () => {
    const workspaceRoot = createWorkspace();
    writeStatusConfig(workspaceRoot, {
      version: 1,
      defaultStatusId: 'done',
      statuses: [
        { id: 'backlog', label: 'Backlog', category: 'open', isFixed: false, isDefault: true, order: 0 },
        { id: 'todo', label: 'Todo', category: 'open', isFixed: true, isDefault: false, order: 1 },
        { id: 'needs-review', label: 'Needs Review', category: 'open', isFixed: false, isDefault: true, order: 2 },
        { id: 'done', label: 'Done', category: 'closed', isFixed: true, isDefault: false, order: 3 },
        { id: 'cancelled', label: 'Cancelled', category: 'closed', isFixed: true, isDefault: false, order: 4 },
      ],
    });

    const config = loadStatusConfig(workspaceRoot);
    const saved: WorkspaceStatusConfig = JSON.parse(
      readFileSync(join(workspaceRoot, 'statuses/config.json'), 'utf-8'),
    );

    expect(config.defaultStatusId).toBe('todo');
    expect(config.statuses.map(status => status.id)).toEqual(['todo']);
    expect(saved.defaultStatusId).toBe('todo');
    expect(saved.statuses.map(status => status.id)).toEqual(['todo']);
  });
});
