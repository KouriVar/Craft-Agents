export const AGENT_RUNTIMES = ['claude', 'pi', 'codex'] as const;

export type AgentRuntime = (typeof AGENT_RUNTIMES)[number];

export function isAgentRuntime(value: unknown): value is AgentRuntime {
  return typeof value === 'string' && AGENT_RUNTIMES.includes(value as AgentRuntime);
}

/** Codex/custom Responses providers expect native API model ids, not CA's Pi registry prefix. */
export function normalizeCodexModelId(modelId: string): string {
  return modelId.startsWith('pi/') ? modelId.slice(3) : modelId;
}
