import { spawn, type ChildProcess } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'

export type DoubleCommandShortcutStatus = 'unsupported' | 'starting' | 'ready' | 'accessibility-denied' | 'unavailable'

/** Native event bridge for double Command on macOS and double Alt on Windows. */
export class DoubleCommandShortcut {
  private process: ChildProcess | null = null
  private status: DoubleCommandShortcutStatus = isSupportedPlatform() ? 'starting' : 'unsupported'
  private lastTriggerAt = 0
  private stopping = false

  constructor(private readonly onTrigger: () => void, private readonly onStatus: (status: DoubleCommandShortcutStatus) => void) {}

  start(): void {
    if (this.process) return
    if (!isSupportedPlatform()) {
      this.onStatus('unsupported')
      return
    }
    const command = resolveListenerCommand()
    if (!command) {
      this.status = 'unavailable'
      this.onStatus(this.status)
      return
    }
    this.stopping = false
    this.process = spawn(command.executable, command.args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    this.process.stdout?.setEncoding('utf8')
    this.process.stdout?.on('data', (chunk: string) => {
      for (const line of chunk.split(/\r?\n/)) {
        if (line === 'TRIGGER') {
          const now = Date.now()
          if (now - this.lastTriggerAt < 900) continue
          this.lastTriggerAt = now
          this.onTrigger()
        }
        else if (line === 'STATUS ready') { this.status = 'ready'; this.onStatus(this.status) }
        else if (line === 'STATUS accessibility-denied') { this.status = 'accessibility-denied'; this.onStatus(this.status) }
        else if (line.startsWith('STATUS')) { this.status = 'unavailable'; this.onStatus(this.status) }
      }
    })
    this.process.once('error', () => { this.status = 'unavailable'; this.onStatus(this.status) })
    this.process.once('exit', () => {
      this.process = null
      if (!this.stopping && this.status !== 'accessibility-denied') {
        this.status = 'unavailable'
        this.onStatus(this.status)
      }
    })
  }

  getStatus(): DoubleCommandShortcutStatus {
    return this.status
  }

  stop(): void {
    this.stopping = true
    this.process?.kill()
    this.process = null
    this.status = isSupportedPlatform() ? 'starting' : 'unsupported'
  }
}

function isSupportedPlatform(): boolean {
  return process.platform === 'darwin' || process.platform === 'win32'
}

function resolveListenerCommand(): { executable: string; args: string[] } | null {
  if (process.platform === 'darwin') {
    const executable = [
      join(__dirname, 'resources', 'native', 'double-command-listener'),
      join(process.resourcesPath, 'app', 'dist', 'resources', 'native', 'double-command-listener'),
      join(process.resourcesPath, 'native', 'double-command-listener'),
    ].find(candidate => existsSync(candidate))
    return executable ? { executable, args: [] } : null
  }

  if (process.platform === 'win32') {
    const script = [
      join(__dirname, 'resources', 'native', 'double-alt-listener.ps1'),
      join(process.resourcesPath, 'app', 'dist', 'resources', 'native', 'double-alt-listener.ps1'),
      join(process.resourcesPath, 'native', 'double-alt-listener.ps1'),
    ].find(candidate => existsSync(candidate))
    return script
      ? { executable: 'powershell.exe', args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script] }
      : null
  }

  return null
}
