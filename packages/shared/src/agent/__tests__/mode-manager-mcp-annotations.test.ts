import { describe, expect, it } from 'bun:test';
import { shouldAllowToolInMode } from '../mode-manager.ts';

describe('mode-manager MCP annotations', () => {
  it('allows connected MCP tools with readOnlyHint in Explore mode', () => {
    const result = shouldAllowToolInMode(
      'mcp__canvasight__read_graph',
      {},
      'safe',
      { readOnlyMcpTools: ['mcp__canvasight__read_graph'] },
    );

    expect(result.allowed).toBe(true);
  });

  it('blocks MCP tools without readOnlyHint or allowlist patterns in Explore mode', () => {
    const result = shouldAllowToolInMode(
      'mcp__canvasight__write_graph',
      {},
      'safe',
      { readOnlyMcpTools: ['mcp__canvasight__read_graph'] },
    );

    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toContain('MCP write operations are blocked');
    }
  });
});
