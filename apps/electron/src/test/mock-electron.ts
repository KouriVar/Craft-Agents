/**
 * Shared Electron module mock for unit tests.
 *
 * Bun's `mock.module('electron', ...)` is process-global: the last factory
 * registered wins for subsequent imports. Incomplete mocks therefore break
 * later suites that import named exports like `dialog` from `electron`
 * (the real `electron` npm package only exports a binary path string).
 *
 * Always spread `createElectronTestMock()` (optionally overriding fields)
 * instead of replacing the whole factory with a partial object.
 */

import { mock } from 'bun:test'

export type ElectronTestMock = ReturnType<typeof createElectronTestMock>

export function createElectronTestMock(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    ipcMain: {
      handle: mock(() => {}),
      on: mock(() => {}),
      once: mock(() => {}),
      removeHandler: mock(() => {}),
      removeAllListeners: mock(() => {}),
    },
    app: {
      isPackaged: false,
      getAppPath: mock(() => '/'),
      getPath: mock((name: string) => `/tmp/mock-${name}`),
      getLocale: mock(() => 'en-US'),
      getVersion: mock(() => '0.0.0-test'),
      quit: mock(() => {}),
      dock: { setIcon: mock(() => {}), setBadge: mock(() => {}) },
      on: mock(() => {}),
      whenReady: mock(async () => {}),
    },
    nativeTheme: {
      shouldUseDarkColors: false,
      on: mock(() => {}),
    },
    nativeImage: {
      createFromPath: mock(() => ({ isEmpty: () => true })),
      createFromDataURL: mock(() => ({})),
      createFromBuffer: mock(() => ({ isEmpty: () => true })),
    },
    dialog: {
      showOpenDialog: mock(async () => ({ canceled: true, filePaths: [] })),
      showSaveDialog: mock(async () => ({ canceled: true, filePath: undefined })),
      showMessageBox: mock(async () => ({ response: 0 })),
      showErrorBox: mock(() => {}),
    },
    shell: {
      openExternal: mock(async () => {}),
      openPath: mock(async () => ''),
      showItemInFolder: mock(() => {}),
    },
    BrowserWindow: {
      fromWebContents: mock(() => null),
      getFocusedWindow: mock(() => null),
      getAllWindows: mock(() => []),
    },
    BrowserView: class {},
    WebContentsView: class {},
    Menu: {
      buildFromTemplate: mock(() => ({ popup: mock(() => {}) })),
      setApplicationMenu: mock(() => {}),
    },
    session: {
      fromPartition: mock(() => ({
        flushStorageData: mock(async () => {}),
        setPermissionCheckHandler: mock(() => {}),
        setPermissionRequestHandler: mock(() => {}),
        webRequest: {
          onBeforeRequest: mock(() => {}),
          onCompleted: mock(() => {}),
          onErrorOccurred: mock(() => {}),
        },
        on: mock(() => {}),
        extensions: {
          getAllExtensions: mock(() => []),
          getExtension: mock(() => null),
          loadExtension: mock(async () => ({
            id: 'mock-extension',
            name: 'Mock',
            version: '1.0.0',
            path: '/tmp/mock-extension',
          })),
          removeExtension: mock(() => {}),
        },
      })),
      defaultSession: {},
    },
    clipboard: {
      writeText: mock((_value: string) => {}),
      readText: mock(() => ''),
    },
    safeStorage: {
      isEncryptionAvailable: mock(() => true),
      encryptString: mock((value: string) => Buffer.from(value)),
      decryptString: mock((value: Buffer) => value.toString('utf8')),
    },
    systemPreferences: {
      canPromptTouchID: mock(() => false),
      promptTouchID: mock(async () => {}),
    },
    net: {
      fetch: mock(async () => {
        throw new Error('not implemented in test')
      }),
    },
  }

  return {
    ...base,
    ...overrides,
    // Keep nested defaults when callers override a namespace partially.
    app: { ...(base.app as object), ...((overrides.app as object) ?? {}) },
    dialog: { ...(base.dialog as object), ...((overrides.dialog as object) ?? {}) },
    shell: { ...(base.shell as object), ...((overrides.shell as object) ?? {}) },
    ipcMain: { ...(base.ipcMain as object), ...((overrides.ipcMain as object) ?? {}) },
    nativeTheme: { ...(base.nativeTheme as object), ...((overrides.nativeTheme as object) ?? {}) },
    nativeImage: { ...(base.nativeImage as object), ...((overrides.nativeImage as object) ?? {}) },
    Menu: { ...(base.Menu as object), ...((overrides.Menu as object) ?? {}) },
    clipboard: { ...(base.clipboard as object), ...((overrides.clipboard as object) ?? {}) },
    safeStorage: { ...(base.safeStorage as object), ...((overrides.safeStorage as object) ?? {}) },
    systemPreferences: {
      ...(base.systemPreferences as object),
      ...((overrides.systemPreferences as object) ?? {}),
    },
    net: { ...(base.net as object), ...((overrides.net as object) ?? {}) },
  }
}

/** Register the shared Electron mock (last writer still wins — always spread this). */
export function mockElectronModule(overrides: Record<string, unknown> = {}): void {
  mock.module('electron', () => createElectronTestMock(overrides))
}
