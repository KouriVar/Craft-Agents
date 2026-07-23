import type {
  FileAttachment,
  LoadedSource,
  PermissionMode,
  MessagingPlatformRuntimeInfo,
} from '../../shared/types'
import type { MessagingBinding } from '../atoms/messaging'
import type {
  BindingAccess,
  PendingSender,
  PlatformAccessMode,
  PlatformOwner,
} from '../components/messaging/access/types'

// ============================================================================
// Messaging mock state + control handle
// ============================================================================
//
// The real messaging flow is driven by IPC push events (platform status,
// binding changes). To make the messaging UI previewable, we replace those IPC
// calls with an in-memory event bus and expose a `window.__playgroundMessaging`
// handle so variant/preview wrappers can flip state (connected ↔ disconnected,
// bindings) without remounting the component.

type PlatformStatusListener = (
  workspaceId: string,
  platform: string,
  status: MessagingPlatformRuntimeInfo,
) => void
type BindingListener = (workspaceId: string) => void

const PLAYGROUND_WORKSPACE_ID = 'playground-workspace'

type AllowListPlatform = 'lark' | 'wechat'

interface AllowListState {
  accessMode: PlatformAccessMode
  owners: PlatformOwner[]
  pending: PendingSender[]
  /** Per-binding access. Keyed by bindingId. */
  bindings: Record<string, BindingAccess>
}

interface MessagingMockState {
  runtime: {
    lark: MessagingPlatformRuntimeInfo
    wechat: MessagingPlatformRuntimeInfo
  }
  bindings: MessagingBinding[]
  /** Workspace-level allow-list state per platform (Phase 1 mock surface). */
  allowList: Record<AllowListPlatform, AllowListState>
  platformStatusListeners: Set<PlatformStatusListener>
  bindingListeners: Set<BindingListener>
}

function defaultRuntime(platform: AllowListPlatform): MessagingPlatformRuntimeInfo {
  return {
    platform,
    configured: false,
    connected: false,
    state: 'disconnected',
    updatedAt: Date.now(),
  }
}

function defaultAllowList(): AllowListState {
  return { accessMode: 'open', owners: [], pending: [], bindings: {} }
}

const messagingMockState: MessagingMockState = {
  runtime: {
    lark: defaultRuntime('lark'),
    wechat: defaultRuntime('wechat'),
  },
  bindings: [],
  allowList: {
    lark: defaultAllowList(),
    wechat: defaultAllowList(),
  },
  platformStatusListeners: new Set(),
  bindingListeners: new Set(),
}

function emitPlatformStatus(platform: AllowListPlatform) {
  const status = messagingMockState.runtime[platform]
  for (const listener of messagingMockState.platformStatusListeners) {
    try { listener(PLAYGROUND_WORKSPACE_ID, platform, status) } catch (err) { console.error(err) }
  }
}

function emitBindingChanged() {
  for (const listener of messagingMockState.bindingListeners) {
    try { listener(PLAYGROUND_WORKSPACE_ID) } catch (err) { console.error(err) }
  }
}

export interface PlaygroundMessagingHandle {
  /** Snapshot of current state (for debugging from DevTools). */
  state: MessagingMockState
  setLarkConnected: (connected: boolean, identity?: string) => void
  setWeChatConnected: (connected: boolean, identity?: string) => void
  setBindings: (bindings: MessagingBinding[]) => void
  reset: () => void
}

/**
 * Allow-list mock control. Lets AllowListPreview drive the workspace-level
 * owners / pending / per-binding-access mock state without going through the
 * IPC mocks. Phase 3 wiring will read the same state via electronAPI.
 */
export interface PlaygroundAllowListHandle {
  setAccessMode: (platform: AllowListPlatform, mode: PlatformAccessMode) => void
  setOwners: (platform: AllowListPlatform, owners: PlatformOwner[]) => void
  setPending: (platform: AllowListPlatform, pending: PendingSender[]) => void
  setBindingAccess: (
    platform: AllowListPlatform,
    bindingId: string,
    access: BindingAccess,
  ) => void
  reset: () => void
}

export const playgroundMessagingHandle: PlaygroundMessagingHandle = {
  state: messagingMockState,
  setLarkConnected(connected, identity) {
    messagingMockState.runtime.lark = {
      platform: 'lark',
      configured: connected,
      connected,
      state: connected ? 'connected' : 'disconnected',
      identity,
      updatedAt: Date.now(),
    }
    emitPlatformStatus('lark')
  },
  setWeChatConnected(connected, identity) {
    messagingMockState.runtime.wechat = {
      platform: 'wechat',
      configured: connected,
      connected,
      state: connected ? 'connected' : 'disconnected',
      identity,
      updatedAt: Date.now(),
    }
    emitPlatformStatus('wechat')
  },
  setBindings(bindings) {
    messagingMockState.bindings = bindings
    emitBindingChanged()
  },
  reset() {
    messagingMockState.runtime.lark = defaultRuntime('lark')
    messagingMockState.runtime.wechat = defaultRuntime('wechat')
    messagingMockState.bindings = []
    messagingMockState.allowList.lark = defaultAllowList()
    messagingMockState.allowList.wechat = defaultAllowList()
    emitPlatformStatus('lark')
    emitPlatformStatus('wechat')
    emitBindingChanged()
  },
}

export const playgroundAllowListHandle: PlaygroundAllowListHandle = {
  setAccessMode(platform, mode) {
    messagingMockState.allowList[platform].accessMode = mode
  },
  setOwners(platform, owners) {
    messagingMockState.allowList[platform].owners = owners
  },
  setPending(platform, pending) {
    messagingMockState.allowList[platform].pending = pending
  },
  setBindingAccess(platform, bindingId, access) {
    messagingMockState.allowList[platform].bindings[bindingId] = access
  },
  reset() {
    messagingMockState.allowList.lark = defaultAllowList()
    messagingMockState.allowList.wechat = defaultAllowList()
  },
}

// ============================================================================
// Mock electronAPI
// ============================================================================

export const mockElectronAPI = {
  isDebugMode: async () => true,

  // Called at module-load time by SessionFilesSection.tsx (and others) to
  // branch between Electron and web-UI rendering. Must be synchronous.
  getRuntimeEnvironment: (): 'electron' | 'web' => 'electron',

  openFileDialog: async (options?: { mode?: 'files' | 'directory'; title?: string }) => {
    console.log('[Playground] openFileDialog called')
    return options?.mode === 'directory'
      ? ['/Users/demo/CraftAgent']
      : [] // Let user use file input or drag-drop for regular files
  },

  // Label APIs are used by the app-shell providers rendered around playground
  // previews. Keep them fail-soft so unrelated component demos can mount.
  listLabels: async () => [],
  onLabelsChanged: (callback: (workspaceId: string) => void) => {
    void callback
    return () => {}
  },

  readFileAttachment: async (path: string) => {
    console.log('[Playground] readFileAttachment called:', path)
    return null // Let FileReader API handle it
  },

  generateThumbnail: async (base64: string, mimeType: string) => {
    console.log('[Playground] generateThumbnail called')
    return null // Skip thumbnails in playground
  },

  openFolderDialog: async () => {
    console.log('[Playground] openFolderDialog called')
    return null
  },

  getTaskOutput: async (taskId: string) => {
    console.log('[Playground] getTaskOutput called:', taskId)
    return `Output for task ${taskId}:\n\nThis is a mock output in the playground.\nIn the real app, this would show the actual task output.`
  },

  // Session files API used by SessionFilesSection (Info popover)
  getSessionFiles: async (sessionId: string) => {
    console.log('[Playground] getSessionFiles called:', sessionId)
    return []
  },

  watchSessionFiles: (sessionId: string) => {
    console.log('[Playground] watchSessionFiles called:', sessionId)
  },

  unwatchSessionFiles: () => {
    console.log('[Playground] unwatchSessionFiles called')
  },

  onSessionFilesChanged: (callback: (sessionId: string) => void) => {
    console.log('[Playground] onSessionFilesChanged subscribed')
    // Keep callback referenced for parity/debugging, but no events emitted in playground
    void callback
    return () => {
      console.log('[Playground] onSessionFilesChanged unsubscribed')
    }
  },

  browserPane: {
    focus: async (instanceId: string) => {
      console.log('[Playground] browserPane.focus called:', instanceId)
    },
  },

  openFile: async (path: string) => {
    console.log('[Playground] openFile called:', path)
    alert(`Would open file in system editor:\n${path}`)
  },

  showInFolder: async (path: string) => {
    console.log('[Playground] showInFolder called:', path)
    alert(`Would reveal in file manager:\n${path}`)
  },
  openTerminal: async (path: string) => {
    console.log('[Playground] openTerminal called:', path)
    alert(`Would open terminal at:\n${path}`)
  },
  openTerminalPane: async (cwd: string) => {
    console.log('[Playground] openTerminalPane called:', cwd)
    alert(`Would open terminal pane at:\n${cwd}`)
  },

  // NavigationProvider subscribes to deep-link IPC on mount; in the playground
  // there is no main process firing these events, so the listener is a no-op.
  onDeepLinkNavigate: (_callback: unknown) => {
    void _callback
    return () => {}
  },

  // Debug menu actions invoked by the mobile menu's Debug sub-page in dev mode.
  // The real implementations call into the auto-updater; the playground just logs.
  checkForUpdates: () => {
    console.log('[Playground] checkForUpdates called')
  },
  installUpdate: () => {
    console.log('[Playground] installUpdate called')
  },

  // ChatDisplay required mocks
  readPreferences: async () => {
    return {
      content: JSON.stringify({ explore: { aiStatusEnabled: true, aiFrequency: 'startup', aiCount: 3 } }),
      diffViewerSettings: { showFilePath: true, expandedSections: {} },
    }
  },

  generateExploreBrief: async () => ({
    headline: '探索体验正在收敛',
    summary: '你正在把网页与会话整合成一个统一的工作入口，当前重点是完成默认页的信息层级和交互闭环。',
    threads: [
      { title: '统一入口', detail: '对齐网页与会话两种模式的默认体验。' },
      { title: 'AI 整理', detail: '使用默认模型生成工作概览和下一步建议。' },
      { title: '状态保持', detail: '确保会话和网页在重启后依然可继续。' },
    ],
    recommendations: [
      { kind: 'session' as const, targetId: 'route-analysis', title: '继续路线分析', description: '验证两种模式下的默认页跳转。' },
      { kind: 'session' as const, targetId: 'agent-framework', title: '收敛 Agent 框架方案', description: '把已有讨论整理成可执行的实现步骤。' },
      { kind: 'prompt' as const, title: '完成打包前回归', description: '检查探索页的加载、失败和空状态。', prompt: '请帮我回归测试探索页的所有状态' },
    ],
    generatedAt: Date.now(),
    model: 'deepseek-v4-flash',
  }),

  writePreferences: async (prefs: unknown) => {
    console.log('[Playground] writePreferences called:', prefs)
  },

  // FreeFormInput required mocks
  getAutoCapitalisation: async () => false,

  getPendingPlanExecution: async (sessionId: string) => {
    console.log('[Playground] getPendingPlanExecution called:', sessionId)
    return null
  },

  getSendMessageKey: async () => 'enter',
  getSpellCheck: async () => true,
  getOpenConversationScroll: async () => 'bottom',
  setOpenConversationScroll: async () => {},
  getRightSidebarMode: async () => 'manual',
  setRightSidebarMode: async () => {},
  getRightSidebarFollowSession: async () => false,
  setRightSidebarFollowSession: async () => {},
  getBrowserOpenMode: async () => 'sidebar',
  setBrowserOpenMode: async () => {},

  // Pi provider discovery mocks
  getPiApiKeyProviders: async () => [
    { key: 'anthropic', label: 'Anthropic', placeholder: 'sk-ant-...' },
    { key: 'openai', label: 'OpenAI', placeholder: 'sk-...' },
    { key: 'google', label: 'Google AI Studio', placeholder: 'AIza...' },
    { key: 'deepseek', label: 'DeepSeek', placeholder: 'sk-...' },
  ],
  getPiProviderBaseUrl: async () => '',
  getPiProviderModels: async (provider: string) => {
    const MOCK_MODELS: Record<string, Array<{ id: string; name: string; costInput: number; costOutput: number; contextWindow: number; reasoning: boolean }>> = {
      'openrouter': [
        // Top 10 expensive
        { id: 'anthropic/claude-opus-4.8', name: 'Claude Opus 4.8', costInput: 5, costOutput: 25, contextWindow: 1000000, reasoning: true },
        { id: 'anthropic/claude-opus-4.7', name: 'Claude Opus 4.7', costInput: 5, costOutput: 25, contextWindow: 1000000, reasoning: true },
        { id: 'xai/grok-4', name: 'Grok 4', costInput: 6, costOutput: 18, contextWindow: 256000, reasoning: true },
        { id: 'anthropic/claude-sonnet-4.6', name: 'Claude Sonnet 4.6', costInput: 3, costOutput: 15, contextWindow: 200000, reasoning: true },
        { id: 'openai/gpt-5.2-codex', name: 'GPT-5.2 Codex', costInput: 1.75, costOutput: 14, contextWindow: 400000, reasoning: false },
        { id: 'google/gemini-2.5-pro', name: 'Gemini 2.5 Pro', costInput: 1.25, costOutput: 10, contextWindow: 1048576, reasoning: true },
        { id: 'openai/o3', name: 'OpenAI o3', costInput: 2, costOutput: 8, contextWindow: 200000, reasoning: true },
        { id: 'mistralai/mistral-large', name: 'Mistral Large', costInput: 2, costOutput: 6, contextWindow: 131072, reasoning: false },
        { id: 'anthropic/claude-haiku-4.5', name: 'Claude Haiku 4.5', costInput: 1, costOutput: 5, contextWindow: 200000, reasoning: false },
        { id: 'cohere/command-r-plus', name: 'Command R+', costInput: 2.5, costOutput: 5, contextWindow: 128000, reasoning: false },
        { id: 'openai/o4-mini', name: 'OpenAI o4-mini', costInput: 1.1, costOutput: 4.4, contextWindow: 200000, reasoning: true },
        // Bottom 10 cheap
        { id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash', costInput: 0.3, costOutput: 2.5, contextWindow: 1048576, reasoning: false },
        { id: 'deepseek/deepseek-r1', name: 'DeepSeek R1', costInput: 0.55, costOutput: 2.19, contextWindow: 128000, reasoning: true },
        { id: 'openai/gpt-5-mini', name: 'GPT-5 Mini', costInput: 0.25, costOutput: 2, contextWindow: 400000, reasoning: false },
        { id: 'meta-llama/llama-4-maverick', name: 'Llama 4 Maverick', costInput: 0.2, costOutput: 0.6, contextWindow: 1000000, reasoning: false },
        { id: 'mistralai/mistral-small', name: 'Mistral Small', costInput: 0.1, costOutput: 0.3, contextWindow: 131072, reasoning: false },
        { id: 'google/gemma-3-27b', name: 'Gemma 3 27B', costInput: 0.1, costOutput: 0.2, contextWindow: 96000, reasoning: false },
        { id: 'qwen/qwen3-32b', name: 'Qwen3 32B', costInput: 0.08, costOutput: 0.18, contextWindow: 131072, reasoning: false },
        { id: 'deepseek/deepseek-chat-v3', name: 'DeepSeek V3', costInput: 0.07, costOutput: 0.14, contextWindow: 128000, reasoning: false },
        { id: 'meta-llama/llama-4-scout', name: 'Llama 4 Scout', costInput: 0.05, costOutput: 0.1, contextWindow: 512000, reasoning: false },
        { id: 'microsoft/phi-4', name: 'Phi-4', costInput: 0.03, costOutput: 0.05, contextWindow: 16384, reasoning: false },
      ],
      'groq': [
        { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B', costInput: 0.59, costOutput: 0.79, contextWindow: 131072, reasoning: false },
        { id: 'llama3-8b-8192', name: 'Llama 3 8B', costInput: 0.05, costOutput: 0.08, contextWindow: 8192, reasoning: false },
        { id: 'gemma2-9b-it', name: 'Gemma 2 9B', costInput: 0.2, costOutput: 0.2, contextWindow: 8192, reasoning: false },
      ],
      'mistral': [
        { id: 'mistral-large-2512', name: 'Mistral Large', costInput: 2, costOutput: 6, contextWindow: 131072, reasoning: false },
        { id: 'mistral-medium-3.1', name: 'Mistral Medium 3.1', costInput: 1, costOutput: 3, contextWindow: 131072, reasoning: false },
        { id: 'mistral-small-3.2-24b-instruct', name: 'Mistral Small 3.2', costInput: 0.1, costOutput: 0.3, contextWindow: 131072, reasoning: false },
      ],
      'deepseek': [
        { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', costInput: 0.56, costOutput: 1.68, contextWindow: 128000, reasoning: true },
        { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash', costInput: 0.14, costOutput: 0.42, contextWindow: 128000, reasoning: true },
      ],
      'xai': [
        { id: 'grok-4', name: 'Grok 4', costInput: 6, costOutput: 18, contextWindow: 256000, reasoning: true },
        { id: 'grok-4-fast', name: 'Grok 4 Fast', costInput: 3, costOutput: 9, contextWindow: 256000, reasoning: false },
        { id: 'grok-3-mini-beta', name: 'Grok 3 Mini', costInput: 0.3, costOutput: 0.5, contextWindow: 131072, reasoning: false },
      ],
      'cerebras': [
        { id: 'llama-3.3-70b', name: 'Llama 3.3 70B', costInput: 0.85, costOutput: 1.2, contextWindow: 8192, reasoning: false },
      ],
      'huggingface': [
        { id: 'meta-llama/Llama-3.3-70B-Instruct', name: 'Llama 3.3 70B', costInput: 0.5, costOutput: 0.7, contextWindow: 131072, reasoning: false },
      ],
      'azure-openai-responses': [
        { id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol', costInput: 5, costOutput: 30, contextWindow: 272000, reasoning: true },
        { id: 'gpt-5.6-terra', name: 'GPT-5.6 Terra', costInput: 2.5, costOutput: 15, contextWindow: 272000, reasoning: true },
        { id: 'gpt-5.6-luna', name: 'GPT-5.6 Luna', costInput: 1, costOutput: 6, contextWindow: 272000, reasoning: true },
        { id: 'gpt-5.2', name: 'GPT-5.2', costInput: 1.75, costOutput: 14, contextWindow: 400000, reasoning: false },
        { id: 'gpt-4o', name: 'GPT-4o', costInput: 2.5, costOutput: 10, contextWindow: 128000, reasoning: false },
        { id: 'gpt-4o-mini', name: 'GPT-4o Mini', costInput: 0.15, costOutput: 0.6, contextWindow: 128000, reasoning: false },
      ],
      'amazon-bedrock': [
        { id: 'anthropic.claude-opus-4.8', name: 'Claude Opus 4.8', costInput: 5, costOutput: 25, contextWindow: 1000000, reasoning: true },
        { id: 'anthropic.claude-opus-4.7', name: 'Claude Opus 4.7', costInput: 5, costOutput: 25, contextWindow: 1000000, reasoning: true },
        { id: 'anthropic.claude-sonnet-4.6', name: 'Claude Sonnet 4.6', costInput: 3, costOutput: 15, contextWindow: 200000, reasoning: true },
        { id: 'anthropic.claude-haiku-4.5', name: 'Claude Haiku 4.5', costInput: 1, costOutput: 5, contextWindow: 200000, reasoning: false },
      ],
      'zai': [
        { id: 'glm-5', name: 'GLM-5', costInput: 1, costOutput: 3.2, contextWindow: 128000, reasoning: true },
        { id: 'glm-4.7', name: 'GLM-4.7', costInput: 0.6, costOutput: 2.2, contextWindow: 128000, reasoning: false },
        { id: 'glm-4.7-flash', name: 'GLM-4.7 Flash', costInput: 0, costOutput: 0, contextWindow: 128000, reasoning: false },
      ],
      'vercel-ai-gateway': [
        { id: 'anthropic/claude-opus-4.8', name: 'Claude Opus 4.8', costInput: 5, costOutput: 25, contextWindow: 1000000, reasoning: true },
        { id: 'anthropic/claude-opus-4.7', name: 'Claude Opus 4.7', costInput: 5, costOutput: 25, contextWindow: 1000000, reasoning: true },
        { id: 'anthropic/claude-sonnet-4.6', name: 'Claude Sonnet 4.6', costInput: 3, costOutput: 15, contextWindow: 200000, reasoning: true },
        { id: 'openai/gpt-5.2-codex', name: 'GPT-5.2 Codex', costInput: 1.75, costOutput: 14, contextWindow: 400000, reasoning: false },
      ],
    }
    const models = MOCK_MODELS[provider] ?? []
    // Simulate the IPC handler's totalCount — openrouter and vercel have many more in reality
    const MOCK_TOTAL_COUNTS: Record<string, number> = { 'openrouter': 233, 'vercel-ai-gateway': 129, 'amazon-bedrock': 79 }
    return { models, totalCount: MOCK_TOTAL_COUNTS[provider] ?? models.length }
  },

  // ------------------------------------------------------------------
  // Messaging Gateway (Lark + WeChat)
  // ------------------------------------------------------------------

  getMessagingConfig: async () => {
    console.log('[Playground] getMessagingConfig called')
    return {
      enabled: true,
      platforms: {
        lark: { enabled: true },
        wechat: { enabled: true },
      },
      runtime: {
        lark: messagingMockState.runtime.lark,
        wechat: messagingMockState.runtime.wechat,
      },
    }
  },

  updateMessagingConfig: async (config: Record<string, unknown>) => {
    console.log('[Playground] updateMessagingConfig called:', config)
  },

  disconnectMessagingPlatform: async (platform: string) => {
    console.log('[Playground] disconnectMessagingPlatform called:', platform)
    if (platform === 'lark') playgroundMessagingHandle.setLarkConnected(false)
    if (platform === 'wechat') playgroundMessagingHandle.setWeChatConnected(false)
  },

  forgetMessagingPlatform: async (platform: string) => {
    console.log('[Playground] forgetMessagingPlatform called:', platform)
    if (platform === 'lark') playgroundMessagingHandle.setLarkConnected(false)
    if (platform === 'wechat') playgroundMessagingHandle.setWeChatConnected(false)
    // Drop bindings for that platform
    playgroundMessagingHandle.setBindings(
      messagingMockState.bindings.filter((b) => b.platform !== platform),
    )
  },

  getMessagingBindings: async () => {
    console.log('[Playground] getMessagingBindings called')
    return messagingMockState.bindings
  },

  generateMessagingPairingCode: async (sessionId: string, platform: string) => {
    console.log('[Playground] generateMessagingPairingCode called:', { sessionId, platform })
    return {
      code: '482193',
      expiresAt: Date.now() + 5 * 60_000,
      botUsername: undefined,
    }
  },

  unbindMessagingSession: async (sessionId: string, platform?: string) => {
    console.log('[Playground] unbindMessagingSession called:', { sessionId, platform })
    playgroundMessagingHandle.setBindings(
      messagingMockState.bindings.filter((b) => {
        if (b.sessionId !== sessionId) return true
        if (platform && b.platform !== platform) return true
        return false
      }),
    )
  },

  unbindMessagingBinding: async (bindingId: string) => {
    console.log('[Playground] unbindMessagingBinding called:', bindingId)
    playgroundMessagingHandle.setBindings(
      messagingMockState.bindings.filter((b) => b.id !== bindingId),
    )
    return { success: true }
  },

  // ------------------------------------------------------------------
  // Messaging access control (mirrors the production ElectronAPI surface)
  // ------------------------------------------------------------------

  getMessagingPlatformOwners: async (platform: AllowListPlatform): Promise<PlatformOwner[]> => {
    console.log('[Playground] getMessagingPlatformOwners called:', platform)
    return [...messagingMockState.allowList[platform].owners]
  },

  setMessagingPlatformOwners: async (
    platform: AllowListPlatform,
    owners: PlatformOwner[],
  ): Promise<PlatformOwner[]> => {
    console.log('[Playground] setMessagingPlatformOwners called:', platform, owners.length)
    playgroundAllowListHandle.setOwners(platform, owners)
    return [...owners]
  },

  getMessagingPlatformAccessMode: async (platform: AllowListPlatform): Promise<PlatformAccessMode> => {
    console.log('[Playground] getMessagingPlatformAccessMode called:', platform)
    return messagingMockState.allowList[platform].accessMode
  },

  setMessagingPlatformAccessMode: async (
    platform: AllowListPlatform,
    mode: PlatformAccessMode,
  ) => {
    console.log('[Playground] setMessagingPlatformAccessMode called:', platform, mode)
    playgroundAllowListHandle.setAccessMode(platform, mode)
    return { success: true }
  },

  getMessagingPendingSenders: async (platform?: AllowListPlatform): Promise<PendingSender[]> => {
    console.log('[Playground] getMessagingPendingSenders called:', platform)
    if (!platform) {
      return [
        ...messagingMockState.allowList.lark.pending,
        ...messagingMockState.allowList.wechat.pending,
      ]
    }
    return [...messagingMockState.allowList[platform].pending]
  },

  dismissMessagingPendingSender: async (
    platform: AllowListPlatform,
    userId: string,
    opts?: { reason?: string; bindingId?: string },
  ) => {
    console.log('[Playground] dismissMessagingPendingSender called:', platform, userId, opts)
    const next = messagingMockState.allowList[platform].pending.filter((s) => {
      if (s.userId !== userId) return true
      if (opts?.reason !== undefined && (s.reason ?? 'not-owner') !== opts.reason) return true
      if (opts?.bindingId !== undefined && s.bindingId !== opts.bindingId) return true
      return false
    })
    playgroundAllowListHandle.setPending(platform, next)
    return { success: true }
  },

  allowMessagingPendingSender: async (
    platform: AllowListPlatform,
    userId: string,
    entryKey?: { reason?: string; bindingId?: string },
  ): Promise<{ owners: PlatformOwner[]; bindingId?: string }> => {
    console.log('[Playground] allowMessagingPendingSender called:', platform, userId, entryKey)
    const state = messagingMockState.allowList[platform]
    const match = state.pending.find((p) =>
      p.userId === userId &&
      (entryKey?.reason === undefined || (p.reason ?? 'not-owner') === entryKey.reason) &&
      (entryKey?.bindingId === undefined || p.bindingId === entryKey.bindingId),
    )
    if (!match) throw new Error('Pending sender not found')

    const reason = match.reason ?? 'not-owner'
    if (reason === 'not-on-binding-allowlist' && match.bindingId) {
      // Binding-scoped allow — don't promote to workspace owner.
      const access = state.bindings[match.bindingId] ?? {
        mode: 'allow-list' as const,
        allowedSenderIds: [],
      }
      const next = {
        mode: 'allow-list' as const,
        allowedSenderIds: Array.from(new Set([...access.allowedSenderIds, userId])),
      }
      playgroundAllowListHandle.setBindingAccess(platform, match.bindingId, next)
      playgroundAllowListHandle.setPending(
        platform,
        state.pending.filter(
          (p) => !(p.userId === userId && p.bindingId === match.bindingId),
        ),
      )
      return { owners: [...state.owners], bindingId: match.bindingId }
    }

    // 'not-owner' branch: promote to workspace owner.
    const owner: PlatformOwner = {
      userId: match.userId,
      ...(match.displayName ? { displayName: match.displayName } : {}),
      ...(match.username ? { username: match.username } : {}),
      addedAt: Date.now(),
    }
    const nextOwners = [...state.owners.filter((o) => o.userId !== userId), owner]
    playgroundAllowListHandle.setOwners(platform, nextOwners)
    playgroundAllowListHandle.setPending(
      platform,
      state.pending.filter((p) => p.userId !== userId),
    )
    return { owners: nextOwners }
  },

  setMessagingBindingAccess: async (
    bindingId: string,
    access: BindingAccess,
  ) => {
    console.log('[Playground] setMessagingBindingAccess called:', bindingId)
    // Playground stores binding access keyed under lark by default —
    // production records the binding's platform server-side, so the mock
    // doesn't need to be platform-aware to exercise the UI.
    playgroundAllowListHandle.setBindingAccess('lark', bindingId, access)
    return { success: true }
  },

  onMessagingPendingChanged: (_callback: (workspaceId: string) => void) => {
    // No-op listener; Phase 3 binding-changed events refresh state already.
    return () => {}
  },

  onMessagingBindingChanged: (callback: (workspaceId: string) => void) => {
    messagingMockState.bindingListeners.add(callback)
    return () => {
      messagingMockState.bindingListeners.delete(callback)
    }
  },

  onMessagingPlatformStatus: (
    callback: (
      workspaceId: string,
      platform: string,
      status: MessagingPlatformRuntimeInfo,
    ) => void,
  ) => {
    messagingMockState.platformStatusListeners.add(callback)
    return () => {
      messagingMockState.platformStatusListeners.delete(callback)
    }
  },
}

/**
 * Inject mock electronAPI into window if not already present.
 * Call this in playground component wrappers before rendering components
 * that depend on electronAPI.
 *
 * IMPORTANT: this also runs as a top-level side effect when this module is
 * imported (see below), so that consumers relying on a synchronous
 * `window.electronAPI.*` read at module-load time (e.g.
 * `SessionFilesSection.tsx`'s top-level `getRuntimeEnvironment()` call) see
 * the mock before their module is evaluated. The entry `playground.tsx`
 * must import this module before any component chain that touches
 * `window.electronAPI` at import time.
 */
export function ensureMockElectronAPI() {
  if (!window.electronAPI) {
    ;(window as any).electronAPI = mockElectronAPI
    console.log('[Playground] Injected mock electronAPI')
  }
  if (!(window as any).__playgroundMessaging) {
    ;(window as any).__playgroundMessaging = playgroundMessagingHandle
    console.log('[Playground] Exposed __playgroundMessaging handle')
  }
  if (!(window as any).__playgroundAllowList) {
    ;(window as any).__playgroundAllowList = playgroundAllowListHandle
    console.log('[Playground] Exposed __playgroundAllowList handle')
  }
}

// Install on import so any later module that reads `window.electronAPI` at
// top level finds the mock in place. Safe: only runs once (idempotent).
ensureMockElectronAPI()

// ============================================================================
// Sample Data
// ============================================================================

export const mockSources: LoadedSource[] = [
  {
    config: {
      id: 'github-api-1',
      slug: 'github-api',
      name: 'GitHub API',
      provider: 'github',
      type: 'api',
      enabled: true,
      api: {
        baseUrl: 'https://api.github.com',
        authType: 'bearer',
      },
      icon: 'https://www.google.com/s2/favicons?domain=github.com&sz=128',
      tagline: 'Access repositories, issues, and pull requests',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    guide: null,
    folderPath: '/mock/sources/github-api',
    workspaceRootPath: '/mock/workspaces/playground-workspace',
    workspaceId: 'playground-workspace',
  },
  {
    config: {
      id: 'linear-api-1',
      slug: 'linear-api',
      name: 'Linear',
      provider: 'linear',
      type: 'api',
      enabled: true,
      api: {
        baseUrl: 'https://api.linear.app',
        authType: 'bearer',
      },
      icon: 'https://www.google.com/s2/favicons?domain=linear.app&sz=128',
      tagline: 'Issue tracking and project management',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    guide: null,
    folderPath: '/mock/sources/linear-api',
    workspaceRootPath: '/mock/workspaces/playground-workspace',
    workspaceId: 'playground-workspace',
  },
  {
    config: {
      id: 'local-files-1',
      slug: 'local-files',
      name: 'Local Files',
      provider: 'filesystem',
      type: 'local',
      enabled: true,
      local: {
        path: '/Users/demo/projects',
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    guide: null,
    folderPath: '/mock/sources/local-files',
    workspaceRootPath: '/mock/workspaces/playground-workspace',
    workspaceId: 'playground-workspace',
  },
]

export const sampleImageAttachment: FileAttachment = {
  type: 'image',
  path: '/Users/demo/screenshot.png',
  name: 'screenshot.png',
  mimeType: 'image/png',
  size: 245000,
  base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
}

export const samplePdfAttachment: FileAttachment = {
  type: 'pdf',
  path: '/Users/demo/design.pdf',
  name: 'design.pdf',
  mimeType: 'application/pdf',
  size: 1024000,
}

export const sampleFolderAttachment: FileAttachment = {
  type: 'unknown',
  kind: 'folder',
  path: '/Users/demo/CraftAgent',
  name: 'CraftAgent',
  mimeType: 'inode/directory',
  size: 0,
}

// ============================================================================
// Mock Callbacks
// ============================================================================

export const mockInputCallbacks = {
  onSubmit: (message: string, attachments?: FileAttachment[]) => {
    console.log('[Playground] Message submitted:', { message, attachments })
  },

  onModelChange: (model: string) => {
    console.log('[Playground] Model changed to:', model)
  },

  onInputChange: (value: string) => {
    console.log('[Playground] Input changed:', value.substring(0, 50) + (value.length > 50 ? '...' : ''))
  },

  onHeightChange: (height: number) => {
    console.log('[Playground] Height changed:', height)
  },

  onFocusChange: (focused: boolean) => {
    console.log('[Playground] Focus changed:', focused)
  },

  onPermissionModeChange: (mode: PermissionMode) => {
    console.log('[Playground] Permission mode changed:', mode)
  },

  onSourcesChange: (slugs: string[]) => {
    console.log('[Playground] Sources changed:', slugs)
  },

  onWorkingDirectoryChange: (path: string) => {
    console.log('[Playground] Working directory changed:', path)
  },

  onStop: () => {
    console.log('[Playground] Stop requested')
  },
}

export const mockAttachmentCallbacks = {
  onRemove: (index: number) => {
    console.log('[Playground] Remove attachment at index:', index)
  },

  onOpenFile: (path: string) => {
    console.log('[Playground] Open file:', path)
  },
}

export const mockBackgroundTaskCallbacks = {
  onKillTask: (taskId: string) => {
    console.log('[Playground] Kill task:', taskId)
  },
}
