import lucideRuntimeSource from 'lucide/dist/umd/lucide.min.js?raw'
import codexVisualizationStyles from '../../../../resources/skills/visualize/assets/visualize.css?raw'
import codexVisualizationTemplate from '../../../../resources/skills/visualize/assets/visualize.html?raw'

export const WIDGET_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline' https://cdnjs.cloudflare.com https://esm.sh https://cdn.jsdelivr.net https://unpkg.com",
  "style-src 'unsafe-inline' https://cdnjs.cloudflare.com https://esm.sh https://cdn.jsdelivr.net https://unpkg.com https://fonts.googleapis.com https://fonts.bunny.net",
  "font-src data: https://cdnjs.cloudflare.com https://esm.sh https://cdn.jsdelivr.net https://unpkg.com https://fonts.gstatic.com https://fonts.bunny.net",
  "img-src data: blob: https://cdnjs.cloudflare.com https://esm.sh https://cdn.jsdelivr.net https://unpkg.com https://fonts.googleapis.com https://fonts.gstatic.com https://fonts.bunny.net",
  "connect-src 'none'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')

export const WIDGET_IFRAME_SANDBOX = 'allow-scripts'
export const MIN_WIDGET_HEIGHT = 48
export const MAX_WIDGET_HEIGHT = 20_000

const THEME_TOKEN_NAMES = [
  'background',
  'foreground',
  'accent',
  'info',
  'success',
  'destructive',
  'secondary',
  'secondary-foreground',
  'muted',
  'muted-foreground',
  'card',
  'card-foreground',
  'popover',
  'popover-foreground',
  'border',
  'input',
  'ring',
  'font-size-base',
  'font-default',
  'shadow-minimal',
] as const

export type WidgetThemeSnapshot = {
  mode: 'light' | 'dark'
  tokens: Record<string, string>
}

export function readWidgetTheme(root: HTMLElement = document.documentElement): WidgetThemeSnapshot {
  const styles = getComputedStyle(root)
  const tokens: Record<string, string> = {}
  for (const name of THEME_TOKEN_NAMES) {
    const value = styles.getPropertyValue(`--${name}`).trim()
    if (value) tokens[name] = value
  }
  return {
    mode: root.classList.contains('dark') ? 'dark' : 'light',
    tokens,
  }
}

export function clampWidgetHeight(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return Math.max(MIN_WIDGET_HEIGHT, Math.min(MAX_WIDGET_HEIGHT, Math.ceil(value)))
}

export const HOST_STYLES = codexVisualizationStyles
export const HOST_SURFACE_STYLES = ':root { background-color: var(--craft-host-background, transparent) !important; }'
export const CODEX_VISUALIZATION_RUNTIME = codexVisualizationTemplate.replace(
  '<!--__INLINE_VISUALIZATION_FRAGMENT__-->',
  '',
)

const BRIDGE_SCRIPT = `
(() => {
  const HOST_SOURCE = 'craft-widget-host';
  const WIDGET_SOURCE = 'craft-widget';
  const pendingFollowUps = new Map();
  let followUpId = 0;
  let measureFrame = 0;
  let lastHeight = 0;

  const post = (message) => {
    try { window.parent.postMessage({ source: WIDGET_SOURCE, ...message }, '*'); } catch {}
  };

  const applyTheme = (theme) => {
    if (!theme || typeof theme !== 'object') return;
    document.documentElement.dataset.theme = theme.mode === 'dark' ? 'dark' : 'light';
    const surface = theme.tokens && typeof theme.tokens.background === 'string'
      ? theme.tokens.background
      : 'transparent';
    document.documentElement.style.setProperty('--craft-host-background', surface);
  };

  const measure = () => {
    if (measureFrame) cancelAnimationFrame(measureFrame);
    measureFrame = requestAnimationFrame(() => {
      measureFrame = 0;
      const body = document.body;
      const root = document.documentElement;
      const bodyRect = body ? body.getBoundingClientRect() : { top: 0, height: 0 };
      let contentBottom = bodyRect.height;
      if (body) {
        for (const child of body.children) {
          const style = getComputedStyle(child);
          if (style.position === 'fixed' || style.display === 'none') continue;
          const rect = child.getBoundingClientRect();
          contentBottom = Math.max(contentBottom, rect.bottom - bodyRect.top);
        }
      }
      const height = Math.ceil(Math.max(1, contentBottom));
      if (height !== lastHeight) {
        lastHeight = height;
        post({ type: 'resize', height });
      }
    });
  };

  const sendFollowUpMessage = (payload) => {
    const value = typeof payload === 'string' ? { prompt: payload } : payload;
    const prompt = value && typeof value.prompt === 'string' ? value.prompt.trim() : '';
    if (!prompt) return Promise.reject(new TypeError('sendFollowUpMessage requires a non-empty prompt.'));
    const title = value && typeof value.title === 'string' ? value.title.trim().slice(0, 250) : undefined;
    const requestId = 'follow-up-' + (++followUpId);
    return new Promise((resolve) => {
      pendingFollowUps.set(requestId, resolve);
      post({ type: 'sendFollowUpMessage', requestId, message: { prompt, title } });
    });
  };

  window.openai = { ...(window.openai || {}), sendFollowUpMessage };
  window.craft = { ...(window.craft || {}), sendFollowUpMessage };

  window.addEventListener('message', (event) => {
    const data = event.data;
    if (event.source !== window.parent || !data || data.source !== HOST_SOURCE) return;
    if (data.type === 'theme') {
      applyTheme(data.theme);
      measure();
      return;
    }
    if (data.type === 'followUpResult' && typeof data.requestId === 'string') {
      const resolve = pendingFollowUps.get(data.requestId);
      if (!resolve) return;
      pendingFollowUps.delete(data.requestId);
      resolve(data.ok ? { ok: true } : { ok: false, error: data.error || 'cancelled' });
    }
  });

  const initialize = () => {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons({ attrs: { width: 16, height: 16 } });
    }

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(measure);
      observer.observe(document.documentElement);
      if (document.body) observer.observe(document.body);
    } else {
      window.setInterval(measure, 500);
    }
    window.addEventListener('load', measure, { once: true });
    post({ type: 'ready' });
    measure();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
})();
`

function safeInlineScript(source: string): string {
  return source.replace(/<\/script/gi, '<\\/script')
}

function hostSurfaceStyle(theme: WidgetThemeSnapshot): string {
  return `:root { --craft-host-background: ${theme.tokens.background || 'transparent'}; }`
}

export function buildWidgetDocument(fragment: string, theme: WidgetThemeSnapshot): string {
  const head = [
    `<meta http-equiv="Content-Security-Policy" content="${WIDGET_CSP}">`,
    `<style>${HOST_STYLES}\n${HOST_SURFACE_STYLES}\n${hostSurfaceStyle(theme)}</style>`,
  ].join('')
  const scripts = [
    `<script>${safeInlineScript(lucideRuntimeSource)}</script>`,
    CODEX_VISUALIZATION_RUNTIME,
    `<script>${safeInlineScript(BRIDGE_SCRIPT)}</script>`,
  ].join('')

  if (/<html[\s>]/i.test(fragment)) {
    let documentHtml = /<head[\s>]/i.test(fragment)
      ? fragment.replace(/<head([^>]*)>/i, `<head$1>${head}`)
      : fragment.replace(/<html([^>]*)>/i, `<html$1><head>${head}</head>`)
    documentHtml = /<\/body>/i.test(documentHtml)
      ? documentHtml.replace(/<\/body>/i, `${scripts}</body>`)
      : `${documentHtml}${scripts}`
    return documentHtml
  }

  return `<!doctype html><html data-theme="${theme.mode}"><head>${head}</head><body>${fragment}${scripts}</body></html>`
}
