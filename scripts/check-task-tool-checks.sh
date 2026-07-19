#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

direct_checks=$(rg -n --pcre2 \
  --glob '*.{ts,tsx}' \
  --glob '!**/__tests__/**' \
  --glob '!**/*.test.ts' \
  --glob '!**/*.test.tsx' \
  --glob '!packages/shared/src/utils/toolNames.ts' \
  "(?:toolName|tool_name|name)\s*(?:===|==|!==|!=)\s*['\"](?:Task|Agent)['\"]|['\"](?:Task|Agent)['\"]\s*(?:===|==|!==|!=)\s*(?:toolName|tool_name|name)" \
  apps packages || true)

if [[ -n "$direct_checks" ]]; then
  echo "Task tool-name check failed. Use isParentTaskTool() so both SDK names, Task and Agent, stay supported:" >&2
  echo "$direct_checks" >&2
  exit 1
fi

bun test \
  packages/session-tools-core/src/tool-defs-filtering.test.ts \
  packages/ui/src/components/chat/__tests__/turn-utils-grouping.test.ts

echo "Task/tool naming check OK (central parent-tool helper and canonical session registry tests passed)"
