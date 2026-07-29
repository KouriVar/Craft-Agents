export interface BrowserWorkspaceTabRequest {
  initialUrl?: string
  onCreated: (id: string | null) => void
}

const OPEN_BROWSER_WORKSPACE_TAB = 'craft:browser-workspace-open-tab'

/** Ask the AppShell-owned browser workspace service to create a runtime tab. */
export function requestBrowserWorkspaceTab(initialUrl?: string): Promise<string | null> {
  return new Promise((resolve) => {
    window.dispatchEvent(new CustomEvent<BrowserWorkspaceTabRequest>(OPEN_BROWSER_WORKSPACE_TAB, {
      detail: { initialUrl, onCreated: resolve },
    }))
  })
}

export function subscribeBrowserWorkspaceTabRequests(
  listener: (request: BrowserWorkspaceTabRequest) => void,
): () => void {
  const handler = (event: Event) => listener((event as CustomEvent<BrowserWorkspaceTabRequest>).detail)
  window.addEventListener(OPEN_BROWSER_WORKSPACE_TAB, handler)
  return () => window.removeEventListener(OPEN_BROWSER_WORKSPACE_TAB, handler)
}
