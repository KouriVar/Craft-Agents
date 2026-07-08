# TencentDB Agent Memory Source Setup

TencentDB Agent Memory provides layered memory for AI agents: symbolic short-term memory (Mermaid canvas compression) and layered long-term memory (persona/scene extraction). It integrates with Craft Agent via the OpenClaw plugin path.

## Architecture

TencentDB Agent Memory is not a standalone MCP server. It integrates through a two-part architecture:

1. **OpenClaw Plugin** (`@tencentdb-agent-memory/memory-tencentdb` v0.3.6) — provides memory hooks (capture, extract, recall) for OpenClaw-powered agent sessions.
2. **Hermes Gateway** — a local sidecar HTTP server (`localhost:8420`) that exposes memory capture/search/recall endpoints.

Craft Agent uses OpenClaw as the runtime for Pi SDK sessions. The memory plugin hooks into OpenClaw's lifecycle and does not require a separate source configuration in Craft Agent.

## Prerequisites

- OpenClaw runtime (installed alongside Craft Agent)
- Node.js >= 22.16.0
- An LLM API key for memory extraction (local or remote)

## Setup

### 1. Install the OpenClaw Plugin

```bash
openclaw plugins install @tencentdb-agent-memory/memory-tencentdb
openclaw gateway restart
```

### 2. Enable the Plugin

Edit `~/.openclaw/openclaw.json`:

```json
{
  "memory-tencentdb": {
    "enabled": true
  }
}
```

Zero-config default — uses local SQLite + sqlite-vec backend.

### 3. Enable Short-Term Compression (Optional)

Requires version >= 0.3.4:

```json
{
  "memory-tencentdb": {
    "config": {
      "offload": {
        "enabled": true
      }
    }
  },
  "plugins": {
    "slots": {
      "contextEngine": "memory-tencentdb"
    }
  }
}
```

Apply the runtime patch (one-time):

```bash
bash scripts/openclaw-after-tool-call-messages.patch.sh
```

## Hermes Gateway (Sidecar)

The Hermes Gateway runs as a local HTTP server on `:8420`. It provides REST endpoints for memory operations.

### Start the Gateway

```bash
cd ~/.memory-tencentdb/tdai-memory-openclaw-plugin
npx tsx src/gateway/server.ts
```

### Configure the Gateway

Create `~/.memory-tencentdb/memory-tdai/tdai-gateway.json`:

```json
{
  "llm": {
    "baseUrl": "https://api.openai.com/v1",
    "apiKey": "sk-your-api-key",
    "model": "gpt-4o"
  }
}
```

### Verify

```bash
curl http://127.0.0.1:8420/health
# {"status":"ok"}
```

## Configuration Reference

| Field | Default | Description |
|-------|---------|-------------|
| `storeBackend` | `"sqlite"` | Storage backend |
| `recall.strategy` | `"hybrid"` | Recall strategy: `keyword` / `embedding` / `hybrid` |
| `recall.maxResults` | `5` | Items returned per recall |
| `pipeline.everyNConversations` | `5` | L1 memory extraction every N turns |
| `persona.triggerEveryN` | `50` | Generate persona every N new memories |
| `offload.enabled` | `false` | Enable short-term compression |
| `timezone` | `"system"` | Timezone for timestamps |

## Security

The Gateway supports optional API key auth:

```bash
export TDAI_GATEWAY_API_KEY="your-secret-key"
```

When set, all routes except `/health` require `Authorization: Bearer <key>`.

## Filesystem Layout

```
~/.openclaw/memory-tdai/    # Memory artifacts (personas, scenes, canvases)
~/.openclaw/openclaw.json   # Plugin configuration
~/.memory-tencentdb/        # Gateway installation
```

## Upgrade

```bash
openclaw plugins update @tencentdb-agent-memory/memory-tencentdb
```

Always use `openclaw plugins update` instead of direct npm upgrade to avoid plugin disable due to semantic version ranges.

## Related

- [Upstream README](https://github.com/TencentCloud/TencentDB-Agent-Memory)
- [OpenClaw Plugin Documentation](https://docs2.openclaw.ai/plugins)
