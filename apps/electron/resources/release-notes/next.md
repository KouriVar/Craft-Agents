# Pending Release Notes

This file accumulates release notes for the next unreleased version. PRs that add user-visible behavior should append a bullet to the relevant section here. Versioned files (`X.Y.Z.md`) are owned by the release skill — never create them in feature commits.

## Improvements

- **Plugin invocation and hot reload**: Each installed plugin now appears as one top-level `@` item instead of exposing every internal routing skill. Selecting it lets the agent choose the relevant plugin skill guide for the request. Installing, enabling, disabling, or removing a plugin also refreshes the menu and MCP tools for idle sessions and on the next turn for active sessions.
- **Plugin and skill icons**: CA now reads Codex plugin `interface.composerIcon`, `logo`, display name, and brand color metadata, caches package icons safely inside the workspace, and shows the real branding in the plugin list, details, `@` menu, input badges, and sent messages. Iconless skills receive purpose-aware fallback symbols, while newly created skills are required to include a relevant emoji or local icon asset.
- **Plugin compatibility reports**: The marketplace and installed-plugin details now explain whether a package is ready, requires authentication, is partially compatible, or cannot run in CA. Reports break down skills, MCP servers, connectors, widgets, and hooks, and show how each usable capability is invoked before installation.
- **Plugin MCP OAuth**: HTTP plugin MCP servers now preserve `oauth_resource`, scopes, and auth metadata, reuse CA's PKCE OAuth and encrypted credential storage, refresh service tokens, and inject them only into the matching plugin server. Standards-compliant providers that allow dynamic client registration can be connected from plugin details without reusing ChatGPT model credentials.
- **OAuth host compatibility**: MCP authorization now stops cleanly when a provider only permits approved host applications instead of falling back to another app's client identity. Dynamically registered client secrets are preserved for token exchange and refresh, while plugin details explain provider approval and Google OAuth setup requirements in the current UI language.
- **Account settings**: The new Account page supports external account authentication and stores Google OAuth application credentials in CA's encrypted credential store for Gmail, Calendar, Drive, and compatible plugin connectors. Plugin details now show connected, expired, configuration-required, unsupported, and host-approval states, with reconnect and disconnect actions where available.
- **Connector compatibility adapters**: CA now parses `.app.json`, maps supported Gmail, Google Calendar, Google Drive, Slack, Outlook, Teams, and SharePoint connectors to native CA sources, and adds runtime guidance that translates hosted Connector tool names to the mapped authenticated API tool. OpenAI-only connectors are clearly marked unsupported instead of appearing installable without working tools.
- **Grouped plugin skills**: The Skills navigator now collapses every plugin's internal routing skills into one branded plugin row. Expand the row to inspect or open individual skills; selecting an existing child automatically reveals its owning plugin group.
- **Right sidebar launcher**: Opening Review no longer creates an empty browser tab automatically. A clean launcher now offers Browser, Terminal, Folder, and Cowart actions directly in the empty sidebar, while the existing top-right add menu remains available after tabs are created.

## Bug Fixes

- **Plugin marketplace layout**: The marketplace browser now overrides the base dialog width cap, reserves stable space for both the catalog and detail panes, and prevents long compatibility text from collapsing the detail pane into a narrow column.
- **First marketplace install**: Marketplace installation now creates the managed `plugins/installed` directory before moving a selected package into place, preventing `ENOENT` on a workspace's first plugin install.

## Breaking Changes
