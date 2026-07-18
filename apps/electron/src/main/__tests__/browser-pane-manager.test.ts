import { expect, it } from 'bun:test'
import { join } from 'node:path'

/**
 * BrowserPaneManager needs a comprehensive Electron module mock. Bun keeps
 * module mocks process-global across test files, so running these cases in the
 * main suite lets unrelated lightweight Electron mocks replace it during test
 * discovery. Keep the full case suite, but execute it in an isolated Bun test
 * process where its Electron mock is authoritative.
 */
it('BrowserPaneManager isolated Electron suite', async () => {
  const casesPath = join(import.meta.dir, 'browser-pane-manager.cases.ts')
  const child = Bun.spawn([process.execPath, 'test', casesPath], {
    cwd: process.cwd(),
    env: process.env,
    stdout: 'pipe',
    stderr: 'pipe',
  })

  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ])

  if (exitCode !== 0) {
    throw new Error(`Isolated BrowserPaneManager tests failed:\n${stdout}\n${stderr}`)
  }
  expect(exitCode).toBe(0)
}, 30_000)
