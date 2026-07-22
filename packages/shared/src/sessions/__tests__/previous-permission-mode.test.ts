import { describe, expect, it } from 'bun:test';
import { SESSION_PERSISTENT_FIELDS } from '../types.ts';
import { pickSessionFields } from '../utils.ts';

describe('session persistence: previousPermissionMode', () => {
  it('includes previousPermissionMode in SESSION_PERSISTENT_FIELDS', () => {
    expect(SESSION_PERSISTENT_FIELDS).toContain('previousPermissionMode');
  });

  it('pickSessionFields preserves previousPermissionMode when present', () => {
    const source = {
      id: 's1',
      workspaceRootPath: '/tmp/ws',
      permissionMode: 'allow-all',
      previousPermissionMode: 'safe',
      createdAt: 1,
      lastUsedAt: 2,
      ignoredRuntimeField: 'nope',
    } as const;

    const picked = pickSessionFields(source);
    expect(picked.permissionMode).toBe('allow-all');
    expect(picked.previousPermissionMode).toBe('safe');
    expect((picked as Record<string, unknown>).ignoredRuntimeField).toBeUndefined();
  });
});

describe('session persistence: task continuity', () => {
  it('includes and preserves all long-running task fields', () => {
    const expected = [
      'taskGoal',
      'taskPriority',
      'taskDueAt',
      'taskReminderAt',
      'taskReminderAcknowledgedAt',
      'taskReminderLastNotifiedAt',
      'taskCheckpoints',
    ] as const;
    for (const field of expected) expect(SESSION_PERSISTENT_FIELDS).toContain(field);

    const source = {
      id: 's1',
      workspaceRootPath: '/tmp/ws',
      createdAt: 1,
      lastUsedAt: 2,
      taskGoal: 'Finish release',
      taskPriority: 'high',
      taskDueAt: 100,
      taskReminderAt: 90,
      taskReminderAcknowledgedAt: 80,
      taskReminderLastNotifiedAt: 85,
      taskCheckpoints: [{
        id: 'cp-1',
        createdAt: 3,
        source: 'manual',
        outcome: 'completed',
        summary: 'Build passed',
      }],
    } as const;

    const picked = pickSessionFields(source);
    expect(picked.taskGoal).toBe('Finish release');
    expect(picked.taskCheckpoints).toEqual(source.taskCheckpoints);
  });
});
