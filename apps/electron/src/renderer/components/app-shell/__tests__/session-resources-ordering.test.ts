import { describe, expect, it } from 'bun:test'
import type { Session } from '../../../../shared/types'
import { isCodeRelatedSession } from '../session-resources-ordering'

function sessionWith(messages: Session['messages'], overrides: Partial<Session> = {}): Session {
  return {
    id: 'session-1',
    workspaceId: 'workspace-1',
    workspaceName: 'Workspace',
    lastMessageAt: 1,
    messages,
    isProcessing: false,
    workingDirectory: '/workspace/default-repository',
    ...overrides,
  }
}

describe('isCodeRelatedSession', () => {
  it('does not classify a general conversation from its default working directory', () => {
    const session = sessionWith([{ id: 'm1', role: 'user', content: '帮我规划一下周末行程', timestamp: 1 }])
    expect(isCodeRelatedSession(session)).toBe(false)
  })

  it('recognizes coding tool activity', () => {
    const session = sessionWith([{ id: 'm1', role: 'tool', content: '', timestamp: 1, toolName: 'apply_patch' }])
    expect(isCodeRelatedSession(session)).toBe(true)
  })

  it('recognizes an explicitly attached project folder', () => {
    const session = sessionWith([{
      id: 'm1',
      role: 'user',
      content: '看看这个项目',
      timestamp: 1,
      badges: [{
        type: 'folder',
        label: 'CraftAgent',
        rawText: '[folder:/workspace/CraftAgent]',
        filePath: '/workspace/CraftAgent',
        start: 0,
        end: 30,
      }],
    }])
    expect(isCodeRelatedSession(session)).toBe(true)
  })

  it('recognizes explicit development intent but ignores ordinary web tool activity', () => {
    const coding = sessionWith([{ id: 'm1', role: 'user', content: '帮我修复这个代码仓库里的 bug', timestamp: 1 }])
    const browsing = sessionWith([{ id: 'm2', role: 'tool', content: '', timestamp: 2, toolName: 'web_search' }])
    expect(isCodeRelatedSession(coding)).toBe(true)
    expect(isCodeRelatedSession(browsing)).toBe(false)
  })
})
