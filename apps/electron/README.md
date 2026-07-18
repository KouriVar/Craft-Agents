# Craft Agents Electron App

The primary desktop interface for Craft Agents, built with Electron + React. Provides a multi-session inbox with chat interface for interacting with Claude via Craft workspaces.

## Quick Start

```bash
# From the project root
bun run electron:build   # Build the app
bun run electron:start   # Build and run
```

## Architecture

```
apps/electron/
├── src/
│   ├── main/              # Electron main process
│   │   ├── index.ts       # Window creation, app lifecycle
│   │   ├── browser-pane-manager.ts # Persistent Chromium runtime and shared Agent control
│   │   ├── browser-profile-store.ts # Tabs, history, bookmarks, downloads, extension preferences
│   │   ├── browser-password-vault.ts # Keychain / safeStorage credential vault
│   │   ├── ipc.ts         # IPC handler registration
│   │   ├── menu.ts        # Application menu (File, Edit, View, Help)
│   │   ├── sessions.ts    # Session management, CraftAgent integration
│   │   ├── deep-link.ts   # Deep link URL parsing and handling
│   │   ├── agent-service.ts # Agent listing, caching, auth checking
│   │   └── sources-service.ts # Source and authentication service
│   ├── preload/           # Context bridges (main ↔ renderer / browser pages)
│   │   ├── bootstrap.ts   # Exposes electronAPI to renderer
│   │   ├── browser-toolbar.ts # Native browser toolbar bridge
│   │   └── browser-page.ts # Credential capture, autofill, and store-extension install bridge
│   ├── renderer/          # React UI
│   │   ├── App.tsx        # Main app, event handling
│   │   ├── components/
│   │   │   ├── chat/      # Chat UI (ChatInput, ChatDisplay)
│   │   │   ├── markdown/  # Markdown renderer with Shiki
│   │   │   └── ui/        # shadcn/ui components (incl. source-avatar.tsx)
│   │   ├── contexts/
│   │   │   └── NavigationContext.tsx  # Type-safe routing and navigation
│   │   ├── lib/
│   │   │   └── navigate.ts  # Global navigate() function
│   │   ├── hooks/
│   │   │   └── useAgentState.ts  # Agent activation state machine
│   │   └── playground/    # Component development playground
│   └── shared/
│       ├── types.ts       # Shared TypeScript interfaces
│       ├── routes.ts      # Type-safe route definitions
│       └── route-parser.ts # Route string parsing
├── dist/                  # Build output
└── resources/             # App icons
```

## Key Learnings & Gotchas

### 1. SDK Path Resolution (CRITICAL)

The Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) spawns a native `claude` binary from a per-platform optional dependency (`@anthropic-ai/claude-agent-sdk-{platform}-{arch}`). Packaged Electron builds must point the SDK at the staged binary because normal optional-dependency resolution does not work inside the packaged resource layout.

**Runtime resolution:** `packages/shared/src/agent/backend/internal/runtime-resolver.ts` probes the build-script alias first:

```text
node_modules/@anthropic-ai/claude-agent-sdk-binary/{claude,claude.exe}
```

and falls back to the real per-arch package in dev. Once resolved, `applyAnthropicRuntimeBootstrap()` calls `setPathToClaudeCodeExecutable(path)` before any Claude agents are created.

### 2. Authentication Environment Setup (CRITICAL)

The SDK requires authentication environment variables to be set BEFORE creating agents. The Electron app must do this explicitly during initialization.

```typescript
import { getAuthState } from '../../../src/auth/state'

// In initialize():
const authState = await getAuthState()
const { billing } = authState

if (billing.type === 'oauth_token' && billing.claudeOAuthToken) {
  process.env.CLAUDE_CODE_OAUTH_TOKEN = billing.claudeOAuthToken
} else if (billing.apiKey) {
  process.env.ANTHROPIC_API_KEY = billing.apiKey
}
```

### 3. AgentEvent Type Mismatches

The `AgentEvent` types from `CraftAgent` use different property names than you might expect:

| Event Type | Wrong | Correct |
|------------|-------|---------|
| `text_delta` | `event.delta` | `event.text` |
| `error` | `event.error` | `event.message` |
| `tool_result` | `event.toolName` | Only has `event.toolUseId` |

**Solution for tool_result:** Track `toolUseId → toolName` mapping from `tool_start` events:
```typescript
interface ManagedSession {
  // ...
  pendingTools: Map<string, string>  // toolUseId -> toolName
}

// In tool_start handler:
managed.pendingTools.set(event.toolUseId, event.toolName)

// In tool_result handler:
const toolName = managed.pendingTools.get(event.toolUseId) || 'unknown'
managed.pendingTools.delete(event.toolUseId)
```

### 4. CraftAgent Constructor

`CraftAgent` expects the full `Workspace` object, not just the ID:

```typescript
// Wrong:
new CraftAgent({ workspaceId: workspace.id, model })

// Correct:
new CraftAgent({ workspace, model })
```

### 5. esbuild Configuration

Only `electron` is externalized. The SDK is bundled into `main.js`:

```json
"electron:build:main": "esbuild ... --external:electron"
```

This means:
- SDK code is inlined (~950KB)
- SDK's runtime path resolution breaks (see #1)
- Native modules would need explicit externalization

## Environment Variables

### Gmail OAuth (via 1Password CLI)

Gmail OAuth credentials are synced from 1Password to a local `.env` file.

**One-time setup:**
```bash
# 1. Install 1Password CLI
brew install 1password-cli

# 2. Enable CLI integration: 1Password app → Settings → Developer → CLI Integration

# 3. Sync secrets (requires Touch ID once)
bun run sync-secrets
```

**That's it!** Now `bun run electron:dev` and `bun run electron:start` work without prompts.

**How it works:**
- `.env.1password` contains `op://` references to the `Dev_Craft_Agents` vault
- `bun run sync-secrets` resolves references → writes `.env` (gitignored)
- Secrets are baked into the build at compile time via esbuild `--define` flags

**Creating your own OAuth credentials:**
1. Go to [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials
2. Create OAuth Client ID (Desktop app type)
3. Enable required scopes in OAuth consent screen:
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/userinfo.email`

## Build Process

```bash
bun run electron:build:main      # Bundle main process (esbuild)
bun run electron:build:preload   # Bundle preload script (esbuild)
bun run electron:build:renderer  # Bundle React app (Vite)
bun run electron:build:resources # Copy icons
bun run electron:build           # All of the above
```

For distributable desktop artifacts, use `scripts/package-menu.sh`. It builds macOS arm64, Windows x64, and Linux x64 AppImage packages and copies only release files to `${CRAFT_PACK_OUTPUT_DIR:-~/Downloads/Craft Pack}`. Intermediate unpacked applications remain under `release/`.

Large target runtimes are cached between builds. Bun and target-native ripgrep downloads use a persistent cache with retries, resume support, and SHA-256 verification; uv is retained under `resources/bin/<platform-arch>`, while npm and electron-builder reuse their own caches. Cross-builds explicitly stage target-native ripgrep, koffi, uv, SDK, and Pi subprocess resources instead of copying host binaries.

## macOS App Icon

The packaged macOS app uses `resources/icon.icns` for the Dock and Finder icon. A pre-compiled `Assets.car` may exist in `resources/` for experimentation, but the packaging hook removes it from the app bundle so macOS does not switch to a different icon after launch.

**Regenerating after icon changes:**

If you modify `resources/source.png`, regenerate the platform icons:

```bash
cd apps/electron
./resources/generate-icons.sh
```

## Debugging

Enable console logging by checking the terminal where you ran `electron:start`. Key log prefixes:
- `[SessionManager]` - Session lifecycle, auth setup
- `[IPC]` - Inter-process communication

DevTools opens automatically (configured in `index.ts`). Remove `mainWindow.webContents.openDevTools()` for production.

## Current Limitations

1. Chromium extensions run through Electron's supported extension API subset; extensions that require Chrome-only APIs may be partially unavailable.
2. iCloud Keychain synchronization and Touch ID WebAuthn require a correctly signed macOS build with the configured keychain entitlement.

## Implemented Features

- **Session persistence** - Sessions, messages, and names are saved to disk
- **File attachments** - Attach images, PDFs, and code files to messages
- **AI-generated titles** - Sessions get automatic titles after first exchange
- **Subagent support** - Load and apply agent definitions from Craft documents
- **Shell integration** - Open URLs in browser, open files in default apps
- **Permission modes** - Three-level permission system (Explore, Ask to Edit, Auto)
- **Background tasks** - Run long-running tasks in background with progress tracking
- **Multi-file diff** - VS Code-style window for viewing all file changes in a turn
- **Dynamic statuses** - Workspace-customizable session workflow states
- **Theme system** - Cascading themes (app → workspace → agent)
- **Agent state machine** - useAgentState hook manages activation flow
- **Application menu** - Standard macOS/Windows menus with keyboard shortcuts
- **Focus mode** - Hides sidebars, top chrome, and macOS traffic lights with top-edge mouse reveal, a platform-specific shortcut hint, and automatic layout restoration after restart
- **Platform typography** - Keeps native system/PingFang typography on macOS and bundles Source Han Sans CN for sharper Simplified Chinese text on Windows
- **Component playground** - Development tool for testing UI components in isolation
- **Type-safe navigation** - Unified routing system for tabs, actions, and deep links
- **Persistent browser workspace** - Shared tabs, login state, history, bookmarks, downloads, OAuth popups, extensions, password autofill, and Agent control
- **Chromium extension management** - Google/Microsoft store install, CRX/ZIP/unpacked import, metadata, permissions, pinning, and action launch
- **Session usage details** - Context-window progress, input/output/cache tokens, provider pricing mode, and estimated API cost
- **Pi ModelRuntime** - Pi 0.80.10 with in-process credentials, model switching, and shared runtime behavior

## Navigation System

The app uses a type-safe routing system for all internal navigation and deep links.

### Quick Start

```typescript
import { navigate, routes } from '@/lib/navigate'

// Tab routes
navigate(routes.tab.settings())           // Open settings
navigate(routes.tab.chat('session123'))   // Open chat
navigate(routes.tab.agentInfo('claude'))  // Open agent info

// Action routes
navigate(routes.action.newChat({ agentId: 'claude' }))  // New chat with agent
navigate(routes.action.deleteSession('id'))             // Delete session

// Sidebar routes
navigate(routes.sidebar.inbox())          // Show inbox
navigate(routes.sidebar.flagged())        // Show flagged
```

### Deep Links

External apps can navigate using `craftagents://` URLs:

```
craftagents://settings
craftagents://allSessions/session/session123
craftagents://sources/source/github
craftagents://action/new-chat
craftagents://workspace/{id}/allSessions/session/abc123
```

See `CLAUDE.md` for complete route reference.

## File Overview

| File | Purpose |
|------|---------|
| `main/index.ts` | App entry, window creation |
| `main/sessions.ts` | CraftAgent wrapper, event processing, source integration |
| `main/ipc.ts` | IPC channel handlers (sessions, files, shell) |
| `main/menu.ts` | Application menu (File, Edit, View, Help) |
| `main/deep-link.ts` | Deep link URL parsing and handling |
| `main/sources-service.ts` | Source loading and authentication service |
| `preload/bootstrap.ts` | Context bridge API |
| `preload/browser-page.ts` | Browser-page credentials and extension-store injection |
| `main/browser-pane-manager.ts` | Persistent browser tabs, profile, extensions, passwords, and Agent control |
| `renderer/App.tsx` | React root, state management |
| `renderer/contexts/NavigationContext.tsx` | Type-safe routing and navigation handler |
| `renderer/lib/navigate.ts` | Global navigate() function |
| `renderer/hooks/useAgentState.ts` | Agent activation state machine (IPC-based) |
| `renderer/hooks/useBackgroundTasks.ts` | Background task tracking |
| `renderer/hooks/useStatuses.ts` | Workspace status configuration |
| `renderer/hooks/useTheme.ts` | Cascading theme resolution |
| `renderer/components/chat/Chat.tsx` | Main chat layout with resizable panels |
| `renderer/components/chat/ChatInput.tsx` | Message input with file attachments |
| `renderer/components/chat/ChatDisplay.tsx` | Message list with markdown rendering |
| `renderer/components/app-shell/input/structured/PermissionRequest.tsx` | Bash command approval UI |
| `renderer/components/chat/SessionList.tsx` | Session sidebar with rename support |
| `renderer/components/chat/AttachmentPreview.tsx` | File attachment bubbles |
| `renderer/components/ui/source-avatar.tsx` | Unified source icon component |
| `renderer/playground/` | Component development playground |
| `shared/types.ts` | IPC channels, Message/Session/FileAttachment types |
| `shared/routes.ts` | Type-safe route definitions and builders |
| `shared/route-parser.ts` | Route string parsing utilities |
