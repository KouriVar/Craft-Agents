/**
 * TerminalPaneManager
 *
 * Creates Electron BrowserWindows with an embedded xterm.js terminal.
 * node-pty is preferred for real TTY behavior. If it is not available, we keep
 * the experience in-app with a plain shell child process instead of opening the
 * operating system Terminal app.
 */

import { BrowserWindow, ipcMain, type WebContents } from 'electron'
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import { join } from 'path'
import { existsSync } from 'fs'
import { randomUUID } from 'crypto'

let pty: any = null
function loadPty() {
  if (pty) return pty
  try {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    pty = (0, eval)('require')('node-pty')
    return pty
  } catch (err) {
    console.error('[TerminalPaneManager] Failed to load node-pty:', err)
    return null
  }
}

interface TerminalProcess {
  write(data: string): void
  resize?(cols: number, rows: number): void
  kill(): void
}

interface TerminalInstance {
  window: BrowserWindow
  process: TerminalProcess
}

const instances = new Map<number, TerminalInstance>()
const embeddedInstances = new Map<string, { owner: WebContents; process: TerminalProcess }>()
let ipcRegistered = false

function ensureIpcHandlers() {
  if (ipcRegistered) return
  ipcRegistered = true

  ipcMain.on('terminal:input', (event, data: string) => {
    const instance = instances.get(event.sender.id)
    try {
      instance?.process.write(data)
    } catch {
      // Process might have already exited.
    }
  })

  ipcMain.on('terminal:resize', (event, { cols, rows }: { cols: number; rows: number }) => {
    const instance = instances.get(event.sender.id)
    try {
      instance?.process.resize?.(cols, rows)
    } catch {
      // Process might have already exited.
    }
  })

  ipcMain.handle('terminal:embedded:create', (event, cwd: string) => {
    return createEmbeddedTerminal(event.sender, cwd)
  })

  ipcMain.on('terminal:embedded:input', (_event, { id, data }: { id: string; data: string }) => {
    try {
      embeddedInstances.get(id)?.process.write(data)
    } catch {
      // Process might have already exited.
    }
  })

  ipcMain.on('terminal:embedded:resize', (_event, { id, cols, rows }: { id: string; cols: number; rows: number }) => {
    try {
      embeddedInstances.get(id)?.process.resize?.(cols, rows)
    } catch {
      // Process might have already exited.
    }
  })

  ipcMain.on('terminal:embedded:close', (_event, id: string) => {
    const instance = embeddedInstances.get(id)
    if (!instance) return
    try {
      instance.process.kill()
    } catch {
      // Process might have already exited.
    }
    embeddedInstances.delete(id)
  })
}

function firstExistingPath(paths: string[]): string | undefined {
  return paths.find(path => existsSync(path))
}

function resolveTerminalHtmlPath(): string | undefined {
  return firstExistingPath([
    join(__dirname, 'resources', 'terminal.html'),
    join(__dirname, '..', 'resources', 'terminal.html'),
  ])
}

function resolveTerminalPreloadPath(): string | undefined {
  return firstExistingPath([
    join(__dirname, 'terminal-preload.cjs'),
    join(__dirname, '..', 'src', 'preload', 'terminal-preload.cjs'),
  ])
}

function getShell(): string {
  if (process.env.SHELL) return process.env.SHELL
  if (process.platform === 'darwin') return '/bin/zsh'
  if (process.platform === 'win32') return 'cmd.exe'
  return 'bash'
}

function getShellArgs(shell: string): string[] {
  if (process.platform === 'win32') return []
  const shellName = shell.split('/').pop() ?? shell
  if (shellName === 'zsh' || shellName === 'bash') return ['-l']
  return ['-i']
}

function sendTerminalData(win: BrowserWindow, data: string): void {
  if (!win.isDestroyed()) {
    win.webContents.send('terminal:data', data)
  }
}

function closeAfterExit(win: BrowserWindow): void {
  if (!win.isDestroyed()) {
    win.webContents.send('terminal:exit')
    setTimeout(() => {
      if (!win.isDestroyed()) win.close()
    }, 100)
  }
}

function createTerminalProcess(
  cwd: string,
  onData: (data: string) => void,
  onExit: () => void,
): TerminalProcess {
  const shell = getShell()
  const ptyModule = loadPty()

  if (ptyModule) {
    const ptyProcess = ptyModule.spawn(shell, getShellArgs(shell), {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        TERM_PROGRAM: 'CraftAgent',
      } as Record<string, string>,
    })

    ptyProcess.onData((data: string) => onData(data))
    ptyProcess.onExit(onExit)

    return {
      write: (data: string) => ptyProcess.write(data),
      resize: (cols: number, rows: number) => ptyProcess.resize(cols, rows),
      kill: () => ptyProcess.kill(),
    }
  }

  const child = spawn(shell, getShellArgs(shell), {
    cwd,
    env: { ...process.env, TERM: 'xterm-256color', TERM_PROGRAM: 'CraftAgent' },
    shell: false,
  }) as ChildProcessWithoutNullStreams

  child.stdout.on('data', data => onData(data.toString()))
  child.stderr.on('data', data => onData(data.toString()))
  child.on('exit', onExit)

  return {
    write: (data: string) => child.stdin.write(data),
    kill: () => child.kill(),
  }
}

export function registerTerminalIpc(): void {
  ensureIpcHandlers()
}

export function createEmbeddedTerminal(owner: WebContents, cwd: string): string {
  ensureIpcHandlers()

  const id = randomUUID()
  const terminalProcess = createTerminalProcess(
    cwd,
    data => {
      if (!owner.isDestroyed()) {
        owner.send('terminal:embedded:data', { id, data })
      }
    },
    () => {
      embeddedInstances.delete(id)
      if (!owner.isDestroyed()) {
        owner.send('terminal:embedded:exit', { id })
      }
    },
  )

  embeddedInstances.set(id, { owner, process: terminalProcess })

  owner.once('destroyed', () => {
    const instance = embeddedInstances.get(id)
    if (!instance) return
    try {
      instance.process.kill()
    } catch {
      // Process might have already exited.
    }
    embeddedInstances.delete(id)
  })

  return id
}

export function openTerminalPane(cwd: string): void {
  const htmlPath = resolveTerminalHtmlPath()
  if (!htmlPath) {
    console.error('[TerminalPaneManager] terminal.html not found')
    return
  }

  const preloadPath = resolveTerminalPreloadPath()
  if (!preloadPath) {
    console.error('[TerminalPaneManager] terminal preload not found')
    return
  }

  ensureIpcHandlers()

  const win = new BrowserWindow({
    width: 720,
    height: 480,
    minWidth: 400,
    minHeight: 200,
    title: 'Terminal',
    show: false,
    backgroundColor: '#1e1e2e',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  win.loadFile(htmlPath)
  win.once('ready-to-show', () => win.show())

  // Cache before any navigation/close — `webContents.id` is unreliable after destroy.
  const webContentsId = win.webContents.id

  win.webContents.once('did-finish-load', () => {
    try {
      instances.set(webContentsId, {
        window: win,
        process: createTerminalProcess(cwd, data => sendTerminalData(win, data), () => closeAfterExit(win)),
      })
    } catch (err) {
      console.error('[TerminalPaneManager] Failed to spawn terminal process:', err)
      win.close()
    }
  })

  win.on('closed', () => {
    const instance = instances.get(webContentsId)
    if (instance) {
      try {
        instance.process.kill()
      } catch {
        // Process might have already exited.
      }
      instances.delete(webContentsId)
    }
  })
}

/** Kill every standalone pane and embedded PTY before app.exit (quit path). */
export function destroyAllTerminalPanes(): void {
  for (const [id, instance] of [...instances.entries()]) {
    try {
      instance.process.kill()
    } catch {
      // Already exited.
    }
    try {
      if (!instance.window.isDestroyed()) instance.window.destroy()
    } catch {
      // Window may already be gone.
    }
    instances.delete(id)
  }

  for (const [id, instance] of [...embeddedInstances.entries()]) {
    try {
      instance.process.kill()
    } catch {
      // Already exited.
    }
    embeddedInstances.delete(id)
  }
}
