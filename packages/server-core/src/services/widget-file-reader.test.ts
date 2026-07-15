import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { readWidgetHtmlFile, WidgetFileError } from './widget-file-reader'

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'craft-widget-'))
  tempDirs.push(dir)
  return dir
}

describe('readWidgetHtmlFile', () => {
  test('reads a relative HTML file from an allowed root', async () => {
    const root = await tempDir()
    await writeFile(join(root, 'demo.html'), '<div>demo</div>')
    expect(await readWidgetHtmlFile('demo.html', [root])).toMatchObject({ html: '<div>demo</div>' })
  })

  test('rejects an absolute path outside allowed roots', async () => {
    const root = await tempDir()
    const outside = await tempDir()
    const file = join(outside, 'secret.html')
    await writeFile(file, 'secret')
    await expect(readWidgetHtmlFile(file, [root])).rejects.toMatchObject({ code: 'access-denied' } satisfies Partial<WidgetFileError>)
  })

  test('rejects a symlink that escapes an allowed root', async () => {
    const root = await tempDir()
    const outside = await tempDir()
    const file = join(outside, 'secret.html')
    await writeFile(file, 'secret')
    await mkdir(join(root, 'nested'))
    await symlink(file, join(root, 'nested', 'demo.html'))
    await expect(readWidgetHtmlFile('nested/demo.html', [root])).rejects.toMatchObject({ code: 'access-denied' } satisfies Partial<WidgetFileError>)
  })

  test('rejects relative path traversal', async () => {
    const parent = await tempDir()
    const root = join(parent, 'allowed')
    await mkdir(root)
    await writeFile(join(parent, 'secret.html'), 'secret')
    await expect(readWidgetHtmlFile('../secret.html', [root])).rejects.toMatchObject({ code: 'access-denied' } satisfies Partial<WidgetFileError>)
  })

  test('reports missing files', async () => {
    const root = await tempDir()
    await expect(readWidgetHtmlFile('missing.html', [root])).rejects.toMatchObject({ code: 'not-found' } satisfies Partial<WidgetFileError>)
  })
})
