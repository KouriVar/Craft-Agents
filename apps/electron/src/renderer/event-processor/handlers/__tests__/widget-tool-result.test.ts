import { describe, expect, test } from 'bun:test'
import { processEvent } from '../../processor'
import type { SessionState, ToolResultEvent } from '../../types'
import { CRAFT_WIDGET_RESULT_PREFIX } from '@/lib/widget-runtime/parser'

function state(): SessionState {
  return {
    session: {
      id: 'session-1',
      messages: [],
      lastMessageAt: Date.now(),
      isProcessing: true,
    } as any,
    streaming: null,
  }
}

describe('Cowart widget tool results', () => {
  test('emits an open_widget effect for a marked descriptor', () => {
    const descriptor = {
      kind: 'cowart-canvas',
      id: 'cowart-canvas:page-1',
      projectDir: '/project',
      pageId: 'page-1',
      source: 'cowart-tool',
    } as const
    const event: ToolResultEvent = {
      type: 'tool_result',
      sessionId: 'session-1',
      toolUseId: 'tool-1',
      toolName: 'mcp__session__render_cowart_canvas_widget',
      result: `${CRAFT_WIDGET_RESULT_PREFIX}${JSON.stringify(descriptor)}`,
    }

    expect(processEvent(state(), event).effects).toEqual([{ type: 'open_widget', descriptor }])
  })

  test('emits a generic MCP App descriptor from structured result metadata', () => {
    const current = state()
    current.session.messages.push({
      id: 'tool-message', role: 'tool', content: '', timestamp: Date.now(),
      toolUseId: 'tool-app', toolName: 'mcp__canvasight__open_canvasight',
      toolInput: { projectPath: '/tmp/project' }, toolStatus: 'executing',
    })
    const result = processEvent(current, {
      type: 'tool_result', sessionId: 'session-1', toolUseId: 'tool-app',
      toolName: 'mcp__canvasight__open_canvasight', result: 'Opening Canvasight',
      resultDetails: { mcpApp: {
        toolMeta: { ui: { resourceUri: 'ui://widget/canvasight/canvas.html' } },
        structuredContent: { targetDisplayMode: 'fullscreen' },
        responseMeta: { widgetData: { sessionId: 'canvas-1' } },
      } },
    })
    expect(result.effects).toEqual([{ type: 'open_widget', descriptor: expect.objectContaining({
      kind: 'mcp-app', serverSlug: 'canvasight', toolName: 'open_canvasight', displayMode: 'fullscreen',
    }) }])
  })

  test('does not emit effects for ordinary or failed tool results', () => {
    const ordinary = processEvent(state(), {
      type: 'tool_result', sessionId: 'session-1', toolUseId: 'tool-1', result: 'done',
    })
    const failed = processEvent(state(), {
      type: 'tool_result',
      sessionId: 'session-1',
      toolUseId: 'tool-2',
      result: `${CRAFT_WIDGET_RESULT_PREFIX}{}`,
      isError: true,
    })
    expect(ordinary.effects).toEqual([])
    expect(failed.effects).toEqual([])
  })
})
