import { useState } from 'react'
import type { SettingsSubpage } from '../../../shared/types'
import SettingsNavigator from '@/pages/settings/SettingsNavigator'
import type { ComponentEntry } from './types'

function SettingsNavigatorPreview() {
  const [selectedSubpage, setSelectedSubpage] = useState<SettingsSubpage>('appearance')

  return (
    <div className="h-full w-[292px] overflow-hidden rounded-xl border border-border bg-background shadow-sm">
      <SettingsNavigator
        selectedSubpage={selectedSubpage}
        onSelectSubpage={setSelectedSubpage}
      />
    </div>
  )
}

export const settingsComponents: ComponentEntry[] = [
  {
    id: 'settings-navigator',
    name: 'Settings Navigator',
    category: 'Settings',
    description: 'Flat grouped settings navigation with compact rows and a single selected state.',
    component: SettingsNavigatorPreview,
    props: [],
    layout: 'full',
    previewOverflow: 'hidden',
  },
]
