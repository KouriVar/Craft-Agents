import * as React from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { cn } from '@/lib/utils'
import { useTheme } from '@/context/ThemeContext'

interface EmbeddedTerminalProps {
  cwd?: string
  className?: string
}

export function EmbeddedTerminal({ cwd, className }: EmbeddedTerminalProps) {
  const { isDark } = useTheme()
  const containerRef = React.useRef<HTMLDivElement>(null)
  const terminalRef = React.useRef<XTerm | null>(null)
  const fitAddonRef = React.useRef<FitAddon | null>(null)
  const terminalIdRef = React.useRef<string | null>(null)
  const pendingInputRef = React.useRef<string[]>([])

  const terminalTheme = React.useMemo(() => ({
    background: isDark ? '#1b1b1b' : '#fbfbfc',
    foreground: isDark ? '#e4e4e7' : '#18181b',
    cursor: isDark ? '#f4f4f5' : '#18181b',
    selectionBackground: isDark ? '#52525b66' : '#a1a1aa66',
    black: isDark ? '#18181b' : '#18181b',
    red: '#dc2626',
    green: '#16a34a',
    yellow: isDark ? '#facc15' : '#a16207',
    blue: '#2563eb',
    magenta: '#9333ea',
    cyan: '#0891b2',
    white: isDark ? '#e4e4e7' : '#3f3f46',
    brightBlack: isDark ? '#71717a' : '#52525b',
    brightRed: '#ef4444',
    brightGreen: '#22c55e',
    brightYellow: isDark ? '#fde047' : '#854d0e',
    brightBlue: '#3b82f6',
    brightMagenta: '#a855f7',
    brightCyan: '#06b6d4',
    brightWhite: isDark ? '#fafafa' : '#18181b',
  }), [isDark])

  React.useEffect(() => {
    const container = containerRef.current
    if (!container || !cwd) return

    let disposed = false
    const terminal = new XTerm({
      cursorBlink: true,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontSize: 13,
      lineHeight: 1.25,
      convertEol: true,
      theme: terminalTheme,
    })
    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    terminal.open(container)
    terminalRef.current = terminal
    fitAddonRef.current = fitAddon

    const fitAndResize = () => {
      if (disposed || !terminalIdRef.current) return
      fitAddon.fit()
      window.electronAPI.resizeEmbeddedTerminal(terminalIdRef.current, terminal.cols, terminal.rows)
    }

    const dataDisposable = terminal.onData((data) => {
      if (terminalIdRef.current) {
        window.electronAPI.writeEmbeddedTerminal(terminalIdRef.current, data)
      } else {
        pendingInputRef.current.push(data)
      }
    })

    const unsubscribeData = window.electronAPI.onEmbeddedTerminalData((event) => {
      if (event.id === terminalIdRef.current) {
        terminal.write(event.data)
      }
    })
    const unsubscribeExit = window.electronAPI.onEmbeddedTerminalExit((event) => {
      if (event.id === terminalIdRef.current) {
        terminal.write('\r\n[process exited]\r\n')
      }
    })

    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(fitAndResize)
    })
    resizeObserver.observe(container)

    window.electronAPI.createEmbeddedTerminal(cwd).then((id) => {
      if (disposed) {
        window.electronAPI.closeEmbeddedTerminal(id)
        return
      }
      terminalIdRef.current = id
      for (const data of pendingInputRef.current) {
        window.electronAPI.writeEmbeddedTerminal(id, data)
      }
      pendingInputRef.current = []
      requestAnimationFrame(() => {
        fitAndResize()
        terminal.focus()
      })
    }).catch((error) => {
      terminal.write(`Failed to start terminal: ${error instanceof Error ? error.message : String(error)}\r\n`)
    })

    return () => {
      disposed = true
      resizeObserver.disconnect()
      dataDisposable.dispose()
      unsubscribeData()
      unsubscribeExit()
      if (terminalIdRef.current) {
        window.electronAPI.closeEmbeddedTerminal(terminalIdRef.current)
      }
      pendingInputRef.current = []
      terminalIdRef.current = null
      terminal.dispose()
      terminalRef.current = null
      fitAddonRef.current = null
    }
  }, [cwd, terminalTheme])

  if (!cwd) {
    return (
      <div className={cn('flex h-full items-center justify-center text-xs text-muted-foreground', className)}>
        No workspace folder
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onMouseDown={() => terminalRef.current?.focus()}
      className={cn(
        'h-full min-h-0 overflow-hidden p-2 focus:outline-none',
        isDark ? 'bg-[#1b1b1b]' : 'bg-[#fbfbfc]',
        className,
      )}
    />
  )
}
