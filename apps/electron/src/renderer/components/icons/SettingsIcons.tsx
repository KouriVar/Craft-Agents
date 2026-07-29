/**
 * Settings Icons
 *
 * Shared Lucide icon mapping for settings pages. Used by both:
 * - AppMenu (logo dropdown settings submenu)
 * - SettingsNavigator (settings sidebar panel)
 */

import {
  Cable,
  Palette,
  Shield,
  Sparkles,
  ToggleRight,
  UserCircle,
  BrainCircuit,
  Globe2,
} from 'lucide-react'
import type { SettingsSubpage } from '../../../shared/types'

type IconProps = { className?: string }

export const AppSettingsIcon = ({ className }: IconProps) => <ToggleRight className={className} />
export const InterfaceSettingsIcon = ({ className }: IconProps) => <Palette className={className} />
export const ProfileSettingsIcon = ({ className }: IconProps) => <UserCircle className={className} />
export const AiSettingsIcon = ({ className }: IconProps) => <Sparkles className={className} />
export const BrowserSettingsIcon = ({ className }: IconProps) => <Globe2 className={className} />
export const IntegrationsSettingsIcon = ({ className }: IconProps) => <Cable className={className} />
export const SecuritySettingsIcon = ({ className }: IconProps) => <Shield className={className} />
export const CognitionSettingsIcon = ({ className }: IconProps) => <BrainCircuit className={className} />

/** @deprecated Use InterfaceSettingsIcon */
export const AppearanceIcon = InterfaceSettingsIcon
/** @deprecated Use SecuritySettingsIcon */
export const PrivacySettingsIcon = SecuritySettingsIcon
/** @deprecated Use ProfileSettingsIcon */
export const PreferencesIcon = ProfileSettingsIcon

/**
 * Map of settings subpage IDs to their icon components.
 * Used by both AppMenu and SettingsNavigator for consistent icons.
 */
export const SETTINGS_ICONS: Record<SettingsSubpage, React.ComponentType<IconProps>> = {
  app: AppSettingsIcon,
  interface: InterfaceSettingsIcon,
  profile: ProfileSettingsIcon,
  ai: AiSettingsIcon,
  browser: BrowserSettingsIcon,
  integrations: IntegrationsSettingsIcon,
  security: SecuritySettingsIcon,
  cognition: CognitionSettingsIcon,
}
