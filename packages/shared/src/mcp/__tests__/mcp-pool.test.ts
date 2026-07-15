import { describe, expect, it } from 'bun:test';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { McpClientPool, type PoolClient } from '../index.ts';

class TestMcpClientPool extends McpClientPool {
  addClient(slug: string, client: PoolClient): Promise<void> {
    return this.registerClient(slug, client);
  }
}

class FakePoolClient implements PoolClient {
  async listTools(): Promise<Tool[]> {
    return [
      {
        name: 'draw_graph',
        description: 'Draw a graph',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true },
        _meta: { ui: { resourceUri: 'ui://widget/canvasight/canvas.html' } },
      } as Tool,
    ];
  }

  async callTool(): Promise<unknown> {
    return {
      content: [{ type: 'text', text: 'Graph updated' }],
      structuredContent: {
        nodes: [{ id: 'a' }],
        edges: [],
      },
      _meta: {
        widget: 'canvasight',
        openInSidebar: true,
      },
    };
  }

  async readResource(uri: string) {
    return {
      contents: [{
        uri,
        mimeType: 'text/html;profile=mcp-app',
        text: '<!doctype html><html><body>Canvasight</body></html>',
        _meta: { ui: { csp: { connectDomains: ['http://127.0.0.1:*'] } } },
      }],
    };
  }

  async close(): Promise<void> {}
}

class FailingPoolClient extends FakePoolClient {
  constructor(private readonly fail: 'tool' | 'resource') { super(); }

  override async callTool(): Promise<unknown> {
    if (this.fail === 'tool') throw new Error('Connection closed');
    return super.callTool();
  }

  override async readResource(uri: string) {
    if (this.fail === 'resource') throw new Error('transport terminated');
    return super.readResource(uri);
  }
}

class RestartingPool extends McpClientPool {
  constructor(private readonly queue: PoolClient[]) { super(); }

  protected override createClient(): PoolClient | null {
    return this.queue.shift() ?? null;
  }
}

class MutablePoolClient extends FakePoolClient {
  calls = 0;

  constructor(private readonly disconnect: boolean) { super(); }

  override async listTools(): Promise<Tool[]> {
    return [{ name: 'mutate', inputSchema: { type: 'object' } } as Tool];
  }

  override async callTool(): Promise<unknown> {
    this.calls += 1;
    if (this.disconnect) throw new Error('Connection closed');
    return { content: [{ type: 'text', text: 'mutated' }] };
  }
}

describe('McpClientPool tool results', () => {
  it('preserves structuredContent and _meta from MCP tool results', async () => {
    const pool = new TestMcpClientPool();
    await pool.addClient('canvasight', new FakePoolClient());

    const result = await pool.callTool('mcp__canvasight__draw_graph', {});

    expect(result.isError).toBe(false);
    expect(result.content).toBe('Graph updated');
    expect(result.contentBlocks).toEqual([{ type: 'text', text: 'Graph updated' }]);
    expect(result.structuredContent).toEqual({
      nodes: [{ id: 'a' }],
      edges: [],
    });
    expect(result._meta).toEqual({
      widget: 'canvasight',
      openInSidebar: true,
    });
    expect(result.toolMeta).toEqual({ ui: { resourceUri: 'ui://widget/canvasight/canvas.html' } });
  });
});

describe('McpClientPool proxy tool definitions', () => {
  it('preserves MCP tool annotations for permission and model hints', async () => {
    const pool = new TestMcpClientPool();
    await pool.addClient('canvasight', new FakePoolClient());

    expect(pool.getProxyToolDefs()).toEqual([
      {
        name: 'mcp__canvasight__draw_graph',
        description: 'Draw a graph',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true },
        _meta: { ui: { resourceUri: 'ui://widget/canvasight/canvas.html' } },
      },
    ]);
  });

  it('reads an MCP App HTML resource through the owning server', async () => {
    const pool = new TestMcpClientPool();
    await pool.addClient('canvasight', new FakePoolClient());
    const result = await pool.readResource('canvasight', 'ui://widget/canvasight/canvas.html');
    expect(result.contents[0]).toMatchObject({
      uri: 'ui://widget/canvasight/canvas.html',
      mimeType: 'text/html;profile=mcp-app',
      text: expect.stringContaining('Canvasight'),
    });
  });
});

describe('McpClientPool transport recovery', () => {
  const config = { type: 'stdio' as const, command: 'fake-mcp' };

  it('restarts and retries resource reads after a transport failure', async () => {
    const pool = new RestartingPool([new FailingPoolClient('resource'), new FakePoolClient()]);
    await pool.connect('canvasight', config);
    const result = await pool.readResource('canvasight', 'ui://widget/canvasight/canvas.html');
    expect(result.contents[0]?.text).toContain('Canvasight');
  });

  it('restarts and safely retries tools declared read-only', async () => {
    const pool = new RestartingPool([new FailingPoolClient('tool'), new FakePoolClient()]);
    await pool.connect('canvasight', config);
    const result = await pool.callTool('mcp__canvasight__draw_graph', {});
    expect(result.isError).toBe(false);
    expect(result.content).toBe('Graph updated');
  });

  it('restarts but does not replay a tool that may have side effects', async () => {
    const failed = new MutablePoolClient(true);
    const healthy = new MutablePoolClient(false);
    const pool = new RestartingPool([failed, healthy]);
    await pool.connect('canvasight', config);
    const result = await pool.callTool('mcp__canvasight__mutate', {});
    expect(result.isError).toBe(true);
    expect(result.content).toContain('was not replayed');
    expect(failed.calls).toBe(1);
    expect(healthy.calls).toBe(0);
    expect(pool.isConnected('canvasight')).toBe(true);
  });
});
