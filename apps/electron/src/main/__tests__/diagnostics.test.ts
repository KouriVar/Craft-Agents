import { describe, expect, it } from 'bun:test'
import { createDiagnosticBundle, redactDiagnosticValue } from '../diagnostics'

describe('diagnostic privacy', () => {
  it('redacts secret fields and token-shaped values recursively', () => {
    expect(redactDiagnosticValue({
      authorization: 'Bearer abc.def',
      nested: {
        apiKey: 'sk-super-secret-value',
        message: 'failed with Bearer token-value and sk-anothersecret',
      },
    })).toEqual({
      authorization: '[REDACTED]',
      nested: {
        apiKey: '[REDACTED]',
        message: 'failed with Bearer [REDACTED] and [REDACTED_API_KEY]',
      },
    })
  })

  it('reduces web URLs to origins', () => {
    expect(redactDiagnosticValue('https://user:pass@example.com/private?q=token#content'))
      .toBe('https://example.com')
  })
})

describe('createDiagnosticBundle', () => {
  it('exports aggregate state without URLs, names, paths, or raw errors', () => {
    const bundle = createDiagnosticBundle({
      generatedAt: new Date('2026-07-18T10:00:00.000Z'),
      application: { version: '0.11.6', isPackaged: true, locale: 'zh-CN' },
      runtime: {
        platform: 'win32',
        arch: 'x64',
        node: '22',
        electron: '37',
        chromium: '138',
        uptimeSeconds: 12.6,
      },
      startup: {
        milestonesMs: { 'electron-ready': 420, 'app-initialized': 1_250 },
      },
      resources: {
        electronProcesses: {
          total: 3,
          byType: { browser: 1, tab: 2 },
          totalWorkingSetMb: 256.5,
          largestPeakWorkingSetMb: 128,
        },
        mainProcessMemory: { rssMb: 100, heapUsedMb: 40, heapTotalMb: 60, externalMb: 5 },
        activeResources: { timeout: 4, 'pipe-wrap': 2 },
        appEventListeners: { 'before-quit': 1, 'second-instance': 1 },
      },
      proxy: {
        enabled: true,
        httpProxy: 'http://secret.example.test:8080',
        noProxy: 'private.internal',
      },
      browserInstances: [
        { isVisible: true },
        { crashed: true, crashReason: 'crashed', crashRecoveryAttempts: 2 },
        { crashed: true, crashReason: 'contains private content', crashRecoveryAttempts: 1 },
      ],
      update: {
        provider: 'generic',
        channel: 'latest',
        manifest: 'latest.yml',
        currentVersion: '0.11.8',
        latestVersion: '0.11.9',
        downloadState: 'ready',
        installMode: 'automatic',
        manualRecoveryAvailable: false,
        allowDowngrade: false,
        autoInstallOnAppQuit: false,
        cacheDirectoryResolved: true,
        cacheMigrationVersion: '0.11.8',
        cacheMigrationApplied: true,
        lastCacheCleanupResult: 'succeeded',
      },
      plugins: {
        installedCount: 3,
        mcpCheckedAt: Date.parse('2026-07-18T09:00:00.000Z'),
        mcpServers: [
          { state: 'ready' },
          { state: 'error', errorType: 'needs-auth' },
          { state: 'error', errorType: 'private error text' },
        ],
      },
      services: {
        sessionManagerReady: true,
        browserManagerReady: true,
        messagingBindings: 2,
        messagingConfiguredPlatforms: 1,
        messagingConnectedPlatforms: 0,
      },
    })

    expect(bundle).toMatchObject({
      generatedAt: '2026-07-18T10:00:00.000Z',
      proxy: { mode: 'custom', configuredProtocols: ['http'], hasBypassRules: true },
      browser: {
        totalTabs: 3,
        visibleTabs: 1,
        crashedTabs: [
          { reason: 'crashed', attempts: 2 },
          { reason: 'unknown', attempts: 1 },
        ],
      },
      update: {
        manifest: 'latest.yml',
        currentVersion: '0.11.8',
        latestVersion: '0.11.9',
        allowDowngrade: false,
        autoInstallOnAppQuit: false,
        cacheMigrationApplied: true,
      },
      plugins: {
        installedCount: 3,
        mcp: {
          total: 3,
          states: { ready: 1, error: 2 },
          errorTypes: { 'needs-auth': 1, unknown: 1 },
        },
      },
    })
    expect(JSON.stringify(bundle)).not.toContain('secret.example')
    expect(JSON.stringify(bundle)).not.toContain('private.internal')
    expect(JSON.stringify(bundle)).not.toContain('private error text')
    expect(bundle.privacy).toMatchObject({ processIdsIncluded: false, commandLinesIncluded: false })
  })
})
