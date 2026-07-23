/**
 * Channel map — maps ElectronAPI method names to IPC channels.
 *
 * Derived from preload/index.ts. This is the single source of truth for
 * the method→channel mapping used by buildClientApi().
 */

import { RPC_CHANNELS } from '../shared/types'
import type { ChannelMap } from './build-api'

function invoke(channel: string, transform?: (result: any) => any) {
  return { type: 'invoke' as const, channel, ...(transform && { transform }) }
}

function listener(channel: string) {
  return { type: 'listener' as const, channel }
}

export const CHANNEL_MAP = {
  // Session management
  getSessions: invoke(RPC_CHANNELS.sessions.GET),
  getUnreadSummary: invoke(RPC_CHANNELS.sessions.GET_UNREAD_SUMMARY),
  markAllSessionsRead: invoke(RPC_CHANNELS.sessions.MARK_ALL_READ),
  getSessionMessages: invoke(RPC_CHANNELS.sessions.GET_MESSAGES),
  createSession: invoke(RPC_CHANNELS.sessions.CREATE),
  deleteSession: invoke(RPC_CHANNELS.sessions.DELETE),
  sendMessage: invoke(RPC_CHANNELS.sessions.SEND_MESSAGE),
  generateExploreBrief: invoke(RPC_CHANNELS.sessions.GENERATE_EXPLORE_BRIEF),
  cancelProcessing: invoke(RPC_CHANNELS.sessions.CANCEL),
  killShell: invoke(RPC_CHANNELS.sessions.KILL_SHELL),
  getTaskOutput: invoke(RPC_CHANNELS.tasks.GET_OUTPUT),

  // Tasks (Conductor)
  validateTask: invoke(RPC_CHANNELS.tasks.VALIDATE),
  createTask: invoke(RPC_CHANNELS.tasks.CREATE),
  generateTask: invoke(RPC_CHANNELS.tasks.GENERATE),
  runTask: invoke(RPC_CHANNELS.tasks.RUN),
  pauseTask: invoke(RPC_CHANNELS.tasks.PAUSE),
  resumeTask: invoke(RPC_CHANNELS.tasks.RESUME),
  stopTask: invoke(RPC_CHANNELS.tasks.STOP),
  getTask: invoke(RPC_CHANNELS.tasks.GET),
  listTasks: invoke(RPC_CHANNELS.tasks.LIST),
  getTaskResults: invoke(RPC_CHANNELS.tasks.GET_RESULTS),
  onTaskGenerated: listener(RPC_CHANNELS.tasks.GENERATED),
  respondToPermission: invoke(RPC_CHANNELS.sessions.RESPOND_TO_PERMISSION),
  respondToCredential: invoke(RPC_CHANNELS.sessions.RESPOND_TO_CREDENTIAL),
  sessionCommand: invoke(RPC_CHANNELS.sessions.COMMAND),
  exportSession: invoke(RPC_CHANNELS.sessions.EXPORT),
  importSession: invoke(RPC_CHANNELS.sessions.IMPORT),
  exportRemoteSessionTransfer: invoke(RPC_CHANNELS.sessions.EXPORT_REMOTE_TRANSFER),
  importRemoteSessionTransfer: invoke(RPC_CHANNELS.sessions.IMPORT_REMOTE_TRANSFER),
  getPendingPlanExecution: invoke(RPC_CHANNELS.sessions.GET_PENDING_PLAN_EXECUTION),
  getSessionPermissionModeState: invoke(RPC_CHANNELS.sessions.GET_PERMISSION_MODE_STATE),

  // Event listeners
  onSessionEvent: listener(RPC_CHANNELS.sessions.EVENT),
  onUnreadSummaryChanged: listener(RPC_CHANNELS.sessions.UNREAD_SUMMARY_CHANGED),

  // Transport reliability
  onReconnected: listener('__transport:reconnected'),

  // Workspace management
  getWorkspaces: invoke(RPC_CHANNELS.workspaces.GET),
  createWorkspace: invoke(RPC_CHANNELS.workspaces.CREATE),
  checkWorkspaceSlug: invoke(RPC_CHANNELS.workspaces.CHECK_SLUG),
  updateWorkspaceRemoteServer: invoke(RPC_CHANNELS.workspaces.UPDATE_REMOTE),
  testRemoteConnection: invoke(RPC_CHANNELS.remote.TEST_CONNECTION),

  // Server-level workspace operations (REMOTE_ELIGIBLE)
  getServerWorkspaces: invoke(RPC_CHANNELS.server.GET_WORKSPACES),
  createServerWorkspace: invoke(RPC_CHANNELS.server.CREATE_WORKSPACE),

  // Window management
  getWindowWorkspace: invoke(RPC_CHANNELS.window.GET_WORKSPACE),
  getWindowMode: invoke(RPC_CHANNELS.window.GET_MODE),
  openWorkspace: invoke(RPC_CHANNELS.window.OPEN_WORKSPACE),
  openSessionInNewWindow: invoke(RPC_CHANNELS.window.OPEN_SESSION_IN_NEW_WINDOW),
  switchWorkspace: invoke(RPC_CHANNELS.window.SWITCH_WORKSPACE),
  closeWindow: invoke(RPC_CHANNELS.window.CLOSE),
  confirmCloseWindow: invoke(RPC_CHANNELS.window.CONFIRM_CLOSE),
  cancelCloseWindow: invoke(RPC_CHANNELS.window.CANCEL_CLOSE),
  onCloseRequested: listener(RPC_CHANNELS.window.CLOSE_REQUESTED),
  setTrafficLightsVisible: invoke(RPC_CHANNELS.window.SET_TRAFFIC_LIGHTS),

  // File operations
  readFile: invoke(RPC_CHANNELS.file.READ),
  readFileDataUrl: invoke(RPC_CHANNELS.file.READ_DATA_URL),
  readFilePreviewDataUrl: invoke(RPC_CHANNELS.file.READ_PREVIEW_DATA_URL),
  readFileBinary: invoke(RPC_CHANNELS.file.READ_BINARY),
  readWidgetFile: invoke(RPC_CHANNELS.file.READ_WIDGET),
  readMcpWidgetResource: invoke(RPC_CHANNELS.widgets.READ_MCP_RESOURCE),
  callMcpWidgetTool: invoke(RPC_CHANNELS.widgets.CALL_MCP_TOOL),
  openFileDialog: invoke(RPC_CHANNELS.file.OPEN_DIALOG),
  readFileAttachment: invoke(RPC_CHANNELS.file.READ_ATTACHMENT),
  readUserAttachment: invoke(RPC_CHANNELS.file.READ_USER_ATTACHMENT),
  storeAttachment: invoke(RPC_CHANNELS.file.STORE_ATTACHMENT),
  generateThumbnail: invoke(RPC_CHANNELS.file.GENERATE_THUMBNAIL),

  // Theme
  getSystemTheme: invoke(RPC_CHANNELS.theme.GET_SYSTEM_PREFERENCE),
  onSystemThemeChange: listener(RPC_CHANNELS.theme.SYSTEM_CHANGED),

  // System
  getVersions: invoke(RPC_CHANNELS.system.VERSIONS),
  getHomeDir: invoke(RPC_CHANNELS.system.HOME_DIR),
  isDebugMode: invoke(RPC_CHANNELS.system.IS_DEBUG_MODE),
  exportDiagnostics: invoke(RPC_CHANNELS.system.EXPORT_DIAGNOSTICS),

  // Auto-update
  checkForUpdates: invoke(RPC_CHANNELS.update.CHECK),
  getUpdateInfo: invoke(RPC_CHANNELS.update.GET_INFO),
  installUpdate: invoke(RPC_CHANNELS.update.INSTALL),
  dismissUpdate: invoke(RPC_CHANNELS.update.DISMISS),
  getDismissedUpdateVersion: invoke(RPC_CHANNELS.update.GET_DISMISSED),
  onUpdateAvailable: listener(RPC_CHANNELS.update.AVAILABLE),
  onUpdateDownloadProgress: listener(RPC_CHANNELS.update.DOWNLOAD_PROGRESS),

  // Release notes
  getReleaseNotes: invoke(RPC_CHANNELS.releaseNotes.GET),
  getLatestReleaseVersion: invoke(RPC_CHANNELS.releaseNotes.GET_LATEST_VERSION),

  // Shell operations
  openUrl: invoke(RPC_CHANNELS.shell.OPEN_URL),
  openFile: invoke(RPC_CHANNELS.shell.OPEN_FILE),
  showInFolder: invoke(RPC_CHANNELS.shell.SHOW_IN_FOLDER),
  openTerminal: invoke(RPC_CHANNELS.shell.OPEN_TERMINAL),

  // Menu event listeners
  onMenuNewChat: listener(RPC_CHANNELS.menu.NEW_CHAT),
  onMenuOpenSettings: listener(RPC_CHANNELS.menu.OPEN_SETTINGS),
  onMenuKeyboardShortcuts: listener(RPC_CHANNELS.menu.KEYBOARD_SHORTCUTS),
  onMenuToggleFocusMode: listener(RPC_CHANNELS.menu.TOGGLE_FOCUS_MODE),
  onMenuToggleSidebar: listener(RPC_CHANNELS.menu.TOGGLE_SIDEBAR),
  onMenuToggleSessionList: listener(RPC_CHANNELS.menu.TOGGLE_SESSION_LIST),

  // Deep link
  onDeepLinkNavigate: listener(RPC_CHANNELS.deeplink.NAVIGATE),

  // Auth
  showLogoutConfirmation: invoke(RPC_CHANNELS.auth.SHOW_LOGOUT_CONFIRMATION),
  showDeleteSessionConfirmation: invoke(RPC_CHANNELS.auth.SHOW_DELETE_SESSION_CONFIRMATION),
  logout: invoke(RPC_CHANNELS.auth.LOGOUT),
  getCredentialHealth: invoke(RPC_CHANNELS.credentials.HEALTH_CHECK),

  // Onboarding
  getAuthState: invoke(RPC_CHANNELS.onboarding.GET_AUTH_STATE),
  getSetupNeeds: invoke(RPC_CHANNELS.onboarding.GET_AUTH_STATE, (r) => r.setupNeeds),
  startWorkspaceMcpOAuth: invoke(RPC_CHANNELS.onboarding.START_MCP_OAUTH),
  startClaudeOAuth: invoke(RPC_CHANNELS.onboarding.START_CLAUDE_OAUTH),
  exchangeClaudeCode: invoke(RPC_CHANNELS.onboarding.EXCHANGE_CLAUDE_CODE),
  hasClaudeOAuthState: invoke(RPC_CHANNELS.onboarding.HAS_CLAUDE_OAUTH_STATE),
  clearClaudeOAuthState: invoke(RPC_CHANNELS.onboarding.CLEAR_CLAUDE_OAUTH_STATE),
  deferSetup: invoke(RPC_CHANNELS.onboarding.DEFER_SETUP),

  // ChatGPT OAuth
  startChatGptOAuth: invoke(RPC_CHANNELS.chatgpt.START_OAUTH),
  cancelChatGptOAuth: invoke(RPC_CHANNELS.chatgpt.CANCEL_OAUTH),
  getChatGptAuthStatus: invoke(RPC_CHANNELS.chatgpt.GET_AUTH_STATUS),
  chatGptLogout: invoke(RPC_CHANNELS.chatgpt.LOGOUT),

  // GitHub Copilot OAuth
  startCopilotOAuth: invoke(RPC_CHANNELS.copilot.START_OAUTH),
  cancelCopilotOAuth: invoke(RPC_CHANNELS.copilot.CANCEL_OAUTH),
  getCopilotAuthStatus: invoke(RPC_CHANNELS.copilot.GET_AUTH_STATUS),
  copilotLogout: invoke(RPC_CHANNELS.copilot.LOGOUT),
  onCopilotDeviceCode: listener(RPC_CHANNELS.copilot.DEVICE_CODE),

  // Server info (REMOTE_ELIGIBLE)
  getServerHomeDir: invoke(RPC_CHANNELS.server.HOME_DIR),

  // Server mode configuration
  getServerConfig: invoke(RPC_CHANNELS.settings.GET_SERVER_CONFIG),
  setServerConfig: invoke(RPC_CHANNELS.settings.SET_SERVER_CONFIG),
  getServerStatus: invoke(RPC_CHANNELS.settings.GET_SERVER_STATUS),

  // Settings - API Setup
  setupLlmConnection: invoke(RPC_CHANNELS.settings.SETUP_LLM_CONNECTION),
  testLlmConnectionSetup: invoke(RPC_CHANNELS.settings.TEST_LLM_CONNECTION_SETUP),
  getDefaultThinkingLevel: invoke(RPC_CHANNELS.settings.GET_DEFAULT_THINKING_LEVEL),
  setDefaultThinkingLevel: invoke(RPC_CHANNELS.settings.SET_DEFAULT_THINKING_LEVEL),
  getNetworkProxySettings: invoke(RPC_CHANNELS.settings.GET_NETWORK_PROXY),
  setNetworkProxySettings: invoke(RPC_CHANNELS.settings.SET_NETWORK_PROXY),

  // Pi provider discovery
  getPiApiKeyProviders: invoke(RPC_CHANNELS.pi.GET_API_KEY_PROVIDERS),
  getPiProviderBaseUrl: invoke(RPC_CHANNELS.pi.GET_PROVIDER_BASE_URL),
  getPiProviderModels: invoke(RPC_CHANNELS.pi.GET_PROVIDER_MODELS),

  // Session-specific model
  getSessionModel: invoke(RPC_CHANNELS.sessions.GET_MODEL),
  setSessionModel: invoke(RPC_CHANNELS.sessions.SET_MODEL),

  // Workspace Settings
  getWorkspaceSettings: invoke(RPC_CHANNELS.workspace.SETTINGS_GET),
  updateWorkspaceSetting: invoke(RPC_CHANNELS.workspace.SETTINGS_UPDATE),

  // Folder dialog
  openFolderDialog: invoke(RPC_CHANNELS.dialog.OPEN_FOLDER),

  // Filesystem search
  searchFiles: invoke(RPC_CHANNELS.fs.SEARCH),

  // Server filesystem browsing (remote mode)
  listServerDirectory: invoke(RPC_CHANNELS.fs.LIST_DIRECTORY),

  // Debug logging
  debugLog: invoke(RPC_CHANNELS.debug.LOG),

  // User Preferences
  readPreferences: invoke(RPC_CHANNELS.preferences.READ),
  writePreferences: invoke(RPC_CHANNELS.preferences.WRITE),

  // Session Drafts
  getDraft: invoke(RPC_CHANNELS.drafts.GET),
  setDraft: invoke(RPC_CHANNELS.drafts.SET),
  deleteDraft: invoke(RPC_CHANNELS.drafts.DELETE),
  getAllDrafts: invoke(RPC_CHANNELS.drafts.GET_ALL),

  // Session Info Panel
  getSessionFiles: invoke(RPC_CHANNELS.sessions.GET_FILES),
  getSessionNotes: invoke(RPC_CHANNELS.sessions.GET_NOTES),
  setSessionNotes: invoke(RPC_CHANNELS.sessions.SET_NOTES),
  watchSessionFiles: invoke(RPC_CHANNELS.sessions.WATCH_FILES),
  unwatchSessionFiles: invoke(RPC_CHANNELS.sessions.UNWATCH_FILES),
  onSessionFilesChanged: listener(RPC_CHANNELS.sessions.FILES_CHANGED),

  // Sources
  getSources: invoke(RPC_CHANNELS.sources.GET),
  createSource: invoke(RPC_CHANNELS.sources.CREATE),
  deleteSource: invoke(RPC_CHANNELS.sources.DELETE),
  startSourceOAuth: invoke(RPC_CHANNELS.sources.START_OAUTH),
  saveSourceCredentials: invoke(RPC_CHANNELS.sources.SAVE_CREDENTIALS),
  getSourcePermissionsConfig: invoke(RPC_CHANNELS.sources.GET_PERMISSIONS),
  getWorkspacePermissionsConfig: invoke(RPC_CHANNELS.workspace.GET_PERMISSIONS),
  getDefaultPermissionsConfig: invoke(RPC_CHANNELS.permissions.GET_DEFAULTS),
  onDefaultPermissionsChanged: listener(RPC_CHANNELS.permissions.DEFAULTS_CHANGED),
  getMcpTools: invoke(RPC_CHANNELS.sources.GET_MCP_TOOLS),

  // Session content search
  searchSessionContent: invoke(RPC_CHANNELS.sessions.SEARCH_CONTENT),

  // OAuth (server-owned credentials)
  oauthRevoke: invoke(RPC_CHANNELS.oauth.REVOKE),
  getOAuthApp: invoke(RPC_CHANNELS.oauth.APP_GET),
  setOAuthApp: invoke(RPC_CHANNELS.oauth.APP_SET),
  deleteOAuthApp: invoke(RPC_CHANNELS.oauth.APP_DELETE),

  // Sources change listener
  onSourcesChanged: listener(RPC_CHANNELS.sources.CHANGED),

  // Skills
  getSkills: invoke(RPC_CHANNELS.skills.GET),
  getSkillFiles: invoke(RPC_CHANNELS.skills.GET_FILES),
  deleteSkill: invoke(RPC_CHANNELS.skills.DELETE),
  openSkillInEditor: invoke(RPC_CHANNELS.skills.OPEN_EDITOR),
  openSkillInFinder: invoke(RPC_CHANNELS.skills.OPEN_FINDER),
  onSkillsChanged: listener(RPC_CHANNELS.skills.CHANGED),

  // Plugins
  listPlugins: invoke(RPC_CHANNELS.plugins.LIST),
  getPluginPolicies: invoke(RPC_CHANNELS.plugins.GET_POLICIES),
  setPluginPolicy: invoke(RPC_CHANNELS.plugins.SET_POLICY),
  getPluginMcpStatus: invoke(RPC_CHANNELS.plugins.GET_MCP_STATUS),
  getPluginAuthStatus: invoke(RPC_CHANNELS.plugins.GET_AUTH_STATUS),
  diagnosePluginMcp: invoke(RPC_CHANNELS.plugins.DIAGNOSE_MCP),
  installGitPlugin: invoke(RPC_CHANNELS.plugins.INSTALL_GIT),
  listPluginMarketplaceSources: invoke(RPC_CHANNELS.plugins.LIST_MARKETPLACE_SOURCES),
  addPluginMarketplaceSource: invoke(RPC_CHANNELS.plugins.ADD_MARKETPLACE_SOURCE),
  removePluginMarketplaceSource: invoke(RPC_CHANNELS.plugins.REMOVE_MARKETPLACE_SOURCE),
  getPluginMarketplaceCatalog: invoke(RPC_CHANNELS.plugins.GET_MARKETPLACE_CATALOG),
  installMarketplacePlugin: invoke(RPC_CHANNELS.plugins.INSTALL_MARKETPLACE_PLUGIN),
  connectPluginNativeSource: invoke(RPC_CHANNELS.plugins.CONNECT_NATIVE_SOURCE),
  registerLocalPlugin: invoke(RPC_CHANNELS.plugins.REGISTER_LOCAL),
  setPluginEnabled: invoke(RPC_CHANNELS.plugins.SET_ENABLED),
  unregisterPlugin: invoke(RPC_CHANNELS.plugins.UNREGISTER),
  removeManagedPlugin: invoke(RPC_CHANNELS.plugins.REMOVE_MANAGED),
  onPluginsChanged: listener(RPC_CHANNELS.plugins.CHANGED),

  // Statuses
  listStatuses: invoke(RPC_CHANNELS.statuses.LIST),
  reorderStatuses: invoke(RPC_CHANNELS.statuses.REORDER),
  onStatusesChanged: listener(RPC_CHANNELS.statuses.CHANGED),

  // Labels
  listLabels: invoke(RPC_CHANNELS.labels.LIST),
  createLabel: invoke(RPC_CHANNELS.labels.CREATE),
  deleteLabel: invoke(RPC_CHANNELS.labels.DELETE),
  onLabelsChanged: listener(RPC_CHANNELS.labels.CHANGED),

  // LLM connections change listener
  onLlmConnectionsChanged: listener(RPC_CHANNELS.llmConnections.CHANGED),

  // Views
  listViews: invoke(RPC_CHANNELS.views.LIST),
  saveViews: invoke(RPC_CHANNELS.views.SAVE),

  // Tool icon mappings
  getToolIconMappings: invoke(RPC_CHANNELS.toolIcons.GET_MAPPINGS),

  // Workspace images
  readWorkspaceImage: invoke(RPC_CHANNELS.workspace.READ_IMAGE),
  writeWorkspaceImage: invoke(RPC_CHANNELS.workspace.WRITE_IMAGE),

  // Theme
  getAppTheme: invoke(RPC_CHANNELS.theme.GET_APP),
  loadPresetThemes: invoke(RPC_CHANNELS.theme.GET_PRESETS),
  loadPresetTheme: invoke(RPC_CHANNELS.theme.LOAD_PRESET),
  getColorTheme: invoke(RPC_CHANNELS.theme.GET_COLOR_THEME),
  setColorTheme: invoke(RPC_CHANNELS.theme.SET_COLOR_THEME),
  getWorkspaceColorTheme: invoke(RPC_CHANNELS.theme.GET_WORKSPACE_COLOR_THEME),
  setWorkspaceColorTheme: invoke(RPC_CHANNELS.theme.SET_WORKSPACE_COLOR_THEME),
  getAllWorkspaceThemes: invoke(RPC_CHANNELS.theme.GET_ALL_WORKSPACE_THEMES),
  getLogoUrl: invoke(RPC_CHANNELS.logo.GET_URL),
  onAppThemeChange: listener(RPC_CHANNELS.theme.APP_CHANGED),
  broadcastThemePreferences: invoke(RPC_CHANNELS.theme.BROADCAST_PREFERENCES),
  onThemePreferencesChange: listener(RPC_CHANNELS.theme.PREFERENCES_CHANGED),
  broadcastWorkspaceThemeChange: invoke(RPC_CHANNELS.theme.BROADCAST_WORKSPACE_THEME),
  onWorkspaceThemeChange: listener(RPC_CHANNELS.theme.WORKSPACE_THEME_CHANGED),

  // Notifications
  showNotification: invoke(RPC_CHANNELS.notification.SHOW),
  getNotificationsEnabled: invoke(RPC_CHANNELS.notification.GET_ENABLED),
  setNotificationsEnabled: invoke(RPC_CHANNELS.notification.SET_ENABLED),

  // Input settings
  getAutoCapitalisation: invoke(RPC_CHANNELS.input.GET_AUTO_CAPITALISATION),
  setAutoCapitalisation: invoke(RPC_CHANNELS.input.SET_AUTO_CAPITALISATION),
  getSendMessageKey: invoke(RPC_CHANNELS.input.GET_SEND_MESSAGE_KEY),
  setSendMessageKey: invoke(RPC_CHANNELS.input.SET_SEND_MESSAGE_KEY),
  getSpellCheck: invoke(RPC_CHANNELS.input.GET_SPELL_CHECK),
  setSpellCheck: invoke(RPC_CHANNELS.input.SET_SPELL_CHECK),
  getOpenConversationScroll: invoke(RPC_CHANNELS.input.GET_OPEN_CONVERSATION_SCROLL),
  setOpenConversationScroll: invoke(RPC_CHANNELS.input.SET_OPEN_CONVERSATION_SCROLL),
  getRightSidebarMode: invoke(RPC_CHANNELS.input.GET_RIGHT_SIDEBAR_MODE),
  setRightSidebarMode: invoke(RPC_CHANNELS.input.SET_RIGHT_SIDEBAR_MODE),
  getRightSidebarFollowSession: invoke(RPC_CHANNELS.input.GET_RIGHT_SIDEBAR_FOLLOW_SESSION),
  setRightSidebarFollowSession: invoke(RPC_CHANNELS.input.SET_RIGHT_SIDEBAR_FOLLOW_SESSION),
  getBrowserOpenMode: invoke(RPC_CHANNELS.input.GET_BROWSER_OPEN_MODE),
  setBrowserOpenMode: invoke(RPC_CHANNELS.input.SET_BROWSER_OPEN_MODE),

  // Power settings
  getKeepAwakeWhileRunning: invoke(RPC_CHANNELS.power.GET_KEEP_AWAKE),
  setKeepAwakeWhileRunning: invoke(RPC_CHANNELS.power.SET_KEEP_AWAKE),

  // Appearance settings
  getRichToolDescriptions: invoke(RPC_CHANNELS.appearance.GET_RICH_TOOL_DESCRIPTIONS),
  setRichToolDescriptions: invoke(RPC_CHANNELS.appearance.SET_RICH_TOOL_DESCRIPTIONS),

  // Tools settings
  getBrowserToolEnabled: invoke(RPC_CHANNELS.tools.GET_BROWSER_TOOL_ENABLED),
  setBrowserToolEnabled: invoke(RPC_CHANNELS.tools.SET_BROWSER_TOOL_ENABLED),

  // Prompt caching & context
  getExtendedPromptCache: invoke(RPC_CHANNELS.caching.GET_EXTENDED_PROMPT_CACHE),
  setExtendedPromptCache: invoke(RPC_CHANNELS.caching.SET_EXTENDED_PROMPT_CACHE),
  getEnable1MContext: invoke(RPC_CHANNELS.caching.GET_ENABLE_1M_CONTEXT),
  setEnable1MContext: invoke(RPC_CHANNELS.caching.SET_ENABLE_1M_CONTEXT),

  // RTK token optimization
  getRtkEnabled: invoke(RPC_CHANNELS.rtk.GET_ENABLED),
  setRtkEnabled: invoke(RPC_CHANNELS.rtk.SET_ENABLED),
  getRtkStatus: invoke(RPC_CHANNELS.rtk.GET_STATUS),
  getRtkGain: invoke(RPC_CHANNELS.rtk.GET_GAIN),

  // Badge
  refreshBadge: invoke(RPC_CHANNELS.badge.REFRESH),
  setDockIconWithBadge: invoke(RPC_CHANNELS.badge.SET_ICON),
  onBadgeDraw: listener(RPC_CHANNELS.badge.DRAW),
  onBadgeDrawWindows: listener(RPC_CHANNELS.badge.DRAW_WINDOWS),

  // Window focus
  getWindowFocusState: invoke(RPC_CHANNELS.window.GET_FOCUS_STATE),
  onWindowFocusChange: listener(RPC_CHANNELS.window.FOCUS_STATE),
  onNotificationNavigate: listener(RPC_CHANNELS.notification.NAVIGATE),

  // Git
  getGitBranch: invoke(RPC_CHANNELS.git.GET_BRANCH),
  getGitStatus: invoke(RPC_CHANNELS.git.GET_STATUS),
  runGitAction: invoke(RPC_CHANNELS.git.RUN_ACTION),
  // Cognition Event Ledger (diagnostics)
  getCognitionStatus: invoke(RPC_CHANNELS.cognition.GET_STATUS),
  listCognitionEvents: invoke(RPC_CHANNELS.cognition.LIST_EVENTS),
  listCognitionObservations: invoke(RPC_CHANNELS.cognition.LIST_OBSERVATIONS),
  listCognitionLoops: invoke(RPC_CHANNELS.cognition.LIST_LOOPS),
  resolveCognitionLoop: invoke(RPC_CHANNELS.cognition.RESOLVE_LOOP),
  dismissCognitionLoop: invoke(RPC_CHANNELS.cognition.DISMISS_LOOP),
  listCognitionReflections: invoke(RPC_CHANNELS.cognition.LIST_REFLECTIONS),
  listCognitionGuidance: invoke(RPC_CHANNELS.cognition.LIST_GUIDANCE),
  dismissCognitionGuidance: invoke(RPC_CHANNELS.cognition.DISMISS_GUIDANCE),
  refreshCognitionGuidance: invoke(RPC_CHANNELS.cognition.REFRESH_GUIDANCE),
  clearCognitionEvents: invoke(RPC_CHANNELS.cognition.CLEAR),
  repairCognitionStore: invoke(RPC_CHANNELS.cognition.REPAIR),
  checkGitBash: invoke(RPC_CHANNELS.gitbash.CHECK),
  browseForGitBash: invoke(RPC_CHANNELS.gitbash.BROWSE),
  setGitBashPath: invoke(RPC_CHANNELS.gitbash.SET_PATH),

  // Menu actions
  menuQuit: invoke(RPC_CHANNELS.menu.QUIT),
  menuNewWindow: invoke(RPC_CHANNELS.menu.NEW_WINDOW),
  menuMinimize: invoke(RPC_CHANNELS.menu.MINIMIZE),
  menuMaximize: invoke(RPC_CHANNELS.menu.MAXIMIZE),
  menuZoomIn: invoke(RPC_CHANNELS.menu.ZOOM_IN),
  menuZoomOut: invoke(RPC_CHANNELS.menu.ZOOM_OUT),
  menuZoomReset: invoke(RPC_CHANNELS.menu.ZOOM_RESET),
  menuToggleDevTools: invoke(RPC_CHANNELS.menu.TOGGLE_DEV_TOOLS),
  menuUndo: invoke(RPC_CHANNELS.menu.UNDO),
  menuRedo: invoke(RPC_CHANNELS.menu.REDO),
  menuCut: invoke(RPC_CHANNELS.menu.CUT),
  menuCopy: invoke(RPC_CHANNELS.menu.COPY),
  menuPaste: invoke(RPC_CHANNELS.menu.PASTE),
  menuSelectAll: invoke(RPC_CHANNELS.menu.SELECT_ALL),

  // Browser pane management
  'browserPane.create': invoke(RPC_CHANNELS.browserPane.CREATE),
  'browserPane.destroy': invoke(RPC_CHANNELS.browserPane.DESTROY),
  'browserPane.list': invoke(RPC_CHANNELS.browserPane.LIST),
  'browserPane.navigate': invoke(RPC_CHANNELS.browserPane.NAVIGATE),
  'browserPane.goBack': invoke(RPC_CHANNELS.browserPane.GO_BACK),
  'browserPane.goForward': invoke(RPC_CHANNELS.browserPane.GO_FORWARD),
  'browserPane.reload': invoke(RPC_CHANNELS.browserPane.RELOAD),
  'browserPane.stop': invoke(RPC_CHANNELS.browserPane.STOP),
  'browserPane.focus': invoke(RPC_CHANNELS.browserPane.FOCUS),
  'browserPane.setEmbeddedBounds': invoke(RPC_CHANNELS.browserPane.SET_EMBEDDED_BOUNDS),
  'browserPane.setEmbeddedVisible': invoke(RPC_CHANNELS.browserPane.SET_EMBEDDED_VISIBLE),
  'browserPane.setEmbeddedToolbarMode': invoke(RPC_CHANNELS.browserPane.SET_EMBEDDED_TOOLBAR_MODE),
  'browserPane.setAudioMuted': invoke(RPC_CHANNELS.browserPane.SET_AUDIO_MUTED),
  'browserPane.loadWorkspaceState': invoke(RPC_CHANNELS.browserPane.LOAD_WORKSPACE_STATE),
  'browserPane.saveWorkspaceState': invoke(RPC_CHANNELS.browserPane.SAVE_WORKSPACE_STATE),
  'browserPane.listBookmarks': invoke(RPC_CHANNELS.browserPane.LIST_BOOKMARKS),
  'browserPane.addBookmark': invoke(RPC_CHANNELS.browserPane.ADD_BOOKMARK),
  'browserPane.updateBookmark': invoke(RPC_CHANNELS.browserPane.UPDATE_BOOKMARK),
  'browserPane.removeBookmark': invoke(RPC_CHANNELS.browserPane.REMOVE_BOOKMARK),
  'browserPane.listBookmarkFolders': invoke(RPC_CHANNELS.browserPane.LIST_BOOKMARK_FOLDERS),
  'browserPane.createBookmarkFolder': invoke(RPC_CHANNELS.browserPane.CREATE_BOOKMARK_FOLDER),
  'browserPane.renameBookmarkFolder': invoke(RPC_CHANNELS.browserPane.RENAME_BOOKMARK_FOLDER),
  'browserPane.removeBookmarkFolder': invoke(RPC_CHANNELS.browserPane.REMOVE_BOOKMARK_FOLDER),
  'browserPane.importBookmarks': invoke(RPC_CHANNELS.browserPane.IMPORT_BOOKMARKS),
  'browserPane.exportBookmarks': invoke(RPC_CHANNELS.browserPane.EXPORT_BOOKMARKS),
  'browserPane.listHistory': invoke(RPC_CHANNELS.browserPane.LIST_HISTORY),
  'browserPane.removeHistoryEntry': invoke(RPC_CHANNELS.browserPane.REMOVE_HISTORY_ENTRY),
  'browserPane.clearHistory': invoke(RPC_CHANNELS.browserPane.CLEAR_HISTORY),
  'browserPane.listDownloads': invoke(RPC_CHANNELS.browserPane.LIST_DOWNLOADS),
  'browserPane.clearDownloads': invoke(RPC_CHANNELS.browserPane.CLEAR_DOWNLOADS),
  'browserPane.openDownload': invoke(RPC_CHANNELS.browserPane.OPEN_DOWNLOAD),
  'browserPane.showDownload': invoke(RPC_CHANNELS.browserPane.SHOW_DOWNLOAD),
  'browserPane.pauseDownload': invoke(RPC_CHANNELS.browserPane.PAUSE_DOWNLOAD),
  'browserPane.resumeDownload': invoke(RPC_CHANNELS.browserPane.RESUME_DOWNLOAD),
  'browserPane.cancelDownload': invoke(RPC_CHANNELS.browserPane.CANCEL_DOWNLOAD),
  'browserPane.retryDownload': invoke(RPC_CHANNELS.browserPane.RETRY_DOWNLOAD),
  'browserPane.listPermissions': invoke(RPC_CHANNELS.browserPane.LIST_PERMISSIONS),
  'browserPane.clearPermission': invoke(RPC_CHANNELS.browserPane.CLEAR_PERMISSION),
  'browserPane.listExtensions': invoke(RPC_CHANNELS.browserPane.LIST_EXTENSIONS),
  'browserPane.installExtension': invoke(RPC_CHANNELS.browserPane.INSTALL_EXTENSION),
  'browserPane.installExtensionFromStore': invoke(RPC_CHANNELS.browserPane.INSTALL_EXTENSION_FROM_STORE),
  'browserPane.removeExtension': invoke(RPC_CHANNELS.browserPane.REMOVE_EXTENSION),
  'browserPane.openExtensionAction': invoke(RPC_CHANNELS.browserPane.OPEN_EXTENSION_ACTION),
  'browserPane.showToolbarMenu': invoke(RPC_CHANNELS.browserPane.SHOW_TOOLBAR_MENU),
  'browserPane.setExtensionPreference': invoke(RPC_CHANNELS.browserPane.SET_EXTENSION_PREFERENCE),
  'browserPane.emptyStateLaunch': invoke(RPC_CHANNELS.browserPane.LAUNCH),
  'browserPane.onStateChanged': listener(RPC_CHANNELS.browserPane.STATE_CHANGED),
  'browserPane.onRemoved': listener(RPC_CHANNELS.browserPane.REMOVED),
  'browserPane.onInteracted': listener(RPC_CHANNELS.browserPane.INTERACTED),
  'browserPane.onProfileChanged': listener(RPC_CHANNELS.browserPane.PROFILE_CHANGED),

  // LLM Connections
  listLlmConnections: invoke(RPC_CHANNELS.llmConnections.LIST),
  listLlmConnectionsWithStatus: invoke(RPC_CHANNELS.llmConnections.LIST_WITH_STATUS),
  getLlmConnection: invoke(RPC_CHANNELS.llmConnections.GET),
  getLlmConnectionApiKey: invoke(RPC_CHANNELS.llmConnections.GET_API_KEY),
  saveLlmConnection: invoke(RPC_CHANNELS.llmConnections.SAVE),
  deleteLlmConnection: invoke(RPC_CHANNELS.llmConnections.DELETE),
  testLlmConnection: invoke(RPC_CHANNELS.llmConnections.TEST),
  setDefaultLlmConnection: invoke(RPC_CHANNELS.llmConnections.SET_DEFAULT),
  setWorkspaceDefaultLlmConnection: invoke(RPC_CHANNELS.llmConnections.SET_WORKSPACE_DEFAULT),

  // Projects
  getProjects: invoke(RPC_CHANNELS.projects.GET),
  getProject: invoke(RPC_CHANNELS.projects.GET_ONE),
  createProject: invoke(RPC_CHANNELS.projects.CREATE),
  updateProject: invoke(RPC_CHANNELS.projects.UPDATE),
  getProjectMemory: invoke(RPC_CHANNELS.projects.GET_MEMORY),
  setProjectMemory: invoke(RPC_CHANNELS.projects.SET_MEMORY),
  deleteProject: invoke(RPC_CHANNELS.projects.DELETE),
  listProjectAssets: invoke(RPC_CHANNELS.projects.LIST_ASSETS),
  uploadProjectAsset: invoke(RPC_CHANNELS.projects.UPLOAD_ASSET),
  deleteProjectAsset: invoke(RPC_CHANNELS.projects.DELETE_ASSET),
  onProjectsChanged: listener(RPC_CHANNELS.projects.CHANGED),

  // Automations
  getAutomations: invoke(RPC_CHANNELS.automations.GET),
  testAutomation: invoke(RPC_CHANNELS.automations.TEST),
  setAutomationEnabled: invoke(RPC_CHANNELS.automations.SET_ENABLED),
  duplicateAutomation: invoke(RPC_CHANNELS.automations.DUPLICATE),
  deleteAutomation: invoke(RPC_CHANNELS.automations.DELETE),
  getAutomationHistory: invoke(RPC_CHANNELS.automations.GET_HISTORY),
  getAutomationLastExecuted: invoke(RPC_CHANNELS.automations.GET_LAST_EXECUTED),
  replayAutomation: invoke(RPC_CHANNELS.automations.REPLAY),
  onAutomationsChanged: listener(RPC_CHANNELS.automations.CHANGED),

  // Resources (cross-workspace export/import)
  exportResources: invoke(RPC_CHANNELS.resources.EXPORT),
  importResources: invoke(RPC_CHANNELS.resources.IMPORT),

  // Messaging gateway
  getMessagingConfig: invoke(RPC_CHANNELS.messaging.GET_CONFIG),
  updateMessagingConfig: invoke(RPC_CHANNELS.messaging.UPDATE_CONFIG),
  testLarkCredentials: invoke(RPC_CHANNELS.messaging.TEST_LARK),
  saveLarkCredentials: invoke(RPC_CHANNELS.messaging.SAVE_LARK),
  disconnectMessagingPlatform: invoke(RPC_CHANNELS.messaging.DISCONNECT),
  forgetMessagingPlatform: invoke(RPC_CHANNELS.messaging.FORGET),
  getMessagingBindings: invoke(RPC_CHANNELS.messaging.GET_BINDINGS),
  generateMessagingPairingCode: invoke(RPC_CHANNELS.messaging.GENERATE_CODE),
  unbindMessagingSession: invoke(RPC_CHANNELS.messaging.UNBIND),
  unbindMessagingBinding: invoke(RPC_CHANNELS.messaging.UNBIND_BINDING),
  onMessagingBindingChanged: listener(RPC_CHANNELS.messaging.BINDING_CHANGED),
  onMessagingPlatformStatus: listener(RPC_CHANNELS.messaging.PLATFORM_STATUS),
  startWeChatConnect: invoke(RPC_CHANNELS.messaging.WECHAT_START_CONNECT),
  submitWeChatVerifyCode: invoke(RPC_CHANNELS.messaging.WECHAT_SUBMIT_CODE),
  onWeChatEvent: listener(RPC_CHANNELS.messaging.WECHAT_UI_EVENT),

  // Messaging access control (Phase 3)
  getMessagingPlatformOwners: invoke(RPC_CHANNELS.messaging.GET_PLATFORM_OWNERS),
  setMessagingPlatformOwners: invoke(RPC_CHANNELS.messaging.SET_PLATFORM_OWNERS),
  getMessagingPlatformAccessMode: invoke(RPC_CHANNELS.messaging.GET_PLATFORM_ACCESS_MODE),
  setMessagingPlatformAccessMode: invoke(RPC_CHANNELS.messaging.SET_PLATFORM_ACCESS_MODE),
  getMessagingPendingSenders: invoke(RPC_CHANNELS.messaging.GET_PENDING_SENDERS),
  dismissMessagingPendingSender: invoke(RPC_CHANNELS.messaging.DISMISS_PENDING_SENDER),
  allowMessagingPendingSender: invoke(RPC_CHANNELS.messaging.ALLOW_PENDING_SENDER),
  setMessagingBindingAccess: invoke(RPC_CHANNELS.messaging.SET_BINDING_ACCESS),
  onMessagingPendingChanged: listener(RPC_CHANNELS.messaging.PENDING_CHANGED),
} satisfies ChannelMap
