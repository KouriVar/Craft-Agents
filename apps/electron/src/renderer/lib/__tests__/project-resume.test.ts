import { describe, expect, it } from 'bun:test'
import type { SessionMeta } from '@/atoms/sessions'
import {
  buildContinueTaskPrompt,
  findProjectResumeSession,
  hasResumeData,
  isSessionCompleted,
} from '../project-resume'

function meta(partial: Partial<SessionMeta> & { id: string }): SessionMeta {
  return {
    workspaceId: 'ws',
    ...partial,
  }
}

describe('project-resume helpers', () => {
  it('detects completed sessions', () => {
    expect(isSessionCompleted(meta({ id: 'a', kanbanColumn: 'done' }))).toBe(true)
    expect(isSessionCompleted(meta({ id: 'b', sessionStatus: 'done' }))).toBe(true)
    expect(isSessionCompleted(meta({ id: 'c', kanbanColumn: 'in-progress' }))).toBe(false)
  })

  it('requires goal or checkpoints for resume data', () => {
    expect(hasResumeData(meta({ id: 'a' }))).toBe(false)
    expect(hasResumeData(meta({ id: 'b', taskGoal: '   ' }))).toBe(false)
    expect(hasResumeData(meta({ id: 'c', taskGoal: 'Ship resume' }))).toBe(true)
    expect(hasResumeData(meta({
      id: 'd',
      taskCheckpoints: [{
        id: 'cp1',
        createdAt: 1,
        source: 'auto',
        outcome: 'interrupted',
        summary: 'paused',
      }],
    }))).toBe(true)
  })

  it('picks the most recent unfinished session with resume data for a project', () => {
    const sessions = [
      meta({
        id: 'old',
        projectId: 'proj_a',
        taskGoal: 'Old goal',
        lastMessageAt: 100,
      }),
      meta({
        id: 'done',
        projectId: 'proj_a',
        taskGoal: 'Done goal',
        kanbanColumn: 'done',
        lastMessageAt: 300,
      }),
      meta({
        id: 'other',
        projectId: 'proj_b',
        taskGoal: 'Other project',
        lastMessageAt: 400,
      }),
      meta({
        id: 'fresh',
        projectId: 'proj_a',
        lastMessageAt: 200,
        taskCheckpoints: [{
          id: 'cp1',
          createdAt: 200,
          source: 'auto',
          outcome: 'interrupted',
          summary: 'Halfway',
          nextSteps: ['Finish card'],
          blockers: ['Waiting on review'],
        }],
      }),
      meta({
        id: 'no-data',
        projectId: 'proj_a',
        lastMessageAt: 500,
        name: 'Chat only',
      }),
    ]

    const picked = findProjectResumeSession(sessions, 'proj_a')
    expect(picked?.id).toBe('fresh')
    expect(picked?.taskCheckpoints?.at(-1)?.summary).toBe('Halfway')
  })

  it('returns null when no resume-worthy session exists', () => {
    expect(findProjectResumeSession([
      meta({ id: 'a', projectId: 'proj_a', name: 'plain' }),
      meta({ id: 'b', projectId: 'proj_a', taskGoal: 'x', kanbanColumn: 'done' }),
    ], 'proj_a')).toBeNull()
  })

  it('builds continue prompts matching TaskContinuity keys', () => {
    const t = (key: string, options?: Record<string, unknown>) => {
      if (key === 'taskContinuity.continuePromptNextSteps') return ` NEXT:${options?.nextSteps}`
      if (key === 'taskContinuity.continuePromptWithCheckpoint') {
        return `WITH:${options?.summary}${options?.nextSteps}`
      }
      if (key === 'taskContinuity.continuePromptWithoutCheckpoint') return `WITHOUT:${options?.task}`
      if (key === 'taskContinuity.currentTask') return 'current'
      return key
    }

    const withCp = buildContinueTaskPrompt(meta({
      id: 's1',
      taskGoal: 'Goal',
      taskCheckpoints: [{
        id: 'cp',
        createdAt: 1,
        source: 'manual',
        outcome: 'interrupted',
        summary: 'Sum',
        nextSteps: ['A', 'B'],
      }],
    }), t)
    expect(withCp).toBe('WITH:Sum NEXT:- A\n- B')

    const withoutCp = buildContinueTaskPrompt(meta({ id: 's2', taskGoal: 'Only goal' }), t)
    expect(withoutCp).toBe('WITHOUT:Only goal')
  })
})
