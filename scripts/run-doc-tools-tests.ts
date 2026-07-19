const tests = [
  'apps.electron.resources.scripts.tests.test_pdf_tool_smoke',
  'apps.electron.resources.scripts.tests.test_xlsx_tool_smoke',
  'apps.electron.resources.scripts.tests.test_docx_tool_smoke',
  'apps.electron.resources.scripts.tests.test_pptx_tool_smoke',
  'apps.electron.resources.scripts.tests.test_img_tool_smoke',
  'apps.electron.resources.scripts.tests.test_ical_tool_smoke',
  'apps.electron.resources.scripts.tests.test_doc_diff_smoke',
  'apps.electron.resources.scripts.tests.test_markitdown_smoke',
]

const timeoutMs = Number(process.env.DOC_TOOLS_TIMEOUT_MS ?? 10 * 60_000)
const child = Bun.spawn(['python3', '-m', 'unittest', ...tests], {
  cwd: process.cwd(),
  env: process.env,
  stdout: 'inherit',
  stderr: 'inherit',
})

let timedOut = false
const timer = setTimeout(() => {
  timedOut = true
  console.error(`Document tool smoke tests exceeded ${Math.round(timeoutMs / 1000)}s. The bundled uv/Python environment may be stalled; inspect the last named smoke test and the uv cache.`)
  child.kill()
}, timeoutMs)

const exitCode = await child.exited
clearTimeout(timer)
if (timedOut || exitCode !== 0) process.exit(timedOut ? 124 : exitCode)
console.log(`Document tool smoke tests passed within ${Math.round(timeoutMs / 1000)}s timeout.`)
