import type { SavedWindow, WindowBounds, WindowState } from './window-state'

const DEFAULT_MIN_WIDTH = 800
const DEFAULT_MIN_HEIGHT = 600

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function isValidWindowBounds(value: unknown): value is WindowBounds {
  if (!value || typeof value !== 'object') return false
  const bounds = value as Partial<WindowBounds>
  return isFiniteNumber(bounds.x)
    && isFiniteNumber(bounds.y)
    && isFiniteNumber(bounds.width)
    && isFiniteNumber(bounds.height)
    && bounds.width > 0
    && bounds.height > 0
}

function sanitizeSavedWindow(value: unknown): SavedWindow | null {
  if (!value || typeof value !== 'object') return null
  const saved = value as Partial<SavedWindow>
  if (saved.type !== 'main' || typeof saved.workspaceId !== 'string' || saved.workspaceId.length === 0) return null
  if (!isValidWindowBounds(saved.bounds)) return null
  if (saved.focused !== undefined && typeof saved.focused !== 'boolean') return null
  if (saved.url !== undefined && typeof saved.url !== 'string') return null

  return {
    type: 'main',
    workspaceId: saved.workspaceId,
    bounds: { ...saved.bounds },
    ...(saved.focused === true && { focused: true }),
    ...(saved.url && { url: saved.url }),
  }
}

/** Reject malformed persisted state before it reaches BrowserWindow.setBounds. */
export function sanitizeWindowState(value: unknown): WindowState | null {
  if (!value || typeof value !== 'object') return null
  const state = value as { windows?: unknown; lastFocusedWorkspaceId?: unknown }
  if (!Array.isArray(state.windows)) return null

  const windows = state.windows
    .map(sanitizeSavedWindow)
    .filter((saved): saved is SavedWindow => saved !== null)
  const lastFocusedWorkspaceId = typeof state.lastFocusedWorkspaceId === 'string'
    && state.lastFocusedWorkspaceId.length > 0
    ? state.lastFocusedWorkspaceId
    : undefined

  return { windows, ...(lastFocusedWorkspaceId && { lastFocusedWorkspaceId }) }
}

function intersectionArea(a: WindowBounds, b: WindowBounds): number {
  const width = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
  const height = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))
  return width * height
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/**
 * Fit persisted DIP bounds into the current display topology. The first work
 * area is treated as primary when a removed monitor leaves no intersection.
 */
export function fitWindowBoundsToWorkAreas(
  savedBounds: WindowBounds,
  workAreas: WindowBounds[],
  minimumSize: Pick<WindowBounds, 'width' | 'height'> = {
    width: DEFAULT_MIN_WIDTH,
    height: DEFAULT_MIN_HEIGHT,
  },
): WindowBounds {
  const validAreas = workAreas.filter(isValidWindowBounds)
  if (validAreas.length === 0) return { ...savedBounds }

  const targetArea = validAreas.reduce((best, candidate) =>
    intersectionArea(savedBounds, candidate) > intersectionArea(savedBounds, best) ? candidate : best,
  validAreas[0])
  const width = Math.min(
    Math.max(Math.round(savedBounds.width), Math.min(minimumSize.width, targetArea.width)),
    targetArea.width,
  )
  const height = Math.min(
    Math.max(Math.round(savedBounds.height), Math.min(minimumSize.height, targetArea.height)),
    targetArea.height,
  )
  const x = clamp(Math.round(savedBounds.x), targetArea.x, targetArea.x + targetArea.width - width)
  const y = clamp(Math.round(savedBounds.y), targetArea.y, targetArea.y + targetArea.height - height)

  return { x, y, width, height }
}

export function windowBoundsEqual(a: WindowBounds, b: WindowBounds): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
}
