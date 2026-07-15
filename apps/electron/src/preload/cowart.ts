import { contextBridge, ipcRenderer } from 'electron'
import { normalizeCowartFollowUpRequest } from '../shared/cowart-bridge'

const cowartMcp = {
  async sendFollowUpMessage(message: unknown): Promise<{ ok: true }> {
    const request = normalizeCowartFollowUpRequest(message)
    if (!request) throw new Error('Cowart follow-up message is empty or too large.')

    const result = await ipcRenderer.invoke('__cowart:send-follow-up-message', request) as
      | { ok: true }
      | { ok: false; error: string }
    if (!result?.ok) throw new Error(result?.error || 'Craft Agent rejected the Cowart follow-up message.')
    return result
  },

  getHostCapabilities() {
    return { message: { image: false } }
  },
}

contextBridge.exposeInMainWorld('cowartMcp', cowartMcp)
