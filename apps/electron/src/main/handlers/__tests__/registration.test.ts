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

async function getExpectedChannels(): Promise<Set<string>> {
  // Core handler channels (now in server-core)
  const [
    auth,
    automations,
    files,
    labels,
    llm,
    oauth,
    sessions,
    coreSettings,
    skills,
    sources,
    statuses,
    coreSystem,
    coreWorkspace,
    onboarding,
    plugins,
    resources,
    transfer,
    projects,
    widgets,
    cognition,
    connectors,
    dynamic,
    experts,
    library,
    messaging,
    privacy,
    search,
    server,
    workflows,
  ] = await Promise.all([
    import('@craft-agent/server-core/handlers/rpc/auth'),
    import('@craft-agent/server-core/handlers/rpc/automations'),
    import('@craft-agent/server-core/handlers/rpc/files'),
    import('@craft-agent/server-core/handlers/rpc/labels'),
    import('@craft-agent/server-core/handlers/rpc/llm-connections'),
    import('@craft-agent/server-core/handlers/rpc/oauth'),
    import('@craft-agent/server-core/handlers/rpc/sessions'),
    import('@craft-agent/server-core/handlers/rpc/settings'),
    import('@craft-agent/server-core/handlers/rpc/skills'),
    import('@craft-agent/server-core/handlers/rpc/sources'),
    import('@craft-agent/server-core/handlers/rpc/statuses'),
    import('@craft-agent/server-core/handlers/rpc/system'),
    import('@craft-agent/server-core/handlers/rpc/workspace'),
    import('@craft-agent/server-core/handlers/rpc/onboarding'),
    import('@craft-agent/server-core/handlers/rpc/plugins'),
    import('@craft-agent/server-core/handlers/rpc/resources'),
    import('@craft-agent/server-core/handlers/rpc/transfer'),
    import('@craft-agent/server-core/handlers/rpc/projects'),
    import('@craft-agent/server-core/handlers/rpc/widgets'),
    import('@craft-agent/server-core/handlers/rpc/cognition'),
    import('@craft-agent/server-core/handlers/rpc/connectors'),
    import('@craft-agent/server-core/handlers/rpc/dynamic'),
    import('@craft-agent/server-core/handlers/rpc/experts'),
    import('@craft-agent/server-core/handlers/rpc/library'),
    import('@craft-agent/server-core/handlers/rpc/messaging'),
    import('@craft-agent/server-core/handlers/rpc/privacy'),
    import('@craft-agent/server-core/handlers/rpc/search'),
    import('@craft-agent/server-core/handlers/rpc/server'),
    import('@craft-agent/server-core/handlers/rpc/workflows'),
  ])

  // GUI handler channels (remain in electron)
  const [browser, guiSystem, guiWorkspace, guiSettings] = await Promise.all([
    import('../browser'),
    import('../system'),
    import('../workspace'),
    import('../settings'),
  ])

  return new Set([
    ...auth.HANDLED_CHANNELS,
    ...automations.HANDLED_CHANNELS,
    ...files.HANDLED_CHANNELS,
    ...labels.HANDLED_CHANNELS,
    ...llm.HANDLED_CHANNELS,
    ...oauth.HANDLED_CHANNELS,
    ...sessions.HANDLED_CHANNELS,
    ...coreSettings.HANDLED_CHANNELS,
    ...skills.HANDLED_CHANNELS,
    ...sources.HANDLED_CHANNELS,
    ...statuses.HANDLED_CHANNELS,
    ...coreSystem.CORE_HANDLED_CHANNELS,
    ...coreWorkspace.CORE_HANDLED_CHANNELS,
    ...onboarding.HANDLED_CHANNELS,
    ...plugins.HANDLED_CHANNELS,
    ...resources.HANDLED_CHANNELS,
    ...transfer.HANDLED_CHANNELS,
    ...projects.HANDLED_CHANNELS,
    ...widgets.HANDLED_CHANNELS,
    ...cognition.HANDLED_CHANNELS,
    ...connectors.HANDLED_CHANNELS,
    ...dynamic.HANDLED_CHANNELS,
    ...experts.HANDLED_CHANNELS,
    ...library.HANDLED_CHANNELS,
    ...messaging.HANDLED_CHANNELS,
    ...privacy.HANDLED_CHANNELS,
    ...search.HANDLED_CHANNELS,
    ...server.HANDLED_CHANNELS,
    ...workflows.HANDLED_CHANNELS,
    ...browser.HANDLED_CHANNELS,
    ...guiSystem.GUI_HANDLED_CHANNELS,
    ...guiWorkspace.GUI_HANDLED_CHANNELS,
    ...guiSettings.GUI_HANDLED_CHANNELS,
  ])
}

describe('RPC handler registration', () => {
  beforeEach(() => {
    registeredChannels.length = 0
  })

  it('registers all declared handled channels exactly once', async () => {
    const expected = await getExpectedChannels()
    const { registerAllRpcHandlers } = await import('../index')

    const mockServerCtx = {
      getConnectedClientCount: () => 0,
      serverId: 'test-server',
      startedAt: Date.now(),
    }
    registerAllRpcHandlers(createMockServer(), createMockDeps(), mockServerCtx)

    const appChannels = registeredChannels.filter(ch => ch.includes(':'))
    const actual = new Set(appChannels)

    const missing = [...expected].filter(ch => !actual.has(ch)).sort()
    const unexpected = [...actual].filter(ch => !expected.has(ch)).sort()

    expect(missing).toEqual([])
    expect(unexpected).toEqual([])

    // Check for duplicates
    const counts = new Map<string, number>()
    for (const ch of appChannels) {
      counts.set(ch, (counts.get(ch) ?? 0) + 1)
    }
    const duplicates = [...counts.entries()]
      .filter(([, count]) => count > 1)
      .map(([channel, count]) => `${channel} (${count}x)`)
      .sort()

    expect(duplicates).toEqual([])
  })

  it('keeps onboarding channels in registration coverage', async () => {
    const { HANDLED_CHANNELS } = await import('@craft-agent/server-core/handlers/rpc/onboarding')
    const { registerAllRpcHandlers } = await import('../index')

    registerAllRpcHandlers(createMockServer(), createMockDeps())

    const actual = new Set(registeredChannels)
    const missingOnboarding = HANDLED_CHANNELS.filter(ch => !actual.has(ch))

    expect(missingOnboarding).toEqual([])
  })
})
