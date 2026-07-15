# Agent Extension Runtime

Craft Agent's extension runtime is the compatibility target for open, local-first agent capabilities. The goal is not to clone any single host product. The goal is to support the shared protocol surfaces that let skills, plugins, MCP tools, and interactive widgets compose cleanly while preserving Craft Agent's own interface, model choices, and local customization.

## Design Goal

Craft Agent should be able to load a capability package, advertise the right instructions and tools to the active agent, render any returned widget in the Craft interface, and let that widget continue the workflow through session-bound messages or tool calls.

The runtime should be compatible with common agent ecosystem formats where useful and Craft-native where the product needs its own behavior.

## Five Layers

### 1. Skill Layer

Reusable workflow instructions should be portable across agent hosts.

Target capabilities:

- Read `SKILL.md` directories from bundled, global, workspace, and project scopes.
- Prefer the open agent skills shape: `name`, `description`, instructions, optional references, scripts, and assets.
- Support progressive disclosure: advertise concise skill summaries first, then load full instructions only when selected.
- Allow explicit skill mentions and implicit matching from descriptions.
- Preserve Craft Agent metadata such as icons, required sources, and tool allowances without breaking portable skills.

### 2. Plugin Package Layer

Installable capability bundles should collect related skills, tools, widgets, assets, and hooks behind one manifest.

Target capabilities:

- Read a Craft plugin manifest and the core fields of `.codex-plugin/plugin.json` when present.
- Bundle `skills/`, MCP configuration, widget assets, and plugin presentation metadata.
- Support local filesystem and Git-backed installs before any hosted marketplace work.
- Enable, disable, inspect, and remove plugins without deleting user data.
- Keep Craft-specific extensions namespaced so compatibility fields remain portable.

Current implementation baseline:

- Recognizes `.craft-plugin/plugin.json`, `.codex-plugin/plugin.json`, and `.claude-plugin/plugin.json`.
- Normalizes core package metadata such as `name`, `displayName`, `version`, `description`, `author`, `license`, `keywords`, `defaultEnabled`, and dependencies.
- Discovers package-local `skills/`, manifest-declared skill folders, `.mcp.json`, `.app.json`, and common widget asset folders.
- Uses the shared manifest reader for workspace/plugin name resolution.
- Stores workspace plugin state in `plugins/config.json`, including install path, manifest path, manifest format, source, enabled state, and display metadata.
- Applies plugin enabled state to package-local skill discovery and skill validation.
- Exposes RPC lifecycle entrypoints to list, install Git plugin packages, register local plugin packages, enable or disable them, unregister them, and remove CA-managed plugin directories.
- Installs Git plugin packages into `plugins/installed/{safePluginName}` and records source URL/ref metadata for future update flows.

Not implemented yet:

- Git-backed plugin update workflows beyond reinstalling the managed package.

### 3. MCP And Tool Layer

Tools should expose typed actions and structured results independent of the model backend.

Target capabilities:

- Support session-scoped tools and plugin-provided MCP servers through one registry.
- Support STDIO and streamable HTTP MCP transports where practical.
- Preserve tool schemas, read/write hints, approval policy, and timeout policy.
- Return `content`, `structuredContent`, and `_meta` so the model and widget can each receive the right data.
- Let plugins provide tools without hard-coding each tool in the main application.

Current implementation baseline:

- Uses a centralized `McpClientPool` for HTTP/SSE/stdio MCP connections and source/API proxy tools.
- Registers MCP tools through the `mcp__{slug}__{toolName}` naming convention.
- Loads plugin-provided MCP servers from manifest `mcpServers` and `.mcp.json` / plugin-local MCP config files.
- Merges enabled plugin MCP servers into session MCP server builds, so plugin tools are available through the same pool as workspace sources.
- Supports plugin MCP stdio fields including `command`, `args`, `env`, `envVars`, and plugin-relative `cwd`.
- Supports plugin MCP HTTP/SSE fields including `url`, `headers`, and `bearerTokenEnvVar`.
- Preserves MCP tool annotations through proxy tool definitions, the in-process Claude proxy, and the HTTP pool server.
- Honors MCP `annotations.readOnlyHint` in Explore mode so declared read-only plugin tools can run without broad allowlist patterns.
- Preserves MCP tool `structuredContent` and `_meta` through the pool, in-process Claude proxy, and HTTP pool server while keeping text `content` backward-compatible for chat display.
- Preflights plugin MCP commands, working directories, and declared environment dependencies before session startup; unavailable servers are skipped with a persisted diagnostic instead of failing silently.
- Exposes plugin MCP status and on-demand connection diagnostics, including transport, tool names, schema/auth errors, missing dependencies, and check duration.
- Automatically restarts failed plugin MCP transports and safely replays resource reads and tools declared read-only; mutating tools are never replayed after an ambiguous disconnect.

Not implemented yet:

- No remaining common-protocol MCP/tool gaps are tracked for the current compatibility target.

### 4. Apps And Widget Layer

Interactive UI should run through a common host contract instead of one-off integrations.

Target capabilities:

- Use widget descriptors to open inline widgets or sidebar widgets from assistant messages and tool results.
- Render long-lived sidebar widgets through a shared runtime adapter.
- Provide an MCP Apps-compatible bridge for core flows: tool result hydration, widget-to-tool calls, and session-bound follow-up messages.
- Provide a minimal `window.openai` compatibility surface for widgets that expect it.
- Keep each widget sandboxed, scoped to the active session, and constrained to trusted local or packaged resources.

Current implementation baseline:

- Recognizes standard MCP Apps resources from tool `_meta.ui.resourceUri` plus the `openai/outputTemplate` compatibility alias.
- Preserves the originating tool input, `structuredContent`, response `_meta`, and tool `_meta` from backend execution into a generic `mcp-app` widget descriptor.
- Reads `text/html;profile=mcp-app` resources through the live session's owning MCP connection instead of exposing arbitrary files or URLs to the renderer.
- Implements the MCP Apps JSON-RPC bridge for `ui/initialize`, `ui/notifications/initialized`, tool-result hydration, `tools/call`, `ui/message`, display-mode requests, model-context updates, theme changes, and container dimensions.
- Provides the common `window.openai` compatibility methods and globals for apps that support both bridges.
- Renders apps inline or in a reusable right-sidebar tab and honors a tool result's requested display mode.
- Applies resource CSP domain metadata inside an opaque `allow-scripts` iframe sandbox.
- Restricts app tool calls to the widget's own MCP server, auto-allows declared read-only and app-only tools, and requires confirmation for other mutating or destructive calls.
- Requires confirmation before a widget can send a follow-up into its bound Craft Agent session.
- Persists safe widget-tab descriptors across app restarts and reconstructs fresh session-bound tool results on explicit reconnect without storing response tokens, private widget metadata, oversized inputs, or inputs containing credential-like fields.

Validated compatibility target:

- Canvasight's `ui://widget/canvasight/canvas.html` resource, standard MCP Apps metadata, fullscreen request, structured widget data, app-only API proxy, and follow-up bridge.

Not implemented yet:

- Picture-in-picture window presentation; `pip` requests currently remain in the shared host surface.

### 5. Host, Session, And Permission Layer

The host owns trust, lifecycle, routing, and user-visible state.

Target capabilities:

- Bind every widget and tool call to a workspace, project directory, and session.
- Route widget follow-up messages only to the intended active session.
- Apply Craft Agent permissions, filesystem boundaries, and approval rules to plugin-provided capabilities.
- Manage local service lifecycle for sidebar runtimes.
- Surface errors, disabled capabilities, and missing dependencies in the UI instead of failing silently.

Current implementation baseline:

- Binds MCP App resources and tool calls to an existing Craft Agent session and rejects cross-workspace requests from scoped clients.
- Restricts every widget to resources and tools from the MCP server that produced its descriptor.
- Routes widget follow-up messages only through the descriptor's bound session and requires user confirmation before sending.
- Applies the session's authoritative permission mode to widget tool calls: Explore blocks mutating tools, Ask requests confirmation, and Execute permits them.
- Auto-allows server-declared read-only tools and app-only internal tools while preserving destructive hints in confirmation UI.
- Owns plugin MCP processes, pool servers, and transports at session scope; session deletion, runtime restart, and app shutdown use the same awaited disposer.
- Keeps iframe/tab lifecycle separate from session runtime ownership so closing a view does not terminate tools still needed by the agent.
- Tracks widget loading, ready, error, and closed states; sidebar errors are visible and failed resources can be retried in place.
- Removes widget tabs when their bound session is deleted.
- Provides a Plugins settings page for enablement and MCP diagnostics, including missing dependencies, authentication failures, invalid schemas, transport errors, and discovered tool counts.
- Stores workspace plugin policy in `plugins/policies.json`, with default and per-tool `inherit`, `allow`, `ask`, and `deny` controls that cannot bypass Explore mode.
- Coalesces concurrent restart attempts for a failed MCP transport and restores open MCP App tabs as paused, reconnectable views after a full application restart.

Validated compatibility target:

- Canvasight remains session-bound while its app-only API proxy operates without repeated prompts; its fullscreen widget and follow-up flow use the same host policy as other MCP Apps.

Lifecycle boundary:

- Craft Agent owns and recovers plugin MCP transports. Domain-specific child services spawned behind an MCP server remain the plugin's responsibility because no common lifecycle protocol exists for arbitrary daemons.

## Non-Goals

The runtime does not need to reproduce hosted enterprise systems or private product infrastructure.

Non-goals:

- Hosted plugin directory parity.
- Enterprise workspace policy parity.
- Cloud task orchestration.
- Account-level connector management owned by another service.
- Exact reproduction of another host's private model routing, memory, or conversation compaction.
- Full compatibility with every host-specific widget extension.

## Compatibility Rule

When a capability can be expressed through a public or common protocol, Craft Agent should prefer the protocol. When a workflow needs Craft-specific behavior, the extension should be explicit and namespaced.

The intended shape is:

```text
Common protocol where possible
Craft-native runtime where useful
User-controlled local behavior always
```
