/**
 * Provides the in-page settings section from navigation (legacy deep links).
 */

import { createContext, useContext } from 'react'

const SettingsSectionContext = createContext<string | undefined>(undefined)

export function SettingsSectionProvider({
  section,
  children,
}: {
  section?: string
  children: React.ReactNode
}) {
  return (
    <SettingsSectionContext.Provider value={section}>
      {children}
    </SettingsSectionContext.Provider>
  )
}

export function useSettingsNavSection(): string | undefined {
  return useContext(SettingsSectionContext)
}
