/**
 * Settings Registry - Single Source of Truth
 *
 * Canonical settings pages (sidebar) plus legacy route aliases that redirect
 * to a page + optional in-page section.
 *
 * To add a new settings page:
 * 1. Add an entry to SETTINGS_PAGES below
 * 2. Create the page component in renderer/pages/settings/
 * 3. Add to SETTINGS_PAGE_COMPONENTS in renderer/pages/settings/settings-pages.ts
 * 4. Add icon to SETTINGS_ICONS in components/icons/SettingsIcons.tsx
 */

/**
 * Settings page definition
 */
export interface SettingsPageDefinition {
  /** Unique identifier used in routes and navigation */
  id: string
  /** i18n key for display label in settings navigator */
  labelKey: string
  /** i18n key for short description shown in settings navigator */
  descriptionKey: string
}

/**
 * Canonical settings pages. Order = sidebar display order.
 *
 * NOTE: labelKey/descriptionKey are i18n translation keys, resolved at render
 * time via t(). Do NOT call i18n.t() here — this module loads before i18n init.
 */
export const SETTINGS_PAGES = [
  { id: 'app' as const, labelKey: 'settings.app.title', descriptionKey: 'settings.app.description' },
  { id: 'interface' as const, labelKey: 'settings.interface.title', descriptionKey: 'settings.interface.description' },
  { id: 'profile' as const, labelKey: 'settings.profile.title', descriptionKey: 'settings.profile.description' },
  { id: 'ai' as const, labelKey: 'settings.ai.title', descriptionKey: 'settings.ai.description' },
  { id: 'browser' as const, labelKey: 'settings.browser.title', descriptionKey: 'settings.browser.description' },
  { id: 'integrations' as const, labelKey: 'settings.integrations.title', descriptionKey: 'settings.integrations.description' },
  { id: 'security' as const, labelKey: 'settings.security.title', descriptionKey: 'settings.security.description' },
  { id: 'cognition' as const, labelKey: 'settings.cognition.title', descriptionKey: 'settings.cognition.description' },
] satisfies readonly SettingsPageDefinition[]

/**
 * Settings subpage type - derived from SETTINGS_PAGES
 */
export type SettingsSubpage = (typeof SETTINGS_PAGES)[number]['id']

/**
 * Array of valid settings subpage IDs - for runtime validation
 */
export const VALID_SETTINGS_SUBPAGES: readonly SettingsSubpage[] = SETTINGS_PAGES.map(p => p.id)

/**
 * Legacy settings route IDs → canonical page + optional section anchor.
 * Old deep links keep working; sidebar no longer lists these IDs.
 */
export const SETTINGS_ROUTE_ALIASES = {
  bookmarks: { page: 'browser' as const, section: 'bookmarks' },
  appearance: { page: 'interface' as const, section: 'appearance' },
  input: { page: 'interface' as const, section: 'input' },
  shortcuts: { page: 'interface' as const, section: 'shortcuts' },
  preferences: { page: 'profile' as const, section: 'about-me' },
  workspace: { page: 'profile' as const, section: 'workspace' },
  labels: { page: 'profile' as const, section: 'labels' },
  messaging: { page: 'integrations' as const, section: 'messaging' },
  server: { page: 'integrations' as const, section: 'remote-access' },
  accounts: { page: 'integrations' as const, section: 'credentials' },
  privacy: { page: 'security' as const, section: 'privacy' },
  permissions: { page: 'security' as const, section: 'permissions' },
} as const satisfies Record<string, { page: SettingsSubpage; section?: string }>

export type SettingsRouteAlias = keyof typeof SETTINGS_ROUTE_ALIASES

/** Canonical page OR legacy alias — accepted by `routes.view.settings()` and parsers. */
export type SettingsRouteId = SettingsSubpage | SettingsRouteAlias

export interface ResolvedSettingsRoute {
  page: SettingsSubpage
  section?: string
}

/**
 * Resolve a settings route id (canonical or legacy alias) to a page + section.
 */
export function resolveSettingsRoute(id: string): ResolvedSettingsRoute | null {
  if (VALID_SETTINGS_SUBPAGES.includes(id as SettingsSubpage)) {
    return { page: id as SettingsSubpage }
  }
  const alias = SETTINGS_ROUTE_ALIASES[id as SettingsRouteAlias]
  if (alias) return { page: alias.page, section: alias.section }
  return null
}

/**
 * Type guard for canonical settings subpage IDs
 */
export function isValidSettingsSubpage(value: string): value is SettingsSubpage {
  return VALID_SETTINGS_SUBPAGES.includes(value as SettingsSubpage)
}

/**
 * True if value is a canonical page OR a legacy alias
 */
export function isValidSettingsRouteId(value: string): boolean {
  return resolveSettingsRoute(value) !== null
}

/**
 * Top-level deep-link hosts that should resolve as settings routes
 * (e.g. craftagents://appearance → settings/appearance).
 *
 * Excludes hosts that already mean something else at the URL root:
 * - `browser` → browser workspace navigator
 * - `workspace` → craftagents://workspace/{workspaceId}/...
 *
 * Settings workspace page remains available as `settings/workspace`
 * (alias → profile#workspace).
 */
export function isSettingsTopLevelRouteId(value: string): boolean {
  if (value === 'browser' || value === 'workspace') return false
  return isValidSettingsRouteId(value)
}

/**
 * Get settings page definition by ID
 */
export function getSettingsPage(id: SettingsSubpage): SettingsPageDefinition {
  const page = SETTINGS_PAGES.find(p => p.id === id)
  if (!page) throw new Error(`Unknown settings page: ${id}`)
  return page
}
