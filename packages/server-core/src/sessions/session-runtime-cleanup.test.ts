import { describe, expect, it, jest } from 'bun:test'
import { SessionManager, createManagedSession } from './SessionManager.ts'

describe('SessionManager runtime cleanup', () => {
  it('waits for the agent, pool server, and MCP clients for every live session', async () => {
    const manager = new SessionManager()
    const order: string[] = []
    const managed = createManagedSession(
      { id: 'session-cleanup', name: 'Cleanup test' },
      { id: 'workspace-cleanup', name: 'Cleanup workspace', rootPath: '/tmp', createdAt: Date.now() } as never,
      { messagesLoaded: true },
    ) as any
    managed.agent = {
      disposeForRestart: jest.fn(async () => {
        await Promise.resolve()
        order.push('agent')
      }),
    }
    managed.poolServer = {
      stop: jest.fn(async () => {
        await Promise.resolve()
        order.push('server')
      }),
    }
    managed.mcpPool = {
      disconnectAll: jest.fn(async () => {
        await Promise.resolve()
        order.push('clients')
      }),
    }
    ;(manager as any).sessions.set(managed.id, managed)

    await manager.cleanup()

    expect(order).toEqual(['agent', 'server', 'clients'])
    expect(managed.agent).toBeNull()
    expect(managed.poolServer).toBeUndefined()
    expect(managed.mcpPool).toBeUndefined()
  })
})
