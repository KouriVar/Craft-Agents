import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { RPC_CHANNELS } from '../../../shared/types'
import type { RpcServer } from '@craft-agent/server-core/transport'
import type { HandlerDeps } from '../handler-deps'

type HandlerFn = (ctx: { clientId: string }, ...args: any[]) => Promise<any> | any

const getDefaultThinkingLevelMock = mock(() => 'think')
const setDefaultThinkingLevelMock = mock((_level: string) => true)
const getDefaultAgentRuntimeMock = mock(() => null)
const setDefaultAgentRuntimeMock = mock((_runtime: string) => true)
const getMultimodalModelMock = mock(() => null)
const setMultimodalModelMock = mock((_selection: unknown) => true)

mock.module('@craft-agent/shared/config', () => ({
  getPreferencesPath: () => '/tmp/preferences.json',
  getSessionDraft: () => null,
  setSessionDraft: () => {},
  deleteSessionDraft: () => {},
  getAllSessionDrafts: () => ({}),
  getWorkspaceByNameOrId: () => null,
  getDefaultThinkingLevel: getDefaultThinkingLevelMock,
  setDefaultThinkingLevel: setDefaultThinkingLevelMock,
  getDefaultAgentRuntime: getDefaultAgentRuntimeMock,
  setDefaultAgentRuntime: setDefaultAgentRuntimeMock,
  getMultimodalModel: getMultimodalModelMock,
  setMultimodalModel: setMultimodalModelMock,
  getLlmConnection: (slug: string) => slug === 'vision' ? { slug: 'vision' } : null,
}))

describe('settings default agent RPC handlers', () => {
  const handlers = new Map<string, HandlerFn>()

  beforeEach(async () => {
    handlers.clear()
    getDefaultThinkingLevelMock.mockClear()
    setDefaultThinkingLevelMock.mockClear()
    getDefaultAgentRuntimeMock.mockClear()
    setDefaultAgentRuntimeMock.mockClear()
    getMultimodalModelMock.mockClear()
    setMultimodalModelMock.mockClear()

    const server: RpcServer = {
      handle(channel, handler) {
        handlers.set(channel, handler as HandlerFn)
      },
      push() {},
      async invokeClient() {
        return null
      },
      hasClientCapability() { return false },
      findClientsWithCapability() { return [] },
    }

    const deps: HandlerDeps = {
      sessionManager: {} as HandlerDeps['sessionManager'],
      platform: {
        appRootPath: '',
        resourcesPath: '',
        isPackaged: false,
        appVersion: '0.0.0-test',
        isDebugMode: true,
        logger: {
          info: () => {},
          warn: () => {},
          error: () => {},
          debug: () => {},
        },
        imageProcessor: {
          getMetadata: async () => null,
          process: async () => Buffer.from(''),
        },
      },
      oauthFlowStore: {
        store: () => {},
        getByState: () => null,
        remove: () => {},
        cleanup: () => {},
        dispose: () => {},
        get size() { return 0 },
      } as unknown as HandlerDeps['oauthFlowStore'],
    }

    const { registerSettingsHandlers } = await import('@craft-agent/server-core/handlers/rpc/settings')
    registerSettingsHandlers(server, deps)
  })

  it('returns persisted default thinking level', async () => {
    const getHandler = handlers.get(RPC_CHANNELS.settings.GET_DEFAULT_THINKING_LEVEL)
    expect(getHandler).toBeTruthy()

    const result = await getHandler!({ clientId: 'client-1' })
    expect(result).toBe('think')
    expect(getDefaultThinkingLevelMock).toHaveBeenCalledTimes(1)
  })

  it('persists valid thinking level values', async () => {
    const setHandler = handlers.get(RPC_CHANNELS.settings.SET_DEFAULT_THINKING_LEVEL)
    expect(setHandler).toBeTruthy()

    const result = await setHandler!({ clientId: 'client-1' }, 'max')
    expect(result).toEqual({ success: true })
    expect(setDefaultThinkingLevelMock).toHaveBeenCalledWith('max')
    expect(setDefaultThinkingLevelMock).toHaveBeenCalledTimes(1)
  })

  it('rejects invalid thinking level values before persistence', async () => {
    const setHandler = handlers.get(RPC_CHANNELS.settings.SET_DEFAULT_THINKING_LEVEL)
    expect(setHandler).toBeTruthy()

    await expect(setHandler!({ clientId: 'client-1' }, 'ultra')).rejects.toThrow('Invalid thinking level')
    expect(setDefaultThinkingLevelMock).not.toHaveBeenCalled()
  })

  it('reads and persists the default agent runtime', async () => {
    const getHandler = handlers.get(RPC_CHANNELS.settings.GET_DEFAULT_AGENT_RUNTIME)
    const setHandler = handlers.get(RPC_CHANNELS.settings.SET_DEFAULT_AGENT_RUNTIME)
    expect(await getHandler!({ clientId: 'client-1' })).toBeNull()
    expect(await setHandler!({ clientId: 'client-1' }, 'codex')).toEqual({ success: true })
    expect(setDefaultAgentRuntimeMock).toHaveBeenCalledWith('codex')
  })

  it('rejects an unknown agent runtime', async () => {
    const setHandler = handlers.get(RPC_CHANNELS.settings.SET_DEFAULT_AGENT_RUNTIME)
    await expect(setHandler!({ clientId: 'client-1' }, 'other')).rejects.toThrow('Invalid agent runtime')
    expect(setDefaultAgentRuntimeMock).not.toHaveBeenCalled()
  })

  it('reads and persists the multimodal fallback model', async () => {
    const getHandler = handlers.get(RPC_CHANNELS.settings.GET_MULTIMODAL_MODEL)
    const setHandler = handlers.get(RPC_CHANNELS.settings.SET_MULTIMODAL_MODEL)
    expect(await getHandler!({ clientId: 'client-1' })).toBeNull()
    const selection = { connectionSlug: 'vision', model: 'gpt-5.2' }
    expect(await setHandler!({ clientId: 'client-1' }, selection)).toEqual({ success: true })
    expect(setMultimodalModelMock).toHaveBeenCalledWith(selection)
  })
})
