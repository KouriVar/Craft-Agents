/**
 * Library path helpers — isomorphic (no Node `path` module) so renderer can import
 * `@craft-agent/shared/library` without Vite externalizing `path`.
 *
 * Relative paths stored in meta use POSIX separators (`documents/id.md`).
 * Absolute joins use the runtime platform separator when available.
 */

export const LIBRARY_DIR = 'library'
export const MANIFEST_FILE = 'manifest.json'
export const INDEX_FILE = 'resources.index.json'
export const DOCUMENTS_DIR = 'documents'
export const VERSIONS_DIR = 'versions'

function platformSep(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = (globalThis as any)?.process
    if (p?.platform === 'win32') return '\\'
  } catch {
    /* ignore */
  }
  return '/'
}

/** Join absolute-ish segments with platform separator. */
export function joinFs(...parts: string[]): string {
  const sep = platformSep()
  const joined = parts
    .filter((p) => p != null && p !== '')
    .map((p, i) => {
      let s = String(p).replace(/[\\/]+/g, sep)
      if (i > 0) s = s.replace(new RegExp(`^[${sep === '\\' ? '\\\\' : '/'}]+`), '')
      if (i < parts.length - 1) s = s.replace(new RegExp(`[${sep === '\\' ? '\\\\' : '/'}]+$`), '')
      return s
    })
    .filter(Boolean)
    .join(sep)
  return joined
}

/** Normalize path separators for comparison. */
function normalizeFs(p: string): string {
  const sep = platformSep()
  let out = p.replace(/[\\/]+/g, sep)
  // Remove trailing sep except root
  if (out.length > 1 && out.endsWith(sep)) out = out.slice(0, -1)
  return out
}

export function libraryRoot(workspaceDataRoot: string): string {
  return joinFs(workspaceDataRoot, LIBRARY_DIR)
}

export function manifestPath(workspaceDataRoot: string): string {
  return joinFs(libraryRoot(workspaceDataRoot), MANIFEST_FILE)
}

export function indexPath(workspaceDataRoot: string): string {
  return joinFs(libraryRoot(workspaceDataRoot), INDEX_FILE)
}

export function documentBodyPath(workspaceDataRoot: string, documentId: string): string {
  return joinFs(libraryRoot(workspaceDataRoot), DOCUMENTS_DIR, `${documentId}.md`)
}

export function documentMetaPath(workspaceDataRoot: string, documentId: string): string {
  return joinFs(libraryRoot(workspaceDataRoot), DOCUMENTS_DIR, `${documentId}.meta.json`)
}

export function versionDir(workspaceDataRoot: string, documentId: string): string {
  return joinFs(libraryRoot(workspaceDataRoot), VERSIONS_DIR, documentId)
}

export function versionBodyPath(workspaceDataRoot: string, documentId: string, versionId: string): string {
  return joinFs(versionDir(workspaceDataRoot, documentId), `${versionId}.md`)
}

export function versionMetaPath(workspaceDataRoot: string, documentId: string, versionId: string): string {
  return joinFs(versionDir(workspaceDataRoot, documentId), `${versionId}.meta.json`)
}

/** Relative body path stored in DocumentMeta.bodyPath (always POSIX). */
export function relativeBodyPath(documentId: string): string {
  return `${DOCUMENTS_DIR}/${documentId}.md`
}

/**
 * Resolve a stored relative path under library root; rejects traversal.
 */
export function resolveLibraryRelativePath(workspaceDataRoot: string, relativePath: string): string {
  if (!relativePath || relativePath.includes('\0')) {
    throw new Error('Path escapes library root')
  }
  if (relativePath.includes('..') || relativePath.startsWith('/') || /^[A-Za-z]:/.test(relativePath)) {
    throw new Error('Path escapes library root')
  }
  const root = normalizeFs(libraryRoot(workspaceDataRoot))
  const resolved = normalizeFs(joinFs(libraryRoot(workspaceDataRoot), relativePath.replace(/[\\/]+/g, platformSep())))
  const rootPrefix = root.endsWith(platformSep()) ? root : root + platformSep()
  if (resolved !== root && !resolved.startsWith(rootPrefix)) {
    throw new Error('Path escapes library root')
  }
  return resolved
}

export function assertSafeDocumentId(documentId: string): void {
  if (!documentId || !/^[A-Za-z0-9_-]{8,128}$/.test(documentId)) {
    throw new Error('Invalid documentId')
  }
}

export function assertSafeVersionId(versionId: string): void {
  if (!versionId || !/^[A-Za-z0-9_-]{8,128}$/.test(versionId)) {
    throw new Error('Invalid versionId')
  }
}
