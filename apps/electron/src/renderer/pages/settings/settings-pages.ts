/**
 * Settings Page Components Registry
 *
 * Maps settings subpage IDs to their React components.
 * TypeScript enforces that all pages defined in settings-registry have a component here.
 *
 * To add a new settings page:
 * 1. Add to SETTINGS_PAGES in shared/settings-registry.ts
 * 2. Create the page component (e.g., NewSettingsPage.tsx)
 * 3. Add to SETTINGS_PAGE_COMPONENTS below
 * 4. Add icon to SETTINGS_ICONS in components/icons/SettingsIcons.tsx
 */

import type { ComponentType } from 'react'
import type { SettingsSubpage } from '../../../shared/settings-registry'

import AppSettingsPage from './AppSettingsPage'
import InterfaceSettingsPage from './InterfaceSettingsPage'
import ProfileSettingsPage from './ProfileSettingsPage'
import AiSettingsPage from './AiSettingsPage'
import BrowserSettingsPage from './BrowserSettingsPage'
import IntegrationsSettingsPage from './IntegrationsSettingsPage'
import SecuritySettingsPage from './SecuritySettingsPage'
import CognitionDebugPage from './CognitionDebugPage'

/**
 * Map of settings subpage IDs to their page components.
 * TypeScript will error if a page from SETTINGS_PAGES is missing here.
 *
 * Legacy page components (Appearance, Input, etc.) remain importable for reuse
 * inside composite pages but are not registered in this map.
 */
export const SETTINGS_PAGE_COMPONENTS: Record<SettingsSubpage, ComponentType> = {
  app: AppSettingsPage,
  interface: InterfaceSettingsPage,
  profile: ProfileSettingsPage,
  ai: AiSettingsPage,
  browser: BrowserSettingsPage,
  integrations: IntegrationsSettingsPage,
  security: SecuritySettingsPage,
  cognition: CognitionDebugPage,
}

/**
 * Get the component for a settings subpage
 */
export function getSettingsPageComponent(subpage: SettingsSubpage): ComponentType {
  return SETTINGS_PAGE_COMPONENTS[subpage]
}
