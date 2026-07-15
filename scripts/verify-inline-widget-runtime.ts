import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { buildWidgetDocument, type WidgetThemeSnapshot } from '../apps/electron/src/renderer/lib/widget-runtime/inline-host'

const initialTheme: WidgetThemeSnapshot = {
  mode: 'light',
  tokens: {
    background: 'rgb(250, 250, 250)',
    foreground: 'rgb(20, 20, 20)',
    accent: 'rgb(104, 78, 133)',
    'font-size-base': '15px',
  },
}

const fragment = `
<div id="widget-smoke" class="viz-grid">
  <section class="card viz-stat">
    <span class="text-muted">Runtime</span>
    <span class="viz-stat-value" id="count">0</span>
    <button type="button" class="btn btn-primary" id="increment">
      <i data-lucide="chart-no-axes-combined" aria-hidden="true"></i>
      Increment
    </button>
  </section>
  <section class="card">
    <label class="form-label" for="range">Value <span id="range-value">4</span></label>
    <input class="form-range" id="range" type="range" min="0" max="10" value="4">
    <button type="button" class="btn btn-ghost" id="follow-up" data-tooltip="Ask the agent">
      <i data-lucide="message-circle-more" aria-hidden="true"></i>
      Follow up
    </button>
    <span id="dynamic-icon"></span>
  </section>
</div>
<script>
(() => {
  const count = document.getElementById('count');
  const increment = document.getElementById('increment');
  const range = document.getElementById('range');
  const rangeValue = document.getElementById('range-value');
  increment.addEventListener('click', () => { count.textContent = String(Number(count.textContent) + 1); });
  range.addEventListener('input', () => { rangeValue.textContent = range.value; });

  setTimeout(async () => {
    increment.click();
    range.value = '8';
    range.dispatchEvent(new Event('input', { bubbles: true }));
    const dynamic = document.createElement('i');
    dynamic.setAttribute('data-lucide', 'banana');
    document.getElementById('dynamic-icon').appendChild(dynamic);
    window.lucide.createIcons({ attrs: { width: 16, height: 16 } });
    const followUp = await window.openai.sendFollowUpMessage({ prompt: 'Inspect selected value 8', title: 'Inspect selection' });
    window.parent.postMessage({
      source: 'widget-smoke',
      count: count.textContent,
      range: rangeValue.textContent,
      staticIcon: Boolean(document.querySelector('[data-lucide="chart-no-axes-combined"] svg, svg.lucide-chart-no-axes-combined')),
      dynamicIcon: Boolean(document.querySelector('#dynamic-icon svg')),
      theme: getComputedStyle(document.documentElement).getPropertyValue('--foreground').trim(),
      followUp,
    }, '*');
  }, 150);
})();
</script>
`

const widgetDocument = buildWidgetDocument(fragment, initialTheme)
const serializedWidgetDocument = JSON.stringify(widgetDocument).replace(/<\/script/gi, '<\\/script')
const directory = await mkdtemp(join(tmpdir(), 'craft-widget-smoke-'))
const wrapperPath = join(directory, 'wrapper.html')
const runnerPath = join(directory, 'runner.mjs')
const screenshotPath = join(directory, 'widget-smoke.png')

const wrapper = `<!doctype html><html><body style="margin:0;width:100%;max-width:736px"><iframe id="widget" sandbox="allow-scripts" style="width:100%;height:360px;border:0"></iframe><output id="smoke-result" hidden></output><script>
window.smokeState = { resize: 0, followUpRequested: false, result: null };
const frame = document.getElementById('widget');
const syncSmokeState = () => { document.getElementById('smoke-result').value = JSON.stringify(window.smokeState); };
syncSmokeState();
window.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || typeof data !== 'object') return;
  if (data.source === 'craft-widget') {
    if (data.type === 'ready') {
      frame.contentWindow.postMessage({
        source: 'craft-widget-host',
        type: 'theme',
        theme: { mode: 'dark', tokens: { foreground: 'rgb(1, 2, 3)', background: 'rgb(245, 245, 245)' } }
      }, '*');
    }
    if (data.type === 'resize') {
      window.smokeState.resize = data.height;
      frame.style.height = data.height + 'px';
    }
    if (data.type === 'sendFollowUpMessage') {
      window.smokeState.followUpRequested = data.message && data.message.prompt === 'Inspect selected value 8';
      setTimeout(() => frame.contentWindow.postMessage({ source: 'craft-widget-host', type: 'followUpResult', requestId: data.requestId, ok: true }, '*'), 20);
    }
  }
  if (data.source === 'widget-smoke') window.smokeState.result = data;
  syncSmokeState();
});
frame.srcdoc = ${serializedWidgetDocument};
</script></body></html>`

const runner = `
import { app, BrowserWindow } from 'electron';
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
console.log('widget-smoke: runner started');
setTimeout(() => { console.error('widget-smoke: hard timeout'); app.exit(2); }, 12000).unref();
await app.whenReady();
console.log('widget-smoke: electron ready');
const window = new BrowserWindow({ show: false, width: 760, height: 440, webPreferences: { contextIsolation: true, sandbox: true } });
await window.loadURL(pathToFileURL(${JSON.stringify(wrapperPath)}).href);
console.log('widget-smoke: wrapper loaded');
const state = await window.webContents.executeJavaScript(\`new Promise((resolve, reject) => {
  const started = Date.now();
  const timer = setInterval(() => {
    if (window.smokeState && window.smokeState.result) {
      clearInterval(timer);
      resolve(window.smokeState);
    } else if (Date.now() - started > 8000) {
      clearInterval(timer);
      reject(new Error('Timed out waiting for widget runtime'));
    }
  }, 50);
})\`);
await writeFile(${JSON.stringify(screenshotPath)}, (await window.webContents.capturePage()).toPNG());
console.log(JSON.stringify({ ...state, screenshot: ${JSON.stringify(screenshotPath)} }));
const result = state.result || {};
const ok = result.count === '1' && result.range === '8' && result.staticIcon && result.dynamicIcon && result.theme === 'rgb(1, 2, 3)' && result.followUp && result.followUp.ok === true && state.followUpRequested && state.resize > 0;
await app.quit();
if (!ok) process.exit(1);
`

await writeFile(wrapperPath, wrapper, 'utf8')
await writeFile(runnerPath, runner, 'utf8')

if (process.argv.includes('--serve')) {
  const server = Bun.serve({
    port: 0,
    fetch() {
      return new Response(wrapper, { headers: { 'content-type': 'text/html; charset=utf-8' } })
    },
  })
  console.log(`http://127.0.0.1:${server.port}/`)
  const close = async () => {
    server.stop(true)
    await rm(directory, { recursive: true, force: true })
    process.exit(0)
  }
  process.on('SIGINT', () => { void close() })
  process.on('SIGTERM', () => { void close() })
  await new Promise(() => {})
}

const electronPath = resolve('node_modules/.bin/electron')
const exitCode = await new Promise<number>((resolveExit, reject) => {
  const child = spawn(electronPath, [runnerPath], { stdio: 'inherit' })
  child.once('error', reject)
  child.once('exit', (code) => resolveExit(code ?? 1))
})

await rm(directory, { recursive: true, force: true })
process.exit(exitCode)
