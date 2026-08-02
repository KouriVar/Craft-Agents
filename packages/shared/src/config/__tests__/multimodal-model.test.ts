import { describe, expect, it } from 'bun:test'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'

const storageUrl = pathToFileURL(join(import.meta.dir, '..', 'storage.ts')).href

function setup() {
  const configDir = mkdtempSync(join(tmpdir(), 'craft-agent-multimodal-'))
  const configPath = join(configDir, 'config.json')
  writeFileSync(configPath, JSON.stringify({ workspaces: [], activeWorkspaceId: null, activeSessionId: null }))
  return { configDir, configPath }
}

function evaluate(configDir: string, code: string): string {
  const run = Bun.spawnSync([process.execPath, '--eval', `import { getMultimodalModel, setMultimodalModel } from '${storageUrl}'; ${code}`], {
    env: { ...process.env, CRAFT_CONFIG_DIR: configDir }, stdout: 'pipe', stderr: 'pipe',
  })
  if (run.exitCode !== 0) throw new Error(run.stderr.toString())
  return run.stdout.toString().trim()
}

describe('multimodal model storage', () => {
  it('persists and clears the selected connection and model', () => {
    const { configDir, configPath } = setup()
    expect(evaluate(configDir, 'console.log(String(getMultimodalModel()))')).toBe('null')
    evaluate(configDir, `setMultimodalModel({ connectionSlug: 'mimo', model: 'mimo-vl' })`)
    expect(JSON.parse(evaluate(configDir, 'console.log(JSON.stringify(getMultimodalModel()))'))).toEqual({
      connectionSlug: 'mimo',
      model: 'mimo-vl',
    })
    expect(JSON.parse(readFileSync(configPath, 'utf8')).multimodalModel.model).toBe('mimo-vl')
    evaluate(configDir, 'setMultimodalModel(null)')
    expect(evaluate(configDir, 'console.log(String(getMultimodalModel()))')).toBe('null')
  })
})
