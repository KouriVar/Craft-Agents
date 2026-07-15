/**
 * Validate the Electron output before packaging.
 *
 * Every source resource must be present byte-for-byte in dist/resources, and
 * the generated entrypoints required by electron-builder must also exist.
 */

import { createHash } from 'crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { dirname, join, relative, resolve } from 'path'
import { fileURLToPath } from 'url'

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const resourcesRoot = join(appRoot, 'resources')
const distRoot = join(appRoot, 'dist')
const copiedResourcesRoot = join(distRoot, 'resources')

const requiredBuildFiles = [
  'main.cjs',
  'bootstrap-preload.cjs',
  'cowart-preload.cjs',
  'browser-toolbar-preload.cjs',
  'interceptor.cjs',
  'terminal-preload.cjs',
  'renderer/index.html',
  'renderer/browser-toolbar.html',
  'renderer/browser-empty-state.html',
]

const requiredCopiedFiles = [
  'vendor/xterm/xterm.css',
  'vendor/xterm/xterm.js',
  'vendor/xterm/addon-fit.js',
]

function listFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return listFiles(path)
    return entry.isFile() ? [path] : []
  })
}

function digest(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function requireNonEmptyFile(path: string, label: string): void {
  if (!existsSync(path) || !statSync(path).isFile() || statSync(path).size === 0) {
    throw new Error(`Missing or empty ${label}: ${path}`)
  }
}

function validateCopiedResources(): number {
  requireNonEmptyFile(join(resourcesRoot, 'AGENTS.md'), 'source resource sentinel')

  const sourceFiles = listFiles(resourcesRoot)
  for (const sourcePath of sourceFiles) {
    const resourcePath = relative(resourcesRoot, sourcePath)
    const copiedPath = join(copiedResourcesRoot, resourcePath)
    requireNonEmptyFile(copiedPath, `copied resource ${resourcePath}`)

    if (statSync(sourcePath).size !== statSync(copiedPath).size || digest(sourcePath) !== digest(copiedPath)) {
      throw new Error(`Copied resource differs from source: ${resourcePath}`)
    }
  }

  return sourceFiles.length
}

try {
  const resourceCount = validateCopiedResources()

  for (const file of requiredBuildFiles) {
    requireNonEmptyFile(join(distRoot, file), `build artifact ${file}`)
  }
  for (const file of requiredCopiedFiles) {
    requireNonEmptyFile(join(copiedResourcesRoot, file), `generated resource ${file}`)
  }

  console.log(
    `✓ Validated ${resourceCount} copied resources and ${requiredBuildFiles.length + requiredCopiedFiles.length} build artifacts`,
  )
} catch (error) {
  console.error(`Asset validation failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}
