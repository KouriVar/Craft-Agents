import type { BrowserAskAiSnapshot, BrowserNewTabApi } from '../../../shared/types'

interface LaunchBrowserAskAiSessionOptions {
  api: Pick<BrowserNewTabApi, 'startAskAi' | 'openAskAiSession'> | undefined
  prompt: string
  token: string
  unavailableMessage: string
  onOpened: () => void
}

/**
 * Starts a real session from the reusable browser launcher. The launcher is
 * reset only after the app has accepted the navigation to ChatPage, so a
 * failed start remains visible and retryable in the current tab.
 */
export async function launchBrowserAskAiSession({
  api,
  prompt,
  token,
  unavailableMessage,
  onOpened,
}: LaunchBrowserAskAiSessionOptions): Promise<BrowserAskAiSnapshot> {
  if (!api) throw new Error(unavailableMessage)

  const session = await api.startAskAi({ prompt, token })
  if (!session.sessionId) throw new Error(unavailableMessage)

  await api.openAskAiSession()
  onOpened()
  return session
}
