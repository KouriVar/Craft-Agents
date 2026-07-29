import { atom } from 'jotai'

export type CapabilityNavigatorKind = 'experts' | 'skills' | 'connectors'

export const capabilityNavigatorKindAtom = atom<CapabilityNavigatorKind>('experts')
export const selectedCapabilityIdAtom = atom<string | null>(null)

