/**
 * Notification Service
 *
 * Handles native OS notifications and app badge count.
 * - Shows notifications when new messages arrive (when app is not focused)
 * - Updates dock badge count with total unread messages
 * - Clicking notification navigates to the relevant session
 */

import { app, BrowserWindow, nativeImage } from 'electron'
import { join } from 'path'
import { readFileSync } from 'fs'
import { mainLog } from './logger'
import { RPC_CHANNELS } from '../shared/types'
import type { EventSink } from '@craft-agent/server-core/transport'

let eventSink: EventSink | null = null

/** Register the internal event sink used only for renderer-side badge drawing. */
export function setNotificationEventSink(sink: EventSink): void {
  eventSink = sink
}
let baseIconPath: string | null = null
let baseIconDataUrl: string | null = null
let currentBadgeCount: number = 0
let instanceNumber: number | null = null  // Multi-instance dev: instance number for dock badge


/**
 * Initialize the base icon for badge overlay
 * Call this during app startup
 */
export function initBadgeIcon(iconPath: string): void {
  try {
    baseIconPath = iconPath
    // Read and cache the icon as base64 data URL
    const iconBuffer = readFileSync(iconPath)
    baseIconDataUrl = `data:image/png;base64,${iconBuffer.toString('base64')}`
    mainLog.info('Badge icon initialized:', iconPath)
  } catch (error) {
    mainLog.error('Failed to initialize badge icon:', error)
  }
}

/**
 * Update the app badge count (cross-platform)
 *
 * - macOS: Uses a canvas-based approach to draw the badge directly onto the dock icon.
 * - Windows: Uses taskbar overlay icon for badge display.
 * - Linux: Uses app.setBadgeCount() where supported (Unity, KDE).
 *
 * @param count - Number to show on badge (0 to clear)
 */
export function updateBadgeCount(count: number): void {
  // Skip if count hasn't changed
  if (count === currentBadgeCount) {
    return
  }

  currentBadgeCount = count

  if (process.platform === 'darwin') {
    updateBadgeCountMacOS(count)
  } else if (process.platform === 'win32') {
    updateBadgeCountWindows(count)
  } else if (process.platform === 'linux') {
    updateBadgeCountLinux(count)
  }
}

/**
 * Update badge count on macOS using dock icon overlay
 */
function updateBadgeCountMacOS(count: number): void {
  try {
    if (count > 0) {
      // Draw badge onto icon using the renderer process (Canvas API)
      if (eventSink && baseIconDataUrl) {
        eventSink(RPC_CHANNELS.badge.DRAW, { to: 'all' }, { count, iconDataUrl: baseIconDataUrl })
      }
    } else {
      // Don't override dock icon when count is 0 — let macOS manage it so
      // the icon follows system dark/light appearance. setIcon with a fixed
      // image breaks dark mode (icon turns light at night).
    }
    mainLog.info('Badge count updated (macOS):', count)
  } catch (error) {
    mainLog.error('Failed to update badge count (macOS):', error)
  }
}

/**
 * Update badge count on Windows using taskbar overlay icon
 */
function updateBadgeCountWindows(count: number): void {
  try {
    if (count > 0) {
      // Draw overlay icon using the renderer process (Canvas API)
      if (eventSink) {
        eventSink(RPC_CHANNELS.badge.DRAW_WINDOWS, { to: 'all' }, { count })
      }
    } else {
      // Clear the overlay on all windows
      const windows = BrowserWindow.getAllWindows()
      for (const window of windows) {
        if (!window.isDestroyed()) {
          window.setOverlayIcon(null, '')
        }
      }
    }
    mainLog.info('Badge count updated (Windows):', count)
  } catch (error) {
    mainLog.error('Failed to update badge count (Windows):', error)
  }
}

/**
 * Update badge count on Linux using app.setBadgeCount (Unity/KDE)
 */
function updateBadgeCountLinux(count: number): void {
  try {
    // Electron's setBadgeCount works on Linux with Unity launcher and KDE
    app.setBadgeCount(count)
    mainLog.info('Badge count updated (Linux):', count)
  } catch (error) {
    mainLog.error('Failed to update badge count (Linux):', error)
  }
}

/**
 * Set the dock/taskbar icon with a pre-rendered badge image (cross-platform)
 * Called from IPC when renderer has drawn the badge
 */
export function setDockIconWithBadge(dataUrl: string): void {
  try {
    const icon = nativeImage.createFromDataURL(dataUrl)

    if (process.platform === 'darwin') {
      app.dock?.setIcon(icon)
      mainLog.info('Dock icon updated with badge (macOS)')
    } else if (process.platform === 'win32') {
      // On Windows, set the taskbar overlay icon
      const windows = BrowserWindow.getAllWindows()
      const window = windows[0]
      if (window && !window.isDestroyed()) {
        window.setOverlayIcon(icon, `${currentBadgeCount} notifications`)
        mainLog.info('Taskbar overlay updated with badge (Windows)')
      }
    }
  } catch (error) {
    mainLog.error('Failed to set dock/taskbar icon with badge:', error)
  }
}

/**
 * Clear the app dock badge
 */
export function clearBadgeCount(): void {
  updateBadgeCount(0)
}

/**
 * Check if any window is currently focused
 */
export function isAnyWindowFocused(): boolean {
  const focusedWindow = BrowserWindow.getFocusedWindow()
  return focusedWindow !== null && !focusedWindow.isDestroyed()
}

/**
 * Initialize instance badge for multi-instance development.
 *
 * When running from a numbered folder (e.g., craft-tui-agent-1), this shows
 * a permanent badge on the dock icon to distinguish between instances.
 * Uses macOS dock.setBadge() for text-based badge display.
 *
 * @param number - Instance number (1, 2, etc.) or null for default instance
 */
export function initInstanceBadge(number: number): void {
  if (process.platform !== 'darwin') {
    // Instance badge only supported on macOS for now
    return
  }

  instanceNumber = number

  try {
    // Use dock.setBadge() for simple text badge
    // This shows the number in a red badge on the dock icon
    app.dock?.setBadge(String(number))
    mainLog.info(`Instance badge set: ${number}`)
  } catch (error) {
    mainLog.error('Failed to set instance badge:', error)
  }
}
