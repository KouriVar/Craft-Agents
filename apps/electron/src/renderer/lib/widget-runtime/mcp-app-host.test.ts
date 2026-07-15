import { describe, expect, test } from 'bun:test'
import { buildMcpAppCsp, buildMcpAppDocument, MCP_APP_IFRAME_SANDBOX, MCP_APP_PROTOCOL_VERSION } from './mcp-app-host'

const theme = { mode: 'dark' as const, tokens: { background: '#111', foreground: '#eee' } }

describe('MCP Apps host contract', () => {
  test('uses the current protocol and a script-only opaque sandbox', () => {
    expect(MCP_APP_PROTOCOL_VERSION).toBe('2026-01-26')
    expect(MCP_APP_IFRAME_SANDBOX).toBe('allow-scripts')
  })

  test('translates standard MCP Apps CSP metadata into exact directives', () => {
    const csp = buildMcpAppCsp({
      ui: { csp: {
        connectDomains: ['http://127.0.0.1:*'],
        resourceDomains: ['https://cdn.example.com'],
        frameDomains: ['https://frame.example.com'],
      } },
    })
    expect(csp).toContain('connect-src http://127.0.0.1:*')
    expect(csp).toContain("script-src 'unsafe-inline' https://cdn.example.com")
    expect(csp).toContain('frame-src https://frame.example.com')
    expect(csp).toContain("object-src 'none'")
  })

  test('injects the OpenAI compatibility bridge without replacing the app document', () => {
    const html = buildMcpAppDocument('<html><head><title>App</title></head><body><main>Canvas</main></body></html>', theme)
    expect(html.match(/<html/g)).toHaveLength(1)
    expect(html).toContain('Content-Security-Policy')
    expect(html).toContain('window.openai')
    expect(html).toContain("request('tools/call'")
    expect(html).toContain('sendFollowUpMessage')
    expect(html).toContain('<main>Canvas</main>')
  })
})
