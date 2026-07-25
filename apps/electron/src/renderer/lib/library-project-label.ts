/**
 * Resolve a Library document's projectId to a user-visible label.
 * Never requires new network I/O — uses the in-memory projects list.
 */

export interface LibraryProjectLabelSource {
  config: {
    id: string
    name: string
    color?: string
  }
}

export interface LibraryProjectLabel {
  /** User-visible name when the project still exists. */
  name?: string
  color?: string
  /** True when projectId was set but no matching project was found. */
  missing: boolean
}

/**
 * @returns null when projectId is absent/empty.
 * @returns missing:true (no name) when the project was deleted — callers should
 *   show a safe unbound fallback, not the raw id.
 */
export function resolveLibraryProjectLabel(
  projectId: string | undefined | null,
  projects: readonly LibraryProjectLabelSource[],
): LibraryProjectLabel | null {
  const id = projectId?.trim()
  if (!id) return null
  const match = projects.find((project) => project.config.id === id)
  if (!match) {
    return { missing: true }
  }
  return {
    name: match.config.name,
    color: match.config.color,
    missing: false,
  }
}
