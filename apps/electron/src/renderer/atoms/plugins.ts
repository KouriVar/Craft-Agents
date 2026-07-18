import { atom } from 'jotai'
import type { WorkspacePluginEntry } from '@craft-agent/shared/plugins'
import type { BrowserExtensionEntry } from '../../shared/types'

export const pluginsAtom = atom<WorkspacePluginEntry[]>([])

export type PluginListKind = 'plugins' | 'extensions'

export const pluginListKindAtom = atom<PluginListKind>('plugins')
export const browserExtensionsAtom = atom<BrowserExtensionEntry[]>([])
export const selectedBrowserExtensionIdAtom = atom<string | null>(null)
