import { atom } from 'jotai'
import type { WorkspacePluginEntry } from '@craft-agent/shared/plugins'

export const pluginsAtom = atom<WorkspacePluginEntry[]>([])
