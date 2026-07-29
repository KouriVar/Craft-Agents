import { beforeEach, describe, expect, it, mock } from 'bun:test'
import type { RpcServer } from '@craft-agent/server-core/transport'
import type { HandlerDeps } from '../handler-deps'
import { mockElectronModule } from '../../../test/mock-electron'

const registeredChannels: string[] = []

mockElectronModule()

function createMockServer(): RpcServer {
  return {
    handle(channel: string, _handler: unknown) {
      registeredChannels.push(channel)
    },
    push() {},
    async invokeClient() {},
    hasClientCapability() { return false },
    findClientsWithCapability() { return [] },
  }
}

function createMockDeps(): HandlerDeps {
  return {
    sessionManager: {} as HandlerDeps['sessionManager'],
    platform: {
      appRootPath: '',
      resourcesPath: '',
      isPackaged: false,
      appVersion: '0.0.0-test',
      isDebugMode: true,
      logger: console,
      imageProcessor: {
        getMetadata: async () => null,
        process: async () => Buffer.from(''),
      },
    },
    windowManager: {} as HandlerDeps['windowManager'],
    browserPaneManager: {
      onStateChange: () => {},
      onRemoved: () => {},
      onInteracted: () => {},
      onProfileChanged: () => {},
    } as unknown as NonNullable<HandlerDeps['browserPaneManager']>,
    oauthFlowStore: {
      store: () => {},
      getByState: () => null,
      remove: () => {},
      cleanup: () => {},
      dispose: () => {},
      size: 0,
    } as unknown as HandlerDeps['oauthFlowStore'],
    messagingRegistry: {
      getConfig: async () => ({}),
      updateConfig: async () => {},
      testLark: async () => ({ ok: true }),
      saveLark: async () => {},
      disconnect: async () => {},
      forget: async () => {},
      getBindings: async () => [],
      generateCode: async () => '',
      unbind: async () => {},
      unbindBinding: async () => {},
      wechatStartConnect: async () => {},
      wechatSubmitCode: async () => {},
      getPlatformOwners: async () => [],
      setPlatformOwners: async () => {},
      getPlatformAccessMode: async () => 'inherit',
      setPlatformAccessMode: async () => {},
      getPendingSenders: async () => [],
      dismissPendingSender: async () => {},
      allowPendingSender: async () => {},
      setBindingAccess: async () => {},
    } as unknown as HandlerDeps['messagingRegistry'],
  }
}

async function getExpectedCoreChannels(): Promise<Set<string>> {
  // Core handler channels (now in server-core)
  const [
    auth,
    automations,
    cognition,
    connectors,
    dynamic,
    experts,
    files,
    labels,
    library,
    llm,
    messaging,
    oauth,
    plugins,
    privacy,
    projects,
    resources,
    search,
    server,
    sessions,
    settings,
    skills,
    sources,
    statuses,
    system,
    transfer,
    widgets,
    workspace,
    onboarding,
    workflows,
  ] = await Promise.all([
    import('@craft-agent/server-core/handlers/rpc/auth'),
    import('@craft-agent/server-core/handlers/rpc/automations'),
    import('@craft-agent/server-core/handlers/rpc/cognition'),
    import('@craft-agent/server-core/handlers/rpc/connectors'),
    import('@craft-agent/server-core/handlers/rpc/dynamic'),
    import('@craft-agent/server-core/handlers/rpc/experts'),
    import('@craft-agent/server-core/handlers/rpc/files'),
    import('@craft-agent/server-core/handlers/rpc/labels'),
    import('@craft-agent/server-core/handlers/rpc/library'),
    import('@craft-agent/server-core/handlers/rpc/llm-connections'),
    import('@craft-agent/server-core/handlers/rpc/messaging'),
    import('@craft-agent/server-core/handlers/rpc/oauth'),
    import('@craft-agent/server-core/handlers/rpc/plugins'),
    import('@craft-agent/server-core/handlers/rpc/privacy'),
    import('@craft-agent/server-core/handlers/rpc/projects'),
    import('@craft-agent/server-core/handlers/rpc/resources'),
    import('@craft-agent/server-core/handlers/rpc/search'),
    import('@craft-agent/server-core/handlers/rpc/server'),
    import('@craft-agent/server-core/handlers/rpc/sessions'),
    import('@craft-agent/server-core/handlers/rpc/settings'),
    import('@craft-agent/server-core/handlers/rpc/skills'),
    import('@craft-agent/server-core/handlers/rpc/sources'),
    import('@craft-agent/server-core/handlers/rpc/statuses'),
    import('@craft-agent/server-core/handlers/rpc/system'),
    import('@craft-agent/server-core/handlers/rpc/transfer'),
    import('@craft-agent/server-core/handlers/rpc/widgets'),
    import('@craft-agent/server-core/handlers/rpc/workspace'),
    import('@craft-agent/server-core/handlers/rpc/onboarding'),
    import('@craft-agent/server-core/handlers/rpc/workflows'),
  ])

  const mockServerCtx = {
    getConnectedClientCount: () => 0,
    serverId: 'test-server',
    startedAt: Date.now(),
  }

  return new Set([
    ...auth.HANDLED_CHANNELS,
    ...automations.HANDLED_CHANNELS,
    ...cognition.HANDLED_CHANNELS,
    ...connectors.HANDLED_CHANNELS,
    ...dynamic.HANDLED_CHANNELS,
    ...experts.HANDLED_CHANNELS,
    ...files.HANDLED_CHANNELS,
    ...labels.HANDLED_CHANNELS,
    ...library.HANDLED_CHANNELS,
    ...llm.HANDLED_CHANNELS,
    ...messaging.HANDLED_CHANNELS,
    ...oauth.HANDLED_CHANNELS,
    ...plugins.HANDLED_CHANNELS,
    ...privacy.HANDLED_CHANNELS,
    ...projects.HANDLED_CHANNELS,
    ...resources.HANDLED_CHANNELS,
    ...search.HANDLED_CHANNELS,
    ...server.HANDLED_CHANNELS,
    ...sessions.HANDLED_CHANNELS,
    ...settings.HANDLED_CHANNELS,
    ...skills.HANDLED_CHANNELS,
    ...sources.HANDLED_CHANNELS,
    ...statuses.HANDLED_CHANNELS,
    ...system.CORE_HANDLED_CHANNELS,
    ...transfer.HANDLED_CHANNELS,
    ...widgets.HANDLED_CHANNELS,
    ...workspace.CORE_HANDLED_CHANNELS,
    ...onboarding.HANDLED_CHANNELS,
    ...workflows.HANDLED_CHANNELS,
  ])
}

async function getExpectedGuiChannels(): Promise<Set<string>> {
  const [browser, system, workspace, settings] = await Promise.all([
    import('../browser'),
    import('../system'),
    import('../workspace'),
    import('../settings'),
  ])

  return new Set([
    ...browser.HANDLED_CHANNELS,
    ...system.GUI_HANDLED_CHANNELS,
    ...workspace.GUI_HANDLED_CHANNELS,
    ...settings.GUI_HANDLED_CHANNELS,
  ])
}

describe('RPC handler profile registration', () => {
  beforeEach(() => {
    registeredChannels.length = 0
  })

  it('registerCoreRpcHandlers registers only core channels', async () => {
    const expected = await getExpectedCoreChannels()
    const { registerCoreRpcHandlers } = await import('../index')

    const mockServerCtx = {
      getConnectedClientCount: () => 0,
      serverId: 'test-server',
      startedAt: Date.now(),
    }
    registerCoreRpcHandlers(createMockServer(), createMockDeps(), mockServerCtx)

    const actual = new Set(registeredChannels.filter(ch => ch.includes(':')))
    expect([...expected].filter(ch => !actual.has(ch))).toEqual([])
    expect([...actual].filter(ch => !expected.has(ch))).toEqual([])
  })

  it('registerGuiRpcHandlers registers only gui channels', async () => {
    const expected = await getExpectedGuiChannels()
    const { registerGuiRpcHandlers } = await import('../index')

    registerGuiRpcHandlers(createMockServer(), createMockDeps())

    const actual = new Set(registeredChannels.filter(ch => ch.includes(':')))
    expect([...expected].filter(ch => !actual.has(ch))).toEqual([])
    expect([...actual].filter(ch => !expected.has(ch))).toEqual([])
  })
})
