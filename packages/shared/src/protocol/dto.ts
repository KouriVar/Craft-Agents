/**
 * Server DTO types — data shapes used by RPC handlers and SessionManager.
 *
 * These were previously in apps/electron/src/shared/types.ts.
 * Extracted here so handler code in @craft-agent/server-core can import
 * from @craft-agent/shared/protocol without reaching into the app.
 */

import type {
  Message,
  TypedError,
  ContentBadge,
  ToolDisplayMeta,
  AnnotationV1,
  PermissionRequest as BasePermissionRequest,
} from '@craft-agent/core/types'
import type { PermissionMode } from '../agent/mode-types'
import type { ThinkingLevel } from '../agent/thinking-levels'
import type { CustomEndpointConfig } from '../config/llm-connections'
import type { TaskCheckpoint, TaskPriority } from '../sessions/types'
import type {
  AuthRequest as SharedAuthRequest,
  CredentialInputMode as SharedCredentialInputMode,
  CredentialAuthRequest as SharedCredentialAuthRequest,
} from '../agent/index'

// Re-export generateMessageId for handler convenience
export { generateMessageId } from '@craft-agent/core/types'

// ---------------------------------------------------------------------------
// Session types
// ---------------------------------------------------------------------------

/**
 * Dynamic status ID referencing workspace status config.
 * Validated at runtime via validateSessionStatus().
 * Falls back to 'todo' if status doesn't exist.
 */
export type SessionStatus = string

export type BuiltInStatusId = 'todo'

/**
 * Electron-specific Session type (includes runtime state).
 * Extends core Session with messages array and processing state.
 */
export interface Session {
  id: string
  workspaceId: string
  workspaceName: string
  name?: string
  /** Preview of first user message (from JSONL header, for lazy-loaded sessions) */
  preview?: string
  lastMessageAt: number
  messages: Message[]
  isProcessing: boolean
  isFlagged?: boolean
  /** Permission mode for this session ('safe', 'ask', 'allow-all') */
  permissionMode?: PermissionMode
  sessionStatus?: SessionStatus
  /** Labels (additive tags, many-per-session — bare IDs or "id::value" entries) */
  labels?: string[]
  lastReadMessageId?: string
  /**
   * Explicit unread flag - single source of truth for NEW badge.
   * Set to true when assistant message completes while user is NOT viewing.
   * Set to false when user views the session (and not processing).
   */
  hasUnread?: boolean
  enabledSourceSlugs?: string[]
  workingDirectory?: string
  sessionFolderPath?: string
  sharedUrl?: string
  sharedId?: string
  model?: string
  llmConnection?: string
  agentRuntime?: import('../agent/runtime-types.ts').AgentRuntime
  thinkingLevel?: ThinkingLevel
  lastMessageRole?: 'user' | 'assistant' | 'plan' | 'tool' | 'error'
  lastFinalMessageId?: string
  isAsyncOperationOngoing?: boolean
  /** @deprecated Use isAsyncOperationOngoing instead */
  isRegeneratingTitle?: boolean
  currentStatus?: {
    message: string
    statusType?: string
  }
  createdAt?: number
  messageCount?: number
  tokenUsage?: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
    contextTokens: number
    costUsd: number
    cacheReadTokens?: number
    cacheCreationTokens?: number
    /** Model's context window size in tokens (from SDK modelUsage) */
    contextWindow?: number
  }
  /** When true, session is hidden from session list (e.g., mini edit sessions) */
  hidden?: boolean
  isArchived?: boolean
  archivedAt?: number
  supportsBranching?: boolean
  /** Source session for a branch; together with branchFromMessageId forms the audit edge. */
  branchFromSessionId?: string
  branchFromMessageId?: string
  /** Workspace-scoped project id this session is bound to (undefined = unbound) */
  projectId?: string
  /** Explicit expert override; omitted inherits parent/project/default assistant. */
  expertId?: string
  /** Keep this session above unpinned sessions in list views. */
  isPinned?: boolean
  /** Parent session id — when set, this session is a subtask of the parent (undefined = top-level task) */
  parentSessionId?: string
  /** Kanban board column id ('todo' | 'in-progress' | 'done'); independent of sessionStatus */
  kanbanColumn?: string
  /** Tasks Conductor: slug of the task spec this session belongs to. */
  /** Tasks Conductor: id of the run that spawned this child session (child nodes only). */
  /** Tasks Conductor: id of the DAG node this child session executes (child nodes only). */
  /** Tasks Conductor: total DAG node count (orchestrator only) — stable board progress denominator. */
  /** Tasks Conductor: generate-time draft orchestrator, hidden from the board until adopted by createTask. */
  /** Long-running task objective and resume metadata. */
  taskGoal?: string
  taskPriority?: TaskPriority
  taskDueAt?: number
  taskReminderAt?: number
  taskReminderAcknowledgedAt?: number
  taskReminderLastNotifiedAt?: number
  taskCheckpoints?: TaskCheckpoint[]
  /** Origin metadata for sessions started by an automation. */
  triggeredBy?: { automationName?: string; event?: string; timestamp?: number }
}

export interface CreateSessionOptions {
  name?: string
  permissionMode?: PermissionMode
  /**
   * Reasoning/thinking level override. When set, takes precedence over workspace
   * and global defaults. Silently ignored by the underlying SDK on non-reasoning
   * models (e.g. gpt-4o) — provider drivers don't attach the reasoning param to
   * the API request for models with `reasoning: false` in the Pi SDK catalog.
   */
  thinkingLevel?: ThinkingLevel
  /**
   * Working directory for the session:
   * - 'user_default' or undefined: Use workspace's configured default working directory
   * - 'none': No working directory (session folder only)
   * - Absolute path string: Use this specific path
   */
  workingDirectory?: string | 'user_default' | 'none'
  model?: string
  llmConnection?: string
  /** Agent engine for this session. Defaults to the app-level selection. */
  agentRuntime?: import('../agent/runtime-types.ts').AgentRuntime
  systemPromptPreset?: 'default' | 'mini' | string
  hidden?: boolean
  sessionStatus?: SessionStatus
  labels?: string[]
  isFlagged?: boolean
  enabledSourceSlugs?: string[]
  /**
   * Message ID to branch from. This is a hard context cutoff:
   * the new session must not include model context from later parent messages.
   */
  branchFromMessageId?: string
  /** Parent session ID used together with branchFromMessageId. */
  branchFromSessionId?: string
  /** Bind the new session to a workspace project (inherits project's workingDirectory). */
  projectId?: string
  expertId?: string
  /** Mark the new session as a subtask of this parent session (undefined = top-level task). */
  parentSessionId?: string
  /** Tasks Conductor: slug of the task spec this session belongs to (orchestrator + child nodes). */
  /** Tasks Conductor: id of the run that spawned this child session (child nodes only). */
  /** Tasks Conductor: id of the DAG node this child session executes (child nodes only). */
  /** Tasks Conductor: mark the orchestrator as a generate-time draft (hidden until adopted by createTask). */
  /**
   * Apply the reserved "Task" label (valueType 'number') after creation. Top-level sessions
   * allocate the next task number; sessions with a `parentSessionId` inherit the parent's
   * number (labeling a plain-chat parent in the same pass). Task flows opt in; plain chats don't.
   */
  applyTaskLabel?: boolean
}

export interface RemoteSessionTransferPayload {
  sourceSessionId: string
  name?: string
  sessionStatus?: SessionStatus
  labels?: string[]
  permissionMode?: PermissionMode
  taskGoal?: string
  taskPriority?: TaskPriority
  taskDueAt?: number
  taskReminderAt?: number
  taskReminderAcknowledgedAt?: number
  taskReminderLastNotifiedAt?: number
  taskCheckpoints?: TaskCheckpoint[]
  summary: string
}

export interface ImportRemoteSessionTransferResult {
  sessionId: string
}

export interface PermissionModeState {
  permissionMode: PermissionMode
  previousPermissionMode?: PermissionMode
  transitionDisplay?: string
  modeVersion: number
  changedAt: string
  changedBy: 'user' | 'system' | 'restore' | 'automation' | 'unknown'
}

// ---------------------------------------------------------------------------
// Session events (main → renderer)
// ---------------------------------------------------------------------------

// turnId: Correlation ID from the API's message.id, groups all events in an assistant turn
export type SessionEvent =
  | { type: 'text_delta'; sessionId: string; delta: string; turnId?: string }
  | {
      type: 'text_complete'
      sessionId: string
      text: string
      isIntermediate?: boolean
      turnId?: string
      parentToolUseId?: string
      timestamp?: number
      messageId?: string
    }
  | {
      type: 'tool_start'
      sessionId: string
      toolName: string
      toolUseId: string
      toolInput: Record<string, unknown>
      toolIntent?: string
      toolDisplayName?: string
      toolDisplayMeta?: ToolDisplayMeta
      turnId?: string
      parentToolUseId?: string
      timestamp?: number
    }
  | {
      type: 'tool_result'
      sessionId: string
      toolUseId: string
      toolName: string
      result: string
      resultDetails?: Record<string, unknown>
      turnId?: string
      parentToolUseId?: string
      isError?: boolean
      timestamp?: number
    }
  | { type: 'error'; sessionId: string; error: string; timestamp?: number }
  | {
      type: 'typed_error'
      sessionId: string
      error: TypedError
      timestamp?: number
    }
  | {
      type: 'complete'
      sessionId: string
      tokenUsage?: Session['tokenUsage']
      hasUnread?: boolean
      backgroundTasksAlive?: boolean
    }
  | {
      type: 'interrupted'
      sessionId: string
      message?: Message
      queuedMessages?: string[]
    }
  | {
      type: 'status'
      sessionId: string
      message: string
      statusType?: 'compacting'
    }
  | {
      type: 'info'
      sessionId: string
      message: string
      statusType?: 'compaction_complete'
      level?: 'info' | 'warning' | 'error' | 'success'
      timestamp?: number
    }
  | { type: 'title_generated'; sessionId: string; title: string }
  | { type: 'title_regenerating'; sessionId: string; isRegenerating: boolean }
  | { type: 'async_operation'; sessionId: string; isOngoing: boolean }
  | {
      type: 'working_directory_changed'
      sessionId: string
      workingDirectory: string
    }
  | {
      type: 'permission_request'
      sessionId: string
      request: PermissionRequest
    }
  | {
      type: 'credential_request'
      sessionId: string
      request: CredentialRequest
    }
  | {
      type: 'permission_mode_changed'
      sessionId: string
      permissionMode: PermissionMode
      previousPermissionMode?: PermissionMode
      transitionDisplay?: string
      modeVersion?: number
      changedAt?: string
      changedBy?: PermissionModeState['changedBy']
    }
  | { type: 'plan_submitted'; sessionId: string; message: Message }
  | { type: 'sources_changed'; sessionId: string; enabledSourceSlugs: string[] }
  | { type: 'labels_changed'; sessionId: string; labels: string[] }
  | { type: 'project_id_changed'; sessionId: string; projectId: string | null }
  | {
      type: 'connection_changed'
      sessionId: string
      connectionSlug: string
      supportsBranching?: boolean
    }
  | {
      type: 'task_backgrounded'
      sessionId: string
      toolUseId: string
      taskId: string
      intent?: string
      turnId?: string
      kind?: 'workflow'
      workflowId?: string
    }
  | {
      type: 'shell_backgrounded'
      sessionId: string
      toolUseId: string
      shellId: string
      intent?: string
      command?: string
      turnId?: string
    }
  | {
      type: 'task_progress'
      sessionId: string
      toolUseId: string
      elapsedSeconds: number
      turnId?: string
    }
  | {
      type: 'task_completed'
      sessionId: string
      taskId: string
      status: 'completed' | 'failed' | 'stopped'
      outputFile?: string
      summary?: string
      turnId?: string
    }
  | {
      type: 'workflow_agent_completed'
      sessionId: string
      workflowId: string
      agentId: string
      turnId?: string
    }
  | { type: 'shell_killed'; sessionId: string; shellId: string }
  | {
      type: 'user_message'
      sessionId: string
      message: Message
      status: 'accepted' | 'queued' | 'processing'
      optimisticMessageId?: string
    }
  | { type: 'session_flagged'; sessionId: string }
  | { type: 'session_unflagged'; sessionId: string }
  | { type: 'session_archived'; sessionId: string }
  | { type: 'session_unarchived'; sessionId: string }
  | { type: 'name_changed'; sessionId: string; name?: string }
  | { type: 'session_model_changed'; sessionId: string; model: string | null }
  | {
      type: 'session_status_changed'
      sessionId: string
      sessionStatus: SessionStatus
    }
  | {
      type: 'session_metadata_changed'
      sessionId: string
      changes: Partial<
        Pick<
          Session,
          | 'kanbanColumn'
          | 'projectId'
          | 'isPinned'
          | 'taskGoal'
          | 'taskPriority'
          | 'taskDueAt'
          | 'taskReminderAt'
          | 'taskReminderAcknowledgedAt'
          | 'taskReminderLastNotifiedAt'
          | 'taskCheckpoints'
        >
      >
    }
  | { type: 'session_deleted'; sessionId: string }
  | { type: 'session_created'; sessionId: string }
  | { type: 'session_shared'; sessionId: string; sharedUrl: string }
  | { type: 'session_unshared'; sessionId: string }
  | {
      type: 'auth_request'
      sessionId: string
      message: Message
      request: SharedAuthRequest
    }
  | {
      type: 'auth_completed'
      sessionId: string
      requestId: string
      success: boolean
      cancelled?: boolean
      error?: string
    }
  | {
      type: 'source_activated'
      sessionId: string
      sourceSlug: string
      originalMessage: string
    }
  | {
      type: 'usage_update'
      sessionId: string
      tokenUsage: { inputTokens: number; contextWindow?: number }
    }
  | {
      type: 'message_annotations_updated'
      sessionId: string
      messageId: string
      annotations: AnnotationV1[]
    }
  | { type: 'working_directory_error'; sessionId: string; error: string }

export interface SendMessageOptions {
  skillSlugs?: string[]
  badges?: ContentBadge[]
  optimisticMessageId?: string
  /**
   * When true, the message drives a turn (reaches the model) but is marked
   * `hidden` on the persisted `Message` so it never renders as a transcript
   * bubble. Used for system-generated nudges (e.g. WS2 background-task-completion
   * surfacing) that should wake the agent without looking user-authored.
   */
  hidden?: boolean
}

// ---------------------------------------------------------------------------
// Session commands (consolidated operations)
// ---------------------------------------------------------------------------

export type SessionCommand =
  | { type: 'flag' }
  | { type: 'unflag' }
  | { type: 'archive' }
  | { type: 'unarchive' }
  | { type: 'rename'; name: string }
  | { type: 'setSessionStatus'; state: SessionStatus }
  | { type: 'markRead' }
  | { type: 'markUnread' }
  | { type: 'setActiveViewing'; workspaceId: string }
  | { type: 'setPermissionMode'; mode: PermissionMode }
  | { type: 'setThinkingLevel'; level: ThinkingLevel }
  | { type: 'updateWorkingDirectory'; dir: string }
  | { type: 'setSources'; sourceSlugs: string[] }
  | { type: 'setLabels'; labels: string[] }
  | { type: 'setProjectId'; projectId: string | null }
  | { type: 'setExpertId'; expertId: string | null }
  | { type: 'setKanbanColumn'; column: string | null }
  | { type: 'setPinned'; pinned: boolean }
  | {
      type: 'setTaskDetails'
      patch: {
        goal?: string | null
        priority?: TaskPriority | null
        dueAt?: number | null
        reminderAt?: number | null
        acknowledgeReminder?: boolean
        markReminderNotified?: boolean
      }
    }
  | { type: 'createTaskCheckpoint'; summary?: string }
  | { type: 'deleteTaskCheckpoint'; checkpointId: string }
  | { type: 'showInFinder' }
  | { type: 'copyPath' }
  | { type: 'shareToViewer' }
  | { type: 'updateShare' }
  | { type: 'revokeShare' }
  | { type: 'refreshTitle' }
  | { type: 'setConnection'; connectionSlug: string }
  | {
      type: 'setPendingPlanExecution'
      planPath: string
      draftInputSnapshot?: string
    }
  | { type: 'markCompactionComplete' }
  | { type: 'markPendingPlanExecutionDispatched' }
  | { type: 'clearPendingPlanExecution' }
  | { type: 'editMessageAsBranch'; messageId: string; content: string }
  | { type: 'deleteMessageAsBranch'; messageId: string }
  | { type: 'addAnnotation'; messageId: string; annotation: AnnotationV1 }
  | { type: 'removeAnnotation'; messageId: string; annotationId: string }
  | {
      type: 'updateAnnotation'
      messageId: string
      annotationId: string
      patch: Partial<AnnotationV1>
    }

export interface NewChatActionParams {
  input?: string
  name?: string
}

// ---------------------------------------------------------------------------
// Permission / credential types
// ---------------------------------------------------------------------------

export type { BasePermissionRequest }

/**
 * Permission request with session context (for multi-session Electron app)
 */
export interface PermissionRequest extends BasePermissionRequest {
  sessionId: string
}

export interface PermissionResponseOptions {
  rememberForMinutes?: number
}

// Re-export for handler convenience
export type { SharedCredentialInputMode as CredentialInputMode }
export type CredentialRequest = SharedCredentialAuthRequest
export type { SharedAuthRequest as AuthRequest }

export interface CredentialResponse {
  type: 'credential'
  value?: string
  username?: string
  password?: string
  headers?: Record<string, string>
  cancelled: boolean
}

// ---------------------------------------------------------------------------
// Directory browsing types (remote mode)
// ---------------------------------------------------------------------------

/** Server-side directory listing result (for remote directory browsing). */
export interface DirectoryListingResult {
  /** Normalized absolute path of the listed directory (after resolve(), not symlink-resolved). */
  currentPath: string
  /** Parent directory path, or null if at root. */
  parentPath: string | null
  /** Pre-split breadcrumb segments for display (computed server-side). */
  breadcrumbs: Array<{ name: string; path: string }>
  /** Server platform info. */
  platform: 'win32' | 'darwin' | 'linux'
  /** Whether the server truncated the directory list for safety/performance. */
  truncated: boolean
  /** Total number of matching child entries before truncation. */
  totalEntries: number
  /** Child entries. Older clients may treat omitted `type` as a directory. */
  entries: Array<{
    name: string
    path: string
    isSymlink: boolean
    type?: 'file' | 'directory'
    size?: number
  }>
}

// ---------------------------------------------------------------------------
// File types
// ---------------------------------------------------------------------------

export interface FileAttachment {
  type: 'image' | 'text' | 'pdf' | 'office' | 'audio' | 'unknown'
  /** Folder refs are lightweight composer-only entries. They are converted to
   *  `[folder:/absolute/path]` mentions and never transported as attachments. */
  kind?: 'file' | 'folder'
  path: string
  name: string
  mimeType: string
  base64?: string
  text?: string
  size: number
  thumbnailBase64?: string
}

export interface SessionFile {
  name: string
  path: string
  type: 'file' | 'directory'
  size?: number
  children?: SessionFile[]
}

export interface FileSearchResult {
  name: string
  path: string
  type: 'file' | 'directory'
  relativePath: string
}

// ---------------------------------------------------------------------------
// LLM connection types
// ---------------------------------------------------------------------------

/**
 * Resolved Anthropic OAuth identity (issue #838), captured from the
 * token-exchange response. Shape mirrors `ClaudeOAuthIdentity` in
 * `auth/claude-oauth.ts`; kept in the protocol layer so DTOs stay decoupled
 * from the auth module. All fields optional and fail-soft.
 */
export interface ClaudeOAuthIdentityDto {
  account?: { uuid?: string; emailAddress?: string }
  organization?: { uuid?: string; name?: string }
}

export interface LlmConnectionSetup {
  slug: string
  credential?: string
  baseUrl?: string | null
  defaultModel?: string | null
  models?: string[] | null
  piAuthProvider?: string
  modelSelectionMode?: 'automaticallySyncedFromProvider' | 'userDefined3Tier'
  /** When true, reject setup if the connection doesn't already exist (reauth guard). */
  updateOnly?: boolean
  /** Custom endpoint protocol for arbitrary OpenAI/Anthropic-compatible APIs */
  customEndpoint?: CustomEndpointConfig
  /** IAM credentials for Pi+Bedrock (piAuthProvider='amazon-bedrock') connections */
  iamCredentials?: {
    accessKeyId: string
    secretAccessKey: string
    sessionToken?: string
  }
  /** AWS region for Pi+Bedrock connections */
  awsRegion?: string
  /** Bedrock authentication method — determines auth type for Pi+Bedrock connections */
  bedrockAuthMethod?: 'iam_credentials' | 'environment'
  /**
   * Resolved Anthropic OAuth identity (issue #838), threaded through setup so it
   * persists for both new and re-auth connections. Optional and fail-soft.
   */
  oauthIdentity?: ClaudeOAuthIdentityDto
}

export interface TestLlmConnectionParams {
  provider: 'anthropic' | 'pi'
  apiKey: string
  baseUrl?: string
  model?: string
  piAuthProvider?: string
  /** Optional custom endpoint protocol hint so setup tests mirror runtime routing */
  customEndpoint?: CustomEndpointConfig
}

export interface TestLlmConnectionResult {
  success: boolean
  error?: string
}

// ---------------------------------------------------------------------------
// Source / skill types
// ---------------------------------------------------------------------------

export interface SkillFile {
  name: string
  type: 'file' | 'directory'
  size?: number
  children?: SkillFile[]
}

export interface OAuthResult {
  success: boolean
  error?: string
}

export interface McpValidationResult {
  success: boolean
  error?: string
  tools?: string[]
}

export interface McpToolWithPermission {
  name: string
  description?: string
  allowed: boolean
}

export interface McpToolsResult {
  success: boolean
  error?: string
  tools?: McpToolWithPermission[]
}

// ---------------------------------------------------------------------------
// Search types
// ---------------------------------------------------------------------------

export interface SessionSearchMatch {
  sessionId: string
  lineNumber: number
  snippet: string
}

export interface SessionSearchResult {
  sessionId: string
  matchCount: number
  matches: SessionSearchMatch[]
}

// ---------------------------------------------------------------------------
// Session result types
// ---------------------------------------------------------------------------

export interface UnreadSummary {
  totalUnreadSessions: number
  byWorkspace: Record<string, number>
  hasUnreadByWorkspace: Record<string, boolean>
}

export interface ShareResult {
  success: boolean
  url?: string
  error?: string
}

export interface RefreshTitleResult {
  success: boolean
  title?: string
  error?: string
}

// ---------------------------------------------------------------------------
// Library (资源库) — v0.16 Phase D
// Re-export shared library types for protocol consumers.
// ---------------------------------------------------------------------------

export type {
  LibraryManifest,
  DocumentMeta,
  DocumentSessionLink,
  DocumentSourceReference,
  DocumentVersionMeta,
  DocumentGenerationMeta,
  LibraryIndexEntry,
  LibraryResourcesIndex,
  LibraryListQuery,
  LibraryDocumentDto,
  LibraryCreateBlankRequest,
  LibraryCreateFromSessionRequest,
  LibraryCreateFromSessionResponse,
  LibraryPrivacyGateResult,
  LibraryUpdateRequest,
  LibraryExportRequest,
  LibraryExportResult,
  LibraryDocumentTemplateId,
  LibraryVersionOp,
  LibraryGenerateMode,
  LibraryExportFormat,
  LibrarySessionStats,
  SessionContentBlock,
  GeneratedDocumentResult,
} from '../library/types.ts'

export interface LibraryGetRequest {
  workspaceId: string
  documentId: string
}

export interface LibraryDocumentActionRequest {
  workspaceId: string
  documentId: string
}

export interface LibraryGetVersionRequest {
  workspaceId: string
  documentId: string
  versionId: string
}

export interface LibraryUnlinkSessionRequest {
  workspaceId: string
  documentId: string
  sessionId: string
}

// ---------------------------------------------------------------------------
// Plan types
// ---------------------------------------------------------------------------

export interface PlanStep {
  id: string
  description: string
  tools?: string[]
  status?: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped'
}

export interface Plan {
  id: string
  title: string
  summary?: string
  steps: PlanStep[]
  questions?: string[]
  state?: 'creating' | 'refining' | 'ready' | 'executing' | 'completed' | 'cancelled'
  createdAt?: number
  updatedAt?: number
}

// ---------------------------------------------------------------------------
// System types
// ---------------------------------------------------------------------------

export interface GitBashStatus {
  found: boolean
  path: string | null
  platform: 'win32' | 'darwin' | 'linux'
}

export interface UpdateInfo {
  available: boolean
  currentVersion: string
  latestVersion: string | null
  downloadState: 'idle' | 'downloading' | 'ready' | 'installing' | 'manual' | 'error'
  downloadProgress: number
  installMode?: 'automatic' | 'manual'
  releaseUrl?: string
  error?: string
}

// ---------------------------------------------------------------------------
// Workspace types
// ---------------------------------------------------------------------------

export interface WorkspaceSettings {
  name?: string
  model?: string
  permissionMode?: PermissionMode
  cyclablePermissionModes?: PermissionMode[]
  thinkingLevel?: ThinkingLevel
  workingDirectory?: string
  localMcpEnabled?: boolean
  defaultLlmConnection?: string
  enabledSourceSlugs?: string[]
}

// ---------------------------------------------------------------------------
// Auth result types
// ---------------------------------------------------------------------------

export interface ClaudeOAuthResult {
  success: boolean
  token?: string
  error?: string
  /**
   * Resolved Anthropic identity (issue #838), forwarded to the renderer so it
   * can thread it into the SETUP payload (which is what persists it). Present
   * only when the token-exchange response carried identity.
   */
  identity?: ClaudeOAuthIdentityDto
}

// ---------------------------------------------------------------------------
// Automation types
// ---------------------------------------------------------------------------

export type TestAutomationAction =
  | {
      type: 'prompt'
      prompt: string
      llmConnection?: string
      model?: string
      thinkingLevel?: ThinkingLevel
    }
  | {
      type: 'webhook'
      url: string
      method?: string
      headers?: Record<string, string>
      bodyFormat?: 'json' | 'form' | 'raw'
      body?: unknown
      captureResponse?: boolean
      auth?: { type: 'basic'; username: string; password: string } | { type: 'bearer'; token: string }
    }

export interface TestAutomationPayload {
  workspaceId: string
  automationId?: string
  automationName?: string
  actions: TestAutomationAction[]
  permissionMode?: PermissionMode
  labels?: string[]
}

export type TestAutomationActionResult =
  | {
      type: 'prompt'
      success: boolean
      stderr?: string
      sessionId?: string
      duration: number
    }
  | {
      type: 'webhook'
      success: boolean
      url: string
      statusCode: number
      error?: string
      duration: number
    }

export interface TestAutomationResult {
  actions: TestAutomationActionResult[]
}

// ---------------------------------------------------------------------------
// Window types
// ---------------------------------------------------------------------------

export type WindowCloseRequestSource = 'keyboard-shortcut' | 'window-button' | 'unknown'

export interface WindowCloseRequest {
  source: WindowCloseRequestSource
}

// ---------------------------------------------------------------------------
// Browser / navigation types (data shapes used by BroadcastEventMap)
// ---------------------------------------------------------------------------

export interface BrowserInstanceInfo {
  id: string
  url: string
  title: string
  favicon: string | null
  isLoading: boolean
  canGoBack: boolean
  canGoForward: boolean
  boundSessionId: string | null
  ownerType: 'session' | 'manual'
  ownerSessionId: string | null
  isVisible: boolean
  agentControlActive: boolean
  themeColor: string | null
  /**
   * Workspace that owns this browser instance, or `null` for unbound manual
   * windows. Renderers filter the tab strip / status badge by `activeWorkspaceId`
   * so a session in workspace A doesn't see windows opened by workspace B.
   * Missing/null entries always pass the filter — this keeps older renderers
   * and main processes that pre-date the field working unchanged.
   */
  workspaceId?: string | null
  /** Integrated browser toolbar layout. Floating mode is rendered as a native overlay. */
  toolbarMode?: 'fixed' | 'floating'
  /** Renderer-managed tab pin state, persisted with the browser workspace. */
  pinned?: boolean
  /** Whether audio from this page is muted. */
  muted?: boolean
  /** True after automatic renderer recovery is exhausted and user action is required. */
  crashed?: boolean
  /** Last Chromium renderer termination reason, safe for diagnostics/UI. */
  crashReason?: string | null
  /** Consecutive recovery attempts within the current crash window. */
  crashRecoveryAttempts?: number
}

export interface BrowserBookmarkEntry {
  id: string
  workspaceId: string | null
  url: string
  title: string
  favicon: string | null
  folderId?: string | null
  createdAt: number
}

export interface BrowserBookmarkFolder {
  id: string
  workspaceId: string | null
  name: string
  createdAt: number
}

export interface BrowserHistoryEntry {
  id: string
  workspaceId: string | null
  tabId: string
  url: string
  title: string
  favicon: string | null
  visitedAt: number
}

export interface BrowserDownloadRecord {
  id: string
  workspaceId: string | null
  tabId: string
  timestamp: number
  url: string
  filename: string
  state: string
  bytesReceived: number
  totalBytes: number
  mimeType: string
  savePath?: string
}

export interface BrowserExtensionEntry {
  id: string
  name: string
  version: string
  path: string
  description?: string
  icon?: string | null
  permissions?: string[]
  homepageUrl?: string | null
  manifestVersion?: number | null
  enabled: boolean
  hasAction: boolean
  pinned: boolean
  hidden: boolean
  order: number
}

export interface BrowserPermissionEntry {
  origin: string
  permission: string
  allowed: boolean
  updatedAt: number
}

export type BrowserProfileCollectionKind = 'bookmarks' | 'history' | 'downloads' | 'permissions'

export type BrowserLinkOpenBehavior = 'internal' | 'system' | 'ask'
export type BrowserNewTabBehavior = 'default' | 'blank' | 'custom'
export type BrowserPermissionBehavior = 'ask' | 'block'
export type BrowserDataTimeRange = 'hour' | 'day' | 'week' | 'four-weeks' | 'all'

export interface BrowserSettings {
  linkOpenBehavior: BrowserLinkOpenBehavior
  newTabBehavior: BrowserNewTabBehavior
  customNewTabUrl: string
  downloadPath: string
  askDownloadLocation: boolean
  permissionBehavior: BrowserPermissionBehavior
}

export interface BrowserClearDataRequest {
  timeRange: BrowserDataTimeRange
  history: boolean
  downloads: boolean
  cookiesAndSiteData: boolean
  cache: boolean
  permissions: boolean
}

export interface BrowserSiteDataSummary {
  origin: string
  cookieCount: number
}

export interface BrowserWorkspaceSnapshot {
  version: 1
  activeTabId: string | null
  tabs: Array<{
    id: string
    url: string
    title: string
    /** Tab favicon URL (data: or http), null when unknown. */
    favicon?: string | null
    /** Epoch ms when the tab was first created. */
    createdAt?: number
    /** Epoch ms when the tab was last focused/active. */
    lastAccessedAt?: number
    /** Serialized page state (e.g. scroll position), reserved for restore. */
    pageState?: string | null
    /** Task that owns this tab. Restored tabs re-bind to the same task. */
    ownerSessionId?: string | null
    /** Pinned tabs remain at the top of the vertical tab list. */
    pinned?: boolean
  }>
  updatedAt: number
}

export interface DeepLinkNavigation {
  view?: string
  tabType?: string
  tabParams?: Record<string, string>
  action?: string
  actionParams?: Record<string, string>
}

// ---------------------------------------------------------------------------
// Inline visualization widget types
// ---------------------------------------------------------------------------

export interface ReadWidgetFileRequest {
  sessionId: string
  file: string
}

export type ReadWidgetFileResult =
  | { ok: true; html: string; resolvedPath: string }
  | {
      ok: false
      error: string
      code: 'invalid-request' | 'session-not-found' | 'access-denied' | 'not-found' | 'read-failed'
    }

export interface ReadMcpWidgetResourceRequest {
  sessionId: string
  serverSlug: string
  uri: string
}

export type ReadMcpWidgetResourceResult =
  | {
      ok: true
      html: string
      mimeType: string
      resourceMeta?: Record<string, unknown>
    }
  | {
      ok: false
      error: string
      code: 'invalid-request' | 'session-not-found' | 'not-connected' | 'not-found' | 'invalid-resource'
    }

export interface CallMcpWidgetToolRequest {
  sessionId: string
  serverSlug: string
  toolName: string
  arguments?: Record<string, unknown>
  approved?: boolean
}

export type CallMcpWidgetToolResult =
  | { ok: true; result: import('../mcp/mcp-pool.ts').McpToolResult }
  | {
      ok: false
      error: string
      code: 'invalid-request' | 'session-not-found' | 'not-connected' | 'permission-required' | 'permission-denied' | 'tool-failed'
      requiresApproval?: boolean
      destructive?: boolean
    }

// ---------------------------------------------------------------------------
// Privacy-safe diagnostics
// ---------------------------------------------------------------------------

export interface DiagnosticBundle {
  version: 2
  generatedAt: string
  application: {
    version: string
    isPackaged: boolean
    locale: string
  }
  runtime: {
    platform: NodeJS.Platform
    arch: string
    node: string
    electron: string
    chromium: string
    uptimeSeconds: number
  }
  startup: {
    /** Monotonic milliseconds since process start; contains only fixed milestone names. */
    milestonesMs: Record<string, number>
  }
  resources: {
    electronProcesses: {
      total: number
      byType: Record<string, number>
      totalWorkingSetMb: number
      largestPeakWorkingSetMb: number
    }
    mainProcessMemory: {
      rssMb: number
      heapUsedMb: number
      heapTotalMb: number
      externalMb: number
    }
    /** Aggregate Node resource classes such as timeout/pipe-wrap; never values or paths. */
    activeResources: Record<string, number>
    appEventListeners: Record<string, number>
  }
  proxy: {
    mode: 'system' | 'custom'
    configuredProtocols: string[]
    hasBypassRules: boolean
  }
  browser: {
    totalTabs: number
    visibleTabs: number
    crashedTabs: Array<{ reason: string | null; attempts: number }>
  }
  update: {
    provider: 'generic'
    channel: 'latest'
    manifest: 'latest.yml' | 'latest-mac.yml' | 'latest-linux.yml'
    currentVersion: string
    latestVersion: string | null
    downloadState: string
    installMode: 'automatic' | 'manual'
    manualRecoveryAvailable: boolean
    allowDowngrade: boolean
    autoInstallOnAppQuit: boolean
    cacheDirectoryResolved: boolean
    cacheMigrationVersion: string
    cacheMigrationApplied: boolean
    lastCacheCleanupResult: 'not-attempted' | 'succeeded' | 'failed'
  }
  plugins: {
    installedCount: number
    mcp: {
      checkedAt: string | null
      total: number
      states: Record<string, number>
      errorTypes: Record<string, number>
    }
  }
  services: {
    sessionManagerReady: boolean
    browserManagerReady: boolean
    messagingBindings: number
    messagingConfiguredPlatforms: number
    messagingConnectedPlatforms: number
  }
  privacy: {
    rawLogsIncluded: false
    urlsIncluded: false
    workspacePathsIncluded: false
    processIdsIncluded: false
    commandLinesIncluded: false
    redactionVersion: 1
  }
}

export interface DiagnosticExportResult {
  canceled: boolean
  path?: string
}

export interface GitChangedFile {
  path: string
  indexStatus: string
  worktreeStatus: string
  staged: boolean
}

export interface GitRepositoryStatus {
  isRepository: boolean
  root?: string
  branch?: string
  detached?: boolean
  upstream?: string
  ahead: number
  behind: number
  files: GitChangedFile[]
  branches: string[]
  remotes: Array<{ name: string; url: string }>
  pullRequest?: { url: string; title?: string; state?: string }
  error?: string
}

export type GitAction =
  | { type: 'stageAll' }
  | { type: 'unstageAll' }
  | { type: 'commit'; message: string }
  | { type: 'checkout'; branch: string }
  | { type: 'createBranch'; branch: string }
  | { type: 'pull' }
  | { type: 'push' }
  | { type: 'sync' }
  | { type: 'diff'; path?: string; staged?: boolean; base?: string }
  | { type: 'createPullRequest' }

export interface GitActionResult {
  ok: boolean
  output?: string
  url?: string
  error?: string
}

// ---------------------------------------------------------------------------
// Cognition (Event Ledger diagnostics — Phase 2)
// ---------------------------------------------------------------------------

export interface CognitionListEventsRequest {
  workspaceId: string
  afterSequence?: number
  beforeSequence?: number
  projectId?: string
  sessionId?: string
  types?: string[]
  fromTimestamp?: number
  toTimestamp?: number
  limit?: number
  offset?: number
}

export interface CognitionEventSummary {
  id: string
  sequence: number
  type: string
  source: string
  timestamp: number
  sessionId?: string
  projectId?: string
  correlationId?: string
  idempotencyKey?: string
  summary: string
  /** Compact payload for diagnostics — may omit large fields. */
  payload: Record<string, unknown>
}

export interface CognitionStoreStatusDto {
  schemaVersion: number
  eventCount: number
  nextSequence: number
  lastProcessedSequence: number
  lastEventAt?: number
  lastProcessedEventId?: string
  migrationsApplied: string[]
  lastRepairNote?: string
}

export interface CognitionListObservationsRequest {
  workspaceId: string
  sessionId?: string
  projectId?: string
  categories?: string[]
  limit?: number
  offset?: number
}

export interface CognitionObservationDto {
  id: string
  workspaceId?: string
  projectId?: string
  sessionId?: string
  title: string
  summary: string
  category: string
  confidence: number
  importance: number
  sourceEventIds: string[]
  createdAt: number
  updatedAt: number
}

export interface CognitionListLoopsRequest {
  workspaceId: string
  sessionId?: string
  projectId?: string
  statuses?: string[]
  includeResolved?: boolean
  limit?: number
  offset?: number
}

export interface CognitionLoopDto {
  id: string
  workspaceId?: string
  projectId?: string
  sessionId?: string
  title: string
  summary: string
  status: string
  nextAction?: string
  blocker?: string
  waitingFor?: string
  importance: number
  confidence: number
  observationIds: string[]
  /** Originating source kinds propagated from merged guidance items, if any. */
  sourceKinds?: string[]
  firstSeenAt: number
  lastUpdatedAt: number
  resolvedAt?: number
  userManaged?: boolean
}

export interface CognitionLoopActionRequest {
  workspaceId: string
  loopId: string
}

export interface CognitionListReflectionsRequest {
  workspaceId: string
  type?: 'task' | 'daily'
  sessionId?: string
  projectId?: string
  dayKey?: string
  latestOnly?: boolean
  limit?: number
  offset?: number
}

export interface CognitionReflectionDto {
  id: string
  type: string
  workspaceId?: string
  projectId?: string
  sessionId?: string
  title: string
  summary: string
  completed: string[]
  changes: string[]
  unresolved: string[]
  blockers: string[]
  nextActions: string[]
  sourceObservationIds: string[]
  sourceLoopIds: string[]
  createdAt: number
  dayKey?: string
}

export interface CognitionListGuidanceRequest {
  workspaceId: string
  sessionId?: string
  projectId?: string
  types?: string[]
  includeDismissed?: boolean
  limit?: number
  offset?: number
  /** Debug page: skip product/Today policy filter. */
  forDebug?: boolean
  /** Product Today path (default true when not forDebug). */
  forToday?: boolean
}

export interface CognitionGuidanceDto {
  id: string
  type: string
  title: string
  reason: string
  action: string
  importance: number
  confidence: number
  score?: number
  targetLoopId?: string
  targetSessionId?: string
  sourceReflectionId?: string
  sourceObservationIds: string[]
  sourceLoopIds: string[]
  /** Provenance kinds (v2). */
  sourceKinds?: string[]
  sourceEventIds?: string[]
  /** When forDebug + policy would hide on product path. */
  policyHidden?: boolean
  projectId?: string
  createdAt: number
  dismissedAt?: number
}

export interface CognitionGuidanceActionRequest {
  workspaceId: string
  guidanceId: string
}

export interface CognitionRefreshGuidanceRequest {
  workspaceId: string
  projectId?: string
  includeDaily?: boolean
}

export interface CognitionRefreshGuidanceResultDto {
  dailyReflection: CognitionReflectionDto | null
  guidanceCount: number
}

// ---------------------------------------------------------------------------
// Privacy / context-awareness (v0.16 Phase B)
// ---------------------------------------------------------------------------

export type PrivacyPermission3Dto = 'deny' | 'ask' | 'allow'

export interface PrivacyPolicyDto {
  schemaVersion: number
  contextAwarenessEnabled: boolean
  today: { useContext: boolean }
  privacyMode: {
    active: boolean
    activatedAt?: number
    resumeAt?: number | null
    pauseAutomations: boolean
    persistAcrossRestart: boolean
  }
  sources: {
    session: {
      meta: PrivacyPermission3Dto
      body: PrivacyPermission3Dto
      attachments: PrivacyPermission3Dto
      archived: PrivacyPermission3Dto
    }
    browser: {
      urlTitle: PrivacyPermission3Dto
      pageContent: PrivacyPermission3Dto
      history: PrivacyPermission3Dto
    }
    git: {
      statusMeta: PrivacyPermission3Dto
      diffContent: PrivacyPermission3Dto
      mutate: PrivacyPermission3Dto
    }
    files: {
      metadata: PrivacyPermission3Dto
      content: PrivacyPermission3Dto
      roots: string[]
    }
    messaging: {
      wechat: PrivacyPermission3Dto
      lark: PrivacyPermission3Dto
    }
    automation: PrivacyPermission3Dto
    mcpPlugins: PrivacyPermission3Dto
    projectMemory: PrivacyPermission3Dto
    library: {
      generateWithModel: PrivacyPermission3Dto
      autoDetectSync: boolean
    }
  }
  retention: {
    accessLogDays: number
    accessLogMaxEntries: number
    cognitionDays?: number | null
  }
  updatedAt: number
  resolvedFrom?: Array<'privacy_mode' | 'workspace' | 'user' | 'default'>
  effectivePrivacyModeActive?: boolean
  policyVersion?: string
}

export interface PrivacyGetPolicyRequest {
  workspaceId: string
}

export interface PrivacySetPolicyRequest {
  workspaceId: string
  /** User-level policy patch (preferences.privacy). */
  policy: Partial<PrivacyPolicyDto>
  /** When true, write workspace override instead of user prefs. */
  workspaceOverride?: boolean
}

export interface PrivacyModeDto {
  active: boolean
  activatedAt?: number
  resumeAt?: number | null
  pauseAutomations: boolean
  persistAcrossRestart: boolean
}

export interface PrivacySetModeRequest {
  workspaceId: string
  mode: Partial<PrivacyModeDto> & { active: boolean }
}

export interface PrivacyListAccessLogRequest {
  workspaceId: string
  limit?: number
}

export interface PrivacyAccessLogEntryDto {
  schemaVersion: number
  id: string
  at: number
  feature: string
  sources: string[]
  scope: string
  purpose: string
  sentToModel: boolean
  connectionId?: string
  model?: string
  decision: string
  code: string
  workspaceId: string
  policyVersion: string
}

export interface PrivacyClearDataRequest {
  workspaceId: string
  target: {
    cognition?: boolean
    accessLog?: boolean
    exploreBriefCache?: boolean
    browserCognitionEvents?: boolean
  }
}

export interface PrivacyClearDataResultDto {
  cleared: string[]
  skipped: string[]
}

export interface PrivacyStorageUsageDto {
  workspaceId: string
  cognitionBytes: number
  accessLogBytes: number
  privacyDirBytes: number
  totalBytes: number
}

/** Hard-coded never-collect kinds shown in Settings → Privacy. */
export const PRIVACY_NEVER_COLLECT_DTO = [
  'cookie',
  'token',
  'password',
  'form_sensitive',
] as const
