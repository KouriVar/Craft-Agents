import type { WidgetThemeSnapshot } from './inline-host'

export const MCP_APP_PROTOCOL_VERSION = '2026-01-26'
export const MCP_APP_IFRAME_SANDBOX = 'allow-scripts'

type ResourceMeta = Record<string, unknown> | undefined

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function domains(meta: ResourceMeta, camelKey: string, snakeKey: string): string[] {
  const ui = record(meta?.ui)
  const csp = record(ui?.csp) ?? record(meta?.['openai/widgetCSP'])
  return stringList(csp?.[camelKey]).concat(stringList(csp?.[snakeKey]))
}

function directive(name: string, values: string[]): string {
  return `${name} ${Array.from(new Set(values)).join(' ')}`
}

export function buildMcpAppCsp(meta?: ResourceMeta): string {
  const connect = domains(meta, 'connectDomains', 'connect_domains')
  const resources = domains(meta, 'resourceDomains', 'resource_domains')
  const frames = domains(meta, 'frameDomains', 'frame_domains')
  return [
    "default-src 'none'",
    directive('script-src', ["'unsafe-inline'", ...resources]),
    directive('style-src', ["'unsafe-inline'", ...resources]),
    directive('font-src', ['data:', ...resources]),
    directive('img-src', ['data:', 'blob:', ...resources]),
    directive('media-src', ['data:', 'blob:', ...resources]),
    directive('connect-src', connect.length ? connect : ["'none'"]),
    directive('frame-src', frames.length ? frames : ["'none'"]),
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ')
}

const OPENAI_COMPAT_SCRIPT = `
(() => {
  let sequence = 0;
  const pending = new Map();
  const request = (method, params) => {
    const id = 'craft-openai-' + (++sequence);
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      window.parent.postMessage({ jsonrpc: '2.0', id, method, params }, '*');
    });
  };
  const api = window.openai || {};
  api.callTool = (name, argumentsValue) => request('tools/call', { name, arguments: argumentsValue || {} });
  api.sendFollowUpMessage = (value) => {
    const prompt = typeof value === 'string' ? value : value && value.prompt;
    return request('ui/message', { role: 'user', content: [{ type: 'text', text: prompt || '' }] });
  };
  api.sendFollowupMessage = api.sendFollowUpMessage;
  api.requestDisplayMode = (value) => request('ui/request-display-mode', {
    mode: typeof value === 'string' ? value : value && value.mode
  });
  api.setWidgetState = async (state) => {
    api.widgetState = state;
    await request('ui/update-model-context', { structuredContent: state });
  };
  api.notifyIntrinsicHeight = (height) => {
    window.parent.postMessage({ source: 'craft-mcp-app', type: 'resize', height }, '*');
  };
  window.openai = api;
  window.addEventListener('message', (event) => {
    if (event.source !== window.parent || !event.data) return;
    if (event.data.source === 'craft-mcp-app-host' && event.data.type === 'openai-globals') {
      Object.assign(api, event.data.globals || {});
      window.dispatchEvent(new CustomEvent('openai:set_globals', { detail: event.data.globals || {} }));
      return;
    }
    if (event.data.jsonrpc !== '2.0') return;
    const entry = pending.get(event.data.id);
    if (!entry) return;
    pending.delete(event.data.id);
    if (event.data.error) entry.reject(new Error(event.data.error.message || 'Host request failed.'));
    else entry.resolve(event.data.result);
  });
  const ready = () => window.parent.postMessage({ source: 'craft-mcp-app', type: 'ready' }, '*');
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready, { once: true });
  else ready();
})();
`

function safeInlineScript(source: string): string {
  return source.replace(/<\/script/gi, '<\\/script')
}

function themeStyle(theme: WidgetThemeSnapshot): string {
  const background = theme.tokens.background || (theme.mode === 'dark' ? '#111' : '#fff')
  const foreground = theme.tokens.foreground || (theme.mode === 'dark' ? '#fff' : '#111')
  return `:root{color-scheme:${theme.mode};--craft-host-background:${background};--craft-host-foreground:${foreground}}html,body{margin:0;background:${background};color:${foreground}}`
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

export function buildMcpAppDocument(
  html: string,
  theme: WidgetThemeSnapshot,
  resourceMeta?: ResourceMeta,
): string {
  const head = `<meta http-equiv="Content-Security-Policy" content="${escapeAttribute(buildMcpAppCsp(resourceMeta))}"><style>${themeStyle(theme)}</style>`
  const script = `<script>${safeInlineScript(OPENAI_COMPAT_SCRIPT)}</script>`
  if (/<html[\s>]/i.test(html)) {
    let result = /<head[\s>]/i.test(html)
      ? html.replace(/<head([^>]*)>/i, `<head$1>${head}`)
      : html.replace(/<html([^>]*)>/i, `<html$1><head>${head}</head>`)
    return /<\/body>/i.test(result) ? result.replace(/<\/body>/i, `${script}</body>`) : `${result}${script}`
  }
  return `<!doctype html><html data-theme="${theme.mode}"><head>${head}</head><body>${html}${script}</body></html>`
}
