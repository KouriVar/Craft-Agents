import { readFile, realpath, stat } from 'node:fs/promises'
import { isAbsolute, normalize, relative, resolve } from 'node:path'

const MAX_WIDGET_HTML_BYTES = 2 * 1024 * 1024

export class WidgetFileError extends Error {
  constructor(
    message: string,
    readonly code: 'access-denied' | 'not-found' | 'read-failed',
  ) {
    super(message)
  }
}

function isPathInside(filePath: string, rootPath: string): boolean {
  const rel = relative(rootPath, filePath)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

async function canonicalPath(filePath: string): Promise<string> {
  try {
    return await realpath(filePath)
  } catch {
    return resolve(normalize(filePath))
  }
}

async function canonicalCandidatePath(candidate: string, roots: string[], canonicalRoots: string[]): Promise<string> {
  try {
    return await realpath(candidate)
  } catch {
    const rootIndex = roots.findIndex((root) => isPathInside(candidate, root))
    if (rootIndex >= 0) {
      return resolve(canonicalRoots[rootIndex], relative(roots[rootIndex], candidate))
    }
    return resolve(normalize(candidate))
  }
}

export async function readWidgetHtmlFile(file: string, allowedRoots: string[]): Promise<{ html: string; resolvedPath: string }> {
  const roots = Array.from(new Set(allowedRoots.filter(Boolean).map((root) => resolve(normalize(root)))))
  if (roots.length === 0) {
    throw new WidgetFileError('No visualization directories are available for this session.', 'access-denied')
  }

  const candidates = isAbsolute(file)
    ? [resolve(normalize(file))]
    : roots.map((root) => resolve(root, file))

  const canonicalRoots = await Promise.all(roots.map(canonicalPath))
  let foundAllowedCandidate = false
  let escapedAllowedRoot = false
  for (const candidate of candidates) {
    const canonicalCandidate = await canonicalCandidatePath(candidate, roots, canonicalRoots)
    if (!canonicalRoots.some((root) => isPathInside(canonicalCandidate, root))) {
      escapedAllowedRoot = true
      continue
    }
    foundAllowedCandidate = true

    try {
      const fileStat = await stat(canonicalCandidate)
      if (!fileStat.isFile()) continue
      if (fileStat.size > MAX_WIDGET_HTML_BYTES) {
        throw new WidgetFileError('Visualization file is larger than 2 MB.', 'read-failed')
      }
      return {
        html: await readFile(canonicalCandidate, 'utf8'),
        resolvedPath: canonicalCandidate,
      }
    } catch (error) {
      if (error instanceof WidgetFileError) throw error
      const code = (error as NodeJS.ErrnoException).code
      if (code !== 'ENOENT' && code !== 'ENOTDIR') {
        throw new WidgetFileError('Visualization file could not be read.', 'read-failed')
      }
    }
  }

  if (!foundAllowedCandidate && (isAbsolute(file) || escapedAllowedRoot)) {
    throw new WidgetFileError('Visualization file is outside the allowed directories.', 'access-denied')
  }
  throw new WidgetFileError('Visualization file was not found.', 'not-found')
}
