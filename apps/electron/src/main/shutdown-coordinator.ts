export interface ShutdownLogger {
  info(message: string, details?: unknown): void
  error(message: string, error?: unknown): void
}

export interface ShutdownResources {
  sessionManager?: {
    flushAllSessions(): Promise<void>
    cleanup(): Promise<void>
  } | null
  browserPaneManager?: { prepareForShutdown?(): Promise<void>; destroyAll(): void } | null
  oauthFlowStore?: { dispose(): void } | null
  stopModelRefresh(): void
  messagingHandle?: { dispose(): Promise<void> } | null
  cleanupPowerManager(): void | Promise<void>
  releaseServerLock(): void
  logger: ShutdownLogger
}

export interface ShutdownPhaseResult {
  phase: string
  ok: boolean
  durationMs: number
}

/**
 * Cleans every independently-created resource even when bootstrap stopped before
 * SessionManager was assigned or an earlier cleanup phase throws.
 */
export async function cleanupApplicationResources(resources: ShutdownResources): Promise<ShutdownPhaseResult[]> {
  const results: ShutdownPhaseResult[] = []
  const run = async (phase: string, action: (() => void | Promise<void>) | null) => {
    if (!action) return
    const startedAt = Date.now()
    try {
      await action()
      const result = { phase, ok: true, durationMs: Date.now() - startedAt }
      results.push(result)
      resources.logger.info('[shutdown] phase complete', result)
    } catch (error) {
      const result = { phase, ok: false, durationMs: Date.now() - startedAt }
      results.push(result)
      resources.logger.error(`[shutdown] phase failed: ${phase}`, error)
    }
  }

  await run('session-flush', resources.sessionManager
    ? () => resources.sessionManager!.flushAllSessions()
    : null)
  await run('session-cleanup', resources.sessionManager
    ? () => resources.sessionManager!.cleanup()
    : null)
  await run('browser-flush', resources.browserPaneManager?.prepareForShutdown
    ? () => resources.browserPaneManager!.prepareForShutdown!()
    : null)
  await run('browser-destroy-all', resources.browserPaneManager
    ? () => resources.browserPaneManager!.destroyAll()
    : null)
  await run('oauth-dispose', resources.oauthFlowStore
    ? () => resources.oauthFlowStore!.dispose()
    : null)
  await run('model-refresh-stop', () => resources.stopModelRefresh())
  await run('messaging-dispose', resources.messagingHandle
    ? () => resources.messagingHandle!.dispose()
    : null)
  await run('power-cleanup', () => resources.cleanupPowerManager())
  await run('server-lock-release', () => resources.releaseServerLock())

  return results
}
