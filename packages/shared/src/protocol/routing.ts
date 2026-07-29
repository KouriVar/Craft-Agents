/**
 * Exhaustive channel routing table for hybrid local/remote transport.
 *
 * Every RPC channel must belong to exactly one of two sets:
 * - LOCAL_ONLY: Always runs on the local Electron server, never proxied.
 * - REMOTE_ELIGIBLE: Runs on whichever server owns the workspace.
 *
 * An exhaustiveness test ensures new channels fail CI until classified.
 */

import { RPC_CHANNELS } from './channels'

// ---------------------------------------------------------------------------
// LOCAL_ONLY — fundamentally requires local OS / Electron
// ---------------------------------------------------------------------------

export const LOCAL_ONLY_CHANNELS = new Set<string>([
  // remote — local connectivity management (reaches out to remote server from local app)
  RPC_CHANNELS.remote.TEST_CONNECTION,

  // workspaces — local workspace CRUD (workspace list is local config)
  RPC_CHANNELS.workspaces.GET,
  RPC_CHANNELS.workspaces.CREATE,
  RPC_CHANNELS.workspaces.CHECK_SLUG,
  RPC_CHANNELS.workspaces.UPDATE_REMOTE,

  // window — Electron window management
  RPC_CHANNELS.window.GET_WORKSPACE,
  RPC_CHANNELS.window.GET_MODE,
  RPC_CHANNELS.window.OPEN_WORKSPACE,
  RPC_CHANNELS.window.OPEN_SESSION_IN_NEW_WINDOW,
  RPC_CHANNELS.window.SWITCH_WORKSPACE,
  RPC_CHANNELS.window.CLOSE,
  RPC_CHANNELS.window.CLOSE_REQUESTED,
  RPC_CHANNELS.window.CONFIRM_CLOSE,
  RPC_CHANNELS.window.CANCEL_CLOSE,
  RPC_CHANNELS.window.SET_TRAFFIC_LIGHTS,
  RPC_CHANNELS.window.FOCUS_STATE,
  RPC_CHANNELS.window.GET_FOCUS_STATE,

  // screenCapture — Electron desktop capture and macOS shortcut state
  RPC_CHANNELS.screenCapture.CURRENT,
  RPC_CHANNELS.screenCapture.RESULT,
  RPC_CHANNELS.screenCapture.REQUESTED,
  RPC_CHANNELS.screenCapture.SHORTCUT_STATUS,
  RPC_CHANNELS.screenCapture.GET_SHORTCUT_ENABLED,
  RPC_CHANNELS.screenCapture.SET_SHORTCUT_ENABLED,
  RPC_CHANNELS.screenCapture.GET_HIDE_APP,
  RPC_CHANNELS.screenCapture.SET_HIDE_APP,
  RPC_CHANNELS.screenCapture.GET_SHORTCUT_STATUS,
  RPC_CHANNELS.screenCapture.GET_PERMISSION_STATUS,
  RPC_CHANNELS.screenCapture.OPEN_PERMISSION_SETTINGS,

  // file — native file dialog
  RPC_CHANNELS.file.OPEN_DIALOG,
  // file — draft hydration for user-attached paths. Paths in drafts.json were captured
  // via webUtils.getPathForFile in the renderer, so they point at the user's local machine
  // — even when the workspace itself lives on a remote server. Routing this REMOTE_ELIGIBLE
  // would send the local path to a remote filesystem that can't resolve it.
  RPC_CHANNELS.file.READ_USER_ATTACHMENT,

  // dialog — native folder dialog
  RPC_CHANNELS.dialog.OPEN_FOLDER,

  // library — destructive / repair ops stay local until remote confirm UX exists
  RPC_CHANNELS.library.DELETE,
  RPC_CHANNELS.library.RESTORE_VERSION,
  RPC_CHANNELS.library.REPAIR,
  RPC_CHANNELS.search.REPAIR,

  // auth — local auth state + native dialogs
  RPC_CHANNELS.auth.LOGOUT,
  RPC_CHANNELS.auth.SHOW_LOGOUT_CONFIRMATION,
  RPC_CHANNELS.auth.SHOW_DELETE_SESSION_CONFIRMATION,

  // shell — local OS shell (openFile/showInFolder guarded for remote)
  RPC_CHANNELS.shell.OPEN_URL,
  RPC_CHANNELS.shell.OPEN_FILE,
  RPC_CHANNELS.shell.SHOW_IN_FOLDER,
  RPC_CHANNELS.shell.OPEN_TERMINAL,

  // skills — local filesystem actions (guarded for remote)
  RPC_CHANNELS.skills.OPEN_EDITOR,
  RPC_CHANNELS.skills.OPEN_FINDER,

  // system — local OS info
  RPC_CHANNELS.system.VERSIONS,
  RPC_CHANNELS.system.HOME_DIR,
  RPC_CHANNELS.system.IS_DEBUG_MODE,
  RPC_CHANNELS.system.EXPORT_DIAGNOSTICS,

  // theme — app/OS-level preferences, not workspace content
  RPC_CHANNELS.theme.GET_SYSTEM_PREFERENCE,
  RPC_CHANNELS.theme.SYSTEM_CHANGED,
  RPC_CHANNELS.theme.APP_CHANGED,
  RPC_CHANNELS.theme.GET_APP,
  RPC_CHANNELS.theme.GET_PRESETS,
  RPC_CHANNELS.theme.LOAD_PRESET,
  RPC_CHANNELS.theme.GET_COLOR_THEME,
  RPC_CHANNELS.theme.SET_COLOR_THEME,
  RPC_CHANNELS.theme.BROADCAST_PREFERENCES,
  RPC_CHANNELS.theme.PREFERENCES_CHANGED,
  RPC_CHANNELS.theme.GET_WORKSPACE_COLOR_THEME,
  RPC_CHANNELS.theme.SET_WORKSPACE_COLOR_THEME,
  RPC_CHANNELS.theme.GET_ALL_WORKSPACE_THEMES,
  RPC_CHANNELS.theme.BROADCAST_WORKSPACE_THEME,
  RPC_CHANNELS.theme.WORKSPACE_THEME_CHANGED,

  // update — local auto-update
  RPC_CHANNELS.update.CHECK,
  RPC_CHANNELS.update.GET_INFO,
  RPC_CHANNELS.update.INSTALL,
  RPC_CHANNELS.update.DISMISS,
  RPC_CHANNELS.update.GET_DISMISSED,
  RPC_CHANNELS.update.AVAILABLE,
  RPC_CHANNELS.update.DOWNLOAD_PROGRESS,

  // releaseNotes — local app info
  RPC_CHANNELS.releaseNotes.GET,
  RPC_CHANNELS.releaseNotes.GET_LATEST_VERSION,

  // badge — local dock badge
  RPC_CHANNELS.badge.REFRESH,
  RPC_CHANNELS.badge.SET_ICON,
  RPC_CHANNELS.badge.DRAW,
  RPC_CHANNELS.badge.DRAW_WINDOWS,

  // menu — local menu events
  RPC_CHANNELS.menu.NEW_CHAT,
  RPC_CHANNELS.menu.NEW_WINDOW,
  RPC_CHANNELS.menu.OPEN_SETTINGS,
  RPC_CHANNELS.menu.KEYBOARD_SHORTCUTS,
  RPC_CHANNELS.menu.TOGGLE_FOCUS_MODE,
  RPC_CHANNELS.menu.TOGGLE_SIDEBAR,
  RPC_CHANNELS.menu.TOGGLE_SESSION_LIST,
  RPC_CHANNELS.menu.QUIT,
  RPC_CHANNELS.menu.MINIMIZE,
  RPC_CHANNELS.menu.MAXIMIZE,
  RPC_CHANNELS.menu.ZOOM_IN,
  RPC_CHANNELS.menu.ZOOM_OUT,
  RPC_CHANNELS.menu.ZOOM_RESET,
  RPC_CHANNELS.menu.TOGGLE_DEV_TOOLS,
  RPC_CHANNELS.menu.UNDO,
  RPC_CHANNELS.menu.REDO,
  RPC_CHANNELS.menu.CUT,
  RPC_CHANNELS.menu.COPY,
  RPC_CHANNELS.menu.PASTE,
  RPC_CHANNELS.menu.SELECT_ALL,

  // deeplink — local deep link handling
  RPC_CHANNELS.deeplink.NAVIGATE,

  // notification preferences
  RPC_CHANNELS.notification.GET_ENABLED,
  RPC_CHANNELS.notification.SET_ENABLED,

  // input — local input preferences
  RPC_CHANNELS.input.GET_AUTO_CAPITALISATION,
  RPC_CHANNELS.input.SET_AUTO_CAPITALISATION,
  RPC_CHANNELS.input.GET_SEND_MESSAGE_KEY,
  RPC_CHANNELS.input.SET_SEND_MESSAGE_KEY,
  RPC_CHANNELS.input.GET_SPELL_CHECK,
  RPC_CHANNELS.input.SET_SPELL_CHECK,
  RPC_CHANNELS.input.GET_OPEN_CONVERSATION_SCROLL,
  RPC_CHANNELS.input.SET_OPEN_CONVERSATION_SCROLL,
  RPC_CHANNELS.input.GET_RIGHT_SIDEBAR_MODE,
  RPC_CHANNELS.input.SET_RIGHT_SIDEBAR_MODE,
  RPC_CHANNELS.input.GET_RIGHT_SIDEBAR_FOLLOW_SESSION,
  RPC_CHANNELS.input.SET_RIGHT_SIDEBAR_FOLLOW_SESSION,
  RPC_CHANNELS.input.GET_BROWSER_OPEN_MODE,
  RPC_CHANNELS.input.SET_BROWSER_OPEN_MODE,

  // power — local power management
  RPC_CHANNELS.power.GET_KEEP_AWAKE,
  RPC_CHANNELS.power.SET_KEEP_AWAKE,

  // appearance — local UI preferences
  RPC_CHANNELS.appearance.GET_RICH_TOOL_DESCRIPTIONS,
  RPC_CHANNELS.appearance.SET_RICH_TOOL_DESCRIPTIONS,

  // caching — prompt cache and context settings
  RPC_CHANNELS.caching.GET_EXTENDED_PROMPT_CACHE,
  RPC_CHANNELS.caching.SET_EXTENDED_PROMPT_CACHE,
  RPC_CHANNELS.caching.GET_ENABLE_1M_CONTEXT,
  RPC_CHANNELS.caching.SET_ENABLE_1M_CONTEXT,

  // rtk — token-optimization opt-in
  RPC_CHANNELS.rtk.GET_ENABLED,
  RPC_CHANNELS.rtk.SET_ENABLED,
  RPC_CHANNELS.rtk.GET_STATUS,
  RPC_CHANNELS.rtk.GET_GAIN,

  // tools — local tool settings
  RPC_CHANNELS.tools.GET_BROWSER_TOOL_ENABLED,
  RPC_CHANNELS.tools.SET_BROWSER_TOOL_ENABLED,

  // browserPane — Electron BrowserView
  RPC_CHANNELS.browserPane.CREATE,
  RPC_CHANNELS.browserPane.DESTROY,
  RPC_CHANNELS.browserPane.LIST,
  RPC_CHANNELS.browserPane.NAVIGATE,
  RPC_CHANNELS.browserPane.GO_BACK,
  RPC_CHANNELS.browserPane.GO_FORWARD,
  RPC_CHANNELS.browserPane.RELOAD,
  RPC_CHANNELS.browserPane.STOP,
  RPC_CHANNELS.browserPane.FOCUS,
  RPC_CHANNELS.browserPane.SET_EMBEDDED_BOUNDS,
  RPC_CHANNELS.browserPane.SET_EMBEDDED_VISIBLE,
  RPC_CHANNELS.browserPane.SET_EMBEDDED_TOOLBAR_MODE,
  RPC_CHANNELS.browserPane.LOAD_WORKSPACE_STATE,
  RPC_CHANNELS.browserPane.SAVE_WORKSPACE_STATE,
  RPC_CHANNELS.browserPane.LIST_BOOKMARKS,
  RPC_CHANNELS.browserPane.ADD_BOOKMARK,
  RPC_CHANNELS.browserPane.UPDATE_BOOKMARK,
  RPC_CHANNELS.browserPane.REMOVE_BOOKMARK,
  RPC_CHANNELS.browserPane.LIST_BOOKMARK_FOLDERS,
  RPC_CHANNELS.browserPane.CREATE_BOOKMARK_FOLDER,
  RPC_CHANNELS.browserPane.RENAME_BOOKMARK_FOLDER,
  RPC_CHANNELS.browserPane.REMOVE_BOOKMARK_FOLDER,
  RPC_CHANNELS.browserPane.IMPORT_BOOKMARKS,
  RPC_CHANNELS.browserPane.EXPORT_BOOKMARKS,
  RPC_CHANNELS.browserPane.LIST_HISTORY,
  RPC_CHANNELS.browserPane.REMOVE_HISTORY_ENTRY,
  RPC_CHANNELS.browserPane.CLEAR_HISTORY,
  RPC_CHANNELS.browserPane.LIST_DOWNLOADS,
  RPC_CHANNELS.browserPane.CLEAR_DOWNLOADS,
  RPC_CHANNELS.browserPane.OPEN_DOWNLOAD,
  RPC_CHANNELS.browserPane.SHOW_DOWNLOAD,
  RPC_CHANNELS.browserPane.PAUSE_DOWNLOAD,
  RPC_CHANNELS.browserPane.RESUME_DOWNLOAD,
  RPC_CHANNELS.browserPane.CANCEL_DOWNLOAD,
  RPC_CHANNELS.browserPane.RETRY_DOWNLOAD,
  RPC_CHANNELS.browserPane.LIST_PERMISSIONS,
  RPC_CHANNELS.browserPane.CLEAR_PERMISSION,
  RPC_CHANNELS.browserPane.LIST_EXTENSIONS,
  RPC_CHANNELS.browserPane.INSTALL_EXTENSION,
  RPC_CHANNELS.browserPane.INSTALL_EXTENSION_FROM_STORE,
  RPC_CHANNELS.browserPane.REMOVE_EXTENSION,
  RPC_CHANNELS.browserPane.OPEN_EXTENSION_ACTION,
  RPC_CHANNELS.browserPane.SHOW_TOOLBAR_MENU,
  RPC_CHANNELS.browserPane.SET_EXTENSION_PREFERENCE,
  RPC_CHANNELS.browserPane.SNAPSHOT,
  RPC_CHANNELS.browserPane.CLICK,
  RPC_CHANNELS.browserPane.FILL,
  RPC_CHANNELS.browserPane.SELECT,
  RPC_CHANNELS.browserPane.SCREENSHOT,
  RPC_CHANNELS.browserPane.EVALUATE,
  RPC_CHANNELS.browserPane.SCROLL,
  RPC_CHANNELS.browserPane.LAUNCH,
  RPC_CHANNELS.browserPane.STATE_CHANGED,
  RPC_CHANNELS.browserPane.REMOVED,
  RPC_CHANNELS.browserPane.INTERACTED,
  RPC_CHANNELS.browserPane.SET_AUDIO_MUTED,
  RPC_CHANNELS.browserPane.PROFILE_CHANGED,

  // gitbash — Windows-specific local
  RPC_CHANNELS.gitbash.CHECK,
  RPC_CHANNELS.gitbash.BROWSE,
  RPC_CHANNELS.gitbash.SET_PATH,

  // debug — local debug logging
  RPC_CHANNELS.debug.LOG,

  // onboarding — local auth setup flow
  RPC_CHANNELS.onboarding.GET_AUTH_STATE,
  RPC_CHANNELS.onboarding.START_MCP_OAUTH,
  RPC_CHANNELS.onboarding.DEFER_SETUP,
  RPC_CHANNELS.settings.GET_NETWORK_PROXY,
  RPC_CHANNELS.settings.SET_NETWORK_PROXY,

  // server config — local embedded server settings
  RPC_CHANNELS.settings.GET_SERVER_CONFIG,
  RPC_CHANNELS.settings.SET_SERVER_CONFIG,
  RPC_CHANNELS.settings.GET_SERVER_STATUS,
])

// ---------------------------------------------------------------------------
// REMOTE_ELIGIBLE — runs on whichever server owns the workspace
// ---------------------------------------------------------------------------

export const REMOTE_ELIGIBLE_CHANNELS = new Set<string>([
  // server — server-level operations (no workspace context needed)
  RPC_CHANNELS.server.GET_WORKSPACES,
  RPC_CHANNELS.server.CREATE_WORKSPACE,
  RPC_CHANNELS.server.GET_STATUS,
  RPC_CHANNELS.server.GET_HEALTH,
  RPC_CHANNELS.server.GET_ACTIVE_SESSIONS,
  RPC_CHANNELS.server.SHUTTING_DOWN,
  RPC_CHANNELS.server.STATUS_CHANGED,
  RPC_CHANNELS.server.HOME_DIR,

  // sessions — core session runtime
  RPC_CHANNELS.sessions.GET,
  RPC_CHANNELS.sessions.GET_UNREAD_SUMMARY,
  RPC_CHANNELS.sessions.MARK_ALL_READ,
  RPC_CHANNELS.sessions.UNREAD_SUMMARY_CHANGED,
  RPC_CHANNELS.sessions.CREATE,
  RPC_CHANNELS.sessions.DELETE,
  RPC_CHANNELS.sessions.GET_MESSAGES,
  RPC_CHANNELS.sessions.SEND_MESSAGE,
  RPC_CHANNELS.sessions.CANCEL,
  RPC_CHANNELS.sessions.KILL_SHELL,
  RPC_CHANNELS.sessions.RESPOND_TO_PERMISSION,
  RPC_CHANNELS.sessions.RESPOND_TO_CREDENTIAL,
  RPC_CHANNELS.sessions.COMMAND,
  RPC_CHANNELS.sessions.GET_PENDING_PLAN_EXECUTION,
  RPC_CHANNELS.sessions.GET_PERMISSION_MODE_STATE,
  RPC_CHANNELS.sessions.EVENT,
  RPC_CHANNELS.sessions.GET_MODEL,
  RPC_CHANNELS.sessions.SET_MODEL,
  RPC_CHANNELS.sessions.GET_FILES,
  RPC_CHANNELS.sessions.WATCH_FILES,
  RPC_CHANNELS.sessions.UNWATCH_FILES,
  RPC_CHANNELS.sessions.FILES_CHANGED,
  RPC_CHANNELS.sessions.SEARCH_CONTENT,
  RPC_CHANNELS.sessions.EXPORT,
  RPC_CHANNELS.sessions.IMPORT,
  RPC_CHANNELS.sessions.EXPORT_REMOTE_TRANSFER,
  RPC_CHANNELS.sessions.IMPORT_REMOTE_TRANSFER,

  // transfer — chunked large-payload import (sessions, resources)
  RPC_CHANNELS.transfer.START,
  RPC_CHANNELS.transfer.CHUNK,
  RPC_CHANNELS.transfer.COMMIT,
  RPC_CHANNELS.transfer.ABORT,

  // file — workspace files (not openDialog which is native)
  RPC_CHANNELS.file.READ,
  RPC_CHANNELS.file.READ_WIDGET,
  RPC_CHANNELS.file.READ_DATA_URL,
  RPC_CHANNELS.file.READ_PREVIEW_DATA_URL,
  RPC_CHANNELS.file.READ_BINARY,
  RPC_CHANNELS.file.READ_ATTACHMENT,
  RPC_CHANNELS.file.STORE_ATTACHMENT,
  RPC_CHANNELS.file.GENERATE_THUMBNAIL,

  // widgets — session-bound MCP Apps resource and tool bridge
  RPC_CHANNELS.widgets.READ_MCP_RESOURCE,
  RPC_CHANNELS.widgets.CALL_MCP_TOOL,

  // fs — workspace filesystem
  RPC_CHANNELS.fs.SEARCH,
  RPC_CHANNELS.fs.LIST_DIRECTORY,

  // credentials — remote server's credential state
  RPC_CHANNELS.credentials.HEALTH_CHECK,

  // llmConnections — LLM config lives on server running workspace
  RPC_CHANNELS.llmConnections.LIST,
  RPC_CHANNELS.llmConnections.LIST_WITH_STATUS,
  RPC_CHANNELS.llmConnections.GET,
  RPC_CHANNELS.llmConnections.GET_API_KEY,
  RPC_CHANNELS.llmConnections.SAVE,
  RPC_CHANNELS.llmConnections.DELETE,
  RPC_CHANNELS.llmConnections.TEST,
  RPC_CHANNELS.llmConnections.SET_DEFAULT,
  RPC_CHANNELS.llmConnections.SET_WORKSPACE_DEFAULT,
  RPC_CHANNELS.llmConnections.CHANGED,

  // chatgpt — OAuth via capability passthrough
  RPC_CHANNELS.chatgpt.START_OAUTH,
  RPC_CHANNELS.chatgpt.COMPLETE_OAUTH,
  RPC_CHANNELS.chatgpt.CANCEL_OAUTH,
  RPC_CHANNELS.chatgpt.GET_AUTH_STATUS,
  RPC_CHANNELS.chatgpt.LOGOUT,

  // copilot — OAuth via capability passthrough
  RPC_CHANNELS.copilot.START_OAUTH,
  RPC_CHANNELS.copilot.CANCEL_OAUTH,
  RPC_CHANNELS.copilot.GET_AUTH_STATUS,
  RPC_CHANNELS.copilot.LOGOUT,
  RPC_CHANNELS.copilot.DEVICE_CODE,

  // Claude OAuth — runs on workspace server so credentials and connection config
  // end up on the same server that will use them. Browser opening is client-side.
  // (ChatGPT OAuth stays LOCAL_ONLY — requires localhost callback server.)
  RPC_CHANNELS.onboarding.START_CLAUDE_OAUTH,
  RPC_CHANNELS.onboarding.EXCHANGE_CLAUDE_CODE,
  RPC_CHANNELS.onboarding.HAS_CLAUDE_OAUTH_STATE,
  RPC_CHANNELS.onboarding.CLEAR_CLAUDE_OAUTH_STATE,

  // settings — workspace-level settings
  RPC_CHANNELS.settings.SETUP_LLM_CONNECTION,
  RPC_CHANNELS.settings.TEST_LLM_CONNECTION_SETUP,
  RPC_CHANNELS.settings.GET_DEFAULT_THINKING_LEVEL,
  RPC_CHANNELS.settings.SET_DEFAULT_THINKING_LEVEL,

  // pi — provider config on workspace server
  RPC_CHANNELS.pi.GET_API_KEY_PROVIDERS,
  RPC_CHANNELS.pi.GET_PROVIDER_BASE_URL,
  RPC_CHANNELS.pi.GET_PROVIDER_MODELS,

  // preferences — workspace-level preferences
  RPC_CHANNELS.preferences.READ,
  RPC_CHANNELS.preferences.WRITE,

  // drafts — workspace content
  RPC_CHANNELS.drafts.GET,
  RPC_CHANNELS.drafts.SET,
  RPC_CHANNELS.drafts.DELETE,
  RPC_CHANNELS.drafts.GET_ALL,

  // sources — source config per-workspace
  RPC_CHANNELS.sources.GET,
  RPC_CHANNELS.sources.CREATE,
  RPC_CHANNELS.sources.DELETE,
  RPC_CHANNELS.sources.START_OAUTH,
  RPC_CHANNELS.sources.SAVE_CREDENTIALS,
  RPC_CHANNELS.sources.CHANGED,
  RPC_CHANNELS.sources.GET_PERMISSIONS,
  RPC_CHANNELS.sources.GET_MCP_TOOLS,

  // oauth — OAuth state management
  RPC_CHANNELS.oauth.START,
  RPC_CHANNELS.oauth.COMPLETE,
  RPC_CHANNELS.oauth.CANCEL,
  RPC_CHANNELS.oauth.REVOKE,
  RPC_CHANNELS.oauth.APP_GET,
  RPC_CHANNELS.oauth.APP_SET,
  RPC_CHANNELS.oauth.APP_DELETE,

  // workspace — workspace config + images (sharp on headless)
  RPC_CHANNELS.workspace.GET_PERMISSIONS,
  RPC_CHANNELS.workspace.READ_IMAGE,
  RPC_CHANNELS.workspace.WRITE_IMAGE,
  RPC_CHANNELS.workspace.SETTINGS_GET,
  RPC_CHANNELS.workspace.SETTINGS_UPDATE,

  // permissions — workspace permissions
  RPC_CHANNELS.permissions.GET_DEFAULTS,
  RPC_CHANNELS.permissions.DEFAULTS_CHANGED,

  // skills — skill content per-workspace (not openEditor/openFinder which are local OS)
  RPC_CHANNELS.skills.GET,
  RPC_CHANNELS.skills.GET_FILES,
  RPC_CHANNELS.skills.DELETE,
  RPC_CHANNELS.skills.CHANGED,

  // plugins — workspace plugin package config and package-local capabilities
  RPC_CHANNELS.plugins.LIST,
  RPC_CHANNELS.plugins.GET_POLICIES,
  RPC_CHANNELS.plugins.SET_POLICY,
  RPC_CHANNELS.plugins.GET_MCP_STATUS,
  RPC_CHANNELS.plugins.GET_AUTH_STATUS,
  RPC_CHANNELS.plugins.DIAGNOSE_MCP,
  RPC_CHANNELS.plugins.INSTALL_GIT,
  RPC_CHANNELS.plugins.LIST_MARKETPLACE_SOURCES,
  RPC_CHANNELS.plugins.ADD_MARKETPLACE_SOURCE,
  RPC_CHANNELS.plugins.REMOVE_MARKETPLACE_SOURCE,
  RPC_CHANNELS.plugins.GET_MARKETPLACE_CATALOG,
  RPC_CHANNELS.plugins.PREVIEW_UPDATE,
  RPC_CHANNELS.plugins.INSTALL_MARKETPLACE_PLUGIN,
  RPC_CHANNELS.plugins.CONNECT_NATIVE_SOURCE,
  RPC_CHANNELS.plugins.REGISTER_LOCAL,
  RPC_CHANNELS.plugins.SET_ENABLED,
  RPC_CHANNELS.plugins.UNREGISTER,
  RPC_CHANNELS.plugins.REMOVE_MANAGED,
  RPC_CHANNELS.plugins.CHANGED,

  // statuses — workspace metadata
  RPC_CHANNELS.statuses.LIST,
  RPC_CHANNELS.statuses.REORDER,
  RPC_CHANNELS.statuses.CHANGED,

  // labels — workspace metadata
  RPC_CHANNELS.labels.LIST,
  RPC_CHANNELS.labels.CREATE,
  RPC_CHANNELS.labels.DELETE,
  RPC_CHANNELS.labels.CHANGED,

  // views — workspace UI views
  RPC_CHANNELS.views.LIST,
  RPC_CHANNELS.views.SAVE,

  // toolIcons — workspace config
  RPC_CHANNELS.toolIcons.GET_MAPPINGS,

  // logo — workspace config
  RPC_CHANNELS.logo.GET_URL,

  // automations — workspace automations
  RPC_CHANNELS.automations.GET,
  RPC_CHANNELS.automations.CREATE,
  RPC_CHANNELS.automations.INFER,
  RPC_CHANNELS.automations.TEST,
  RPC_CHANNELS.automations.SET_ENABLED,
  RPC_CHANNELS.automations.DUPLICATE,
  RPC_CHANNELS.automations.DELETE,
  RPC_CHANNELS.automations.GET_HISTORY,
  RPC_CHANNELS.automations.GET_LAST_EXECUTED,
  RPC_CHANNELS.automations.REPLAY,
  RPC_CHANNELS.automations.CHANGED,

  // dynamic — workspace notification center
  RPC_CHANNELS.dynamic.CREATE,
  RPC_CHANNELS.dynamic.LIST,
  RPC_CHANNELS.dynamic.MARK_READ,
  RPC_CHANNELS.dynamic.CLEAR,
  RPC_CHANNELS.dynamic.RESOLVE,
  RPC_CHANNELS.dynamic.GET_MUTE_RULES,
  RPC_CHANNELS.dynamic.SET_MUTE_RULES,
  RPC_CHANNELS.dynamic.RESPOND_PERMISSION,

  RPC_CHANNELS.workflows.LIST,
  RPC_CHANNELS.workflows.SAVE,
  RPC_CHANNELS.workflows.DELETE,
  RPC_CHANNELS.workflows.RUN,

  // projects — workspace projects
  RPC_CHANNELS.projects.GET,
  RPC_CHANNELS.projects.GET_ONE,
  RPC_CHANNELS.projects.CREATE,
  RPC_CHANNELS.projects.UPDATE,
  RPC_CHANNELS.projects.DELETE,
  RPC_CHANNELS.projects.LIST_ASSETS,
  RPC_CHANNELS.projects.UPLOAD_ASSET,
  RPC_CHANNELS.projects.DELETE_ASSET,
  RPC_CHANNELS.projects.GET_MEMORY,
  RPC_CHANNELS.projects.SET_MEMORY,
  RPC_CHANNELS.projects.RESTORE_AUTOMATIONS,
  RPC_CHANNELS.projects.LIST_PAUSED_AUTOMATIONS,
  RPC_CHANNELS.projects.CHANGED,

  // git — workspace filesystem
  RPC_CHANNELS.git.GET_BRANCH,
  RPC_CHANNELS.git.GET_STATUS,
  RPC_CHANNELS.git.RUN_ACTION,

  // resources — workspace resource export/import
  RPC_CHANNELS.resources.EXPORT,
  RPC_CHANNELS.resources.IMPORT,

  // messaging — gateway channels run on workspace server
  RPC_CHANNELS.messaging.BINDING_CHANGED,
  RPC_CHANNELS.messaging.PLATFORM_STATUS,
  RPC_CHANNELS.messaging.PENDING_CHANGED,
  RPC_CHANNELS.messaging.GET_CONFIG,
  RPC_CHANNELS.messaging.UPDATE_CONFIG,
  RPC_CHANNELS.messaging.TEST_LARK,
  RPC_CHANNELS.messaging.SAVE_LARK,
  RPC_CHANNELS.messaging.DISCONNECT,
  RPC_CHANNELS.messaging.FORGET,
  RPC_CHANNELS.messaging.GET_BINDINGS,
  RPC_CHANNELS.messaging.GENERATE_CODE,
  RPC_CHANNELS.messaging.UNBIND,
  RPC_CHANNELS.messaging.UNBIND_BINDING,
  RPC_CHANNELS.messaging.WECHAT_START_CONNECT,
  RPC_CHANNELS.messaging.WECHAT_SUBMIT_CODE,
  RPC_CHANNELS.messaging.WECHAT_UI_EVENT,
  // messaging access control — UI ↔ Server, per-platform owners + per-binding allow-list
  RPC_CHANNELS.messaging.GET_PLATFORM_OWNERS,
  RPC_CHANNELS.messaging.SET_PLATFORM_OWNERS,
  RPC_CHANNELS.messaging.GET_PLATFORM_ACCESS_MODE,
  RPC_CHANNELS.messaging.SET_PLATFORM_ACCESS_MODE,
  RPC_CHANNELS.messaging.GET_PENDING_SENDERS,
  RPC_CHANNELS.messaging.DISMISS_PENDING_SENDER,
  RPC_CHANNELS.messaging.ALLOW_PENDING_SENDER,
  RPC_CHANNELS.messaging.SET_BINDING_ACCESS,

  // cognition — workspace cognition ledger / product reads
  RPC_CHANNELS.cognition.GET_STATUS,
  RPC_CHANNELS.cognition.LIST_EVENTS,
  RPC_CHANNELS.cognition.LIST_OBSERVATIONS,
  RPC_CHANNELS.cognition.LIST_LOOPS,
  RPC_CHANNELS.cognition.RESOLVE_LOOP,
  RPC_CHANNELS.cognition.DISMISS_LOOP,
  RPC_CHANNELS.cognition.LIST_REFLECTIONS,
  RPC_CHANNELS.cognition.LIST_GUIDANCE,
  RPC_CHANNELS.cognition.DISMISS_GUIDANCE,
  RPC_CHANNELS.cognition.REFRESH_GUIDANCE,
  RPC_CHANNELS.cognition.CLEAR,
  RPC_CHANNELS.cognition.REPAIR,

  // privacy — workspace privacy policy / mode / access log
  RPC_CHANNELS.privacy.GET_POLICY,
  RPC_CHANNELS.privacy.SET_POLICY,
  RPC_CHANNELS.privacy.GET_PRIVACY_MODE,
  RPC_CHANNELS.privacy.SET_PRIVACY_MODE,
  RPC_CHANNELS.privacy.LIST_ACCESS_LOG,
  RPC_CHANNELS.privacy.CLEAR_DATA,
  RPC_CHANNELS.privacy.GET_STORAGE_USAGE,

  // library — workspace document library (资源库)
  // Read + safe writes remain remote-eligible; delete/repair/restore are LOCAL_ONLY (see above).
  RPC_CHANNELS.library.LIST,
  RPC_CHANNELS.library.GET,
  RPC_CHANNELS.library.CREATE,
  RPC_CHANNELS.library.CREATE_FROM_SESSION,
  RPC_CHANNELS.library.UPDATE,
  RPC_CHANNELS.library.ARCHIVE,
  RPC_CHANNELS.library.UNARCHIVE,
  RPC_CHANNELS.library.LIST_VERSIONS,
  RPC_CHANNELS.library.GET_VERSION,
  RPC_CHANNELS.library.EXPORT,
  RPC_CHANNELS.library.UNLINK_SESSION,
  RPC_CHANNELS.library.IMPORT_FILE,
  RPC_CHANNELS.library.CREATE_MINDMAP,
  RPC_CHANNELS.library.UPDATE_MINDMAP,
  RPC_CHANNELS.library.LIST_MINDMAPS,
  RPC_CHANNELS.library.GET_MINDMAP,
  RPC_CHANNELS.search.QUERY,
  RPC_CHANNELS.experts.LIST,
  RPC_CHANNELS.experts.GET,
  RPC_CHANNELS.experts.CREATE,
  RPC_CHANNELS.experts.UPDATE,
  RPC_CHANNELS.experts.DUPLICATE,
  RPC_CHANNELS.experts.DELETE,
  RPC_CHANNELS.experts.RESOLVE_CAPABILITIES,
  RPC_CHANNELS.experts.GET_CAPABILITY_ASSIGNMENT,
  RPC_CHANNELS.experts.SET_CAPABILITY_ASSIGNMENT,
  RPC_CHANNELS.connectors.LIST,
  RPC_CHANNELS.connectors.GET,
  RPC_CHANNELS.connectors.CREATE,
  RPC_CHANNELS.connectors.UPDATE,
  RPC_CHANNELS.connectors.DELETE,
])

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

export function isLocalOnly(channel: string): boolean {
  return LOCAL_ONLY_CHANNELS.has(channel)
}

export function isRemoteEligible(channel: string): boolean {
  return REMOTE_ELIGIBLE_CHANNELS.has(channel)
}
