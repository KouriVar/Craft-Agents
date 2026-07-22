import { getDismissibleLayerBridge } from './dismissible-layer-bridge'
import type { BrowserNativeViewPauseReason } from '@/atoms/browser-workspace'

/**
 * Overlay Detection Utilities
 *
 * Detects whether any overlay (dialog, drawer, menu, popover, etc.) is currently open.
 * Used to prevent escape key from triggering chat interrupt when overlays should handle it.
 */

/**
 * CSS selectors for overlay content elements.
 * These are the actual visible content elements, not the portals or roots.
 * Uses data-slot attributes from our UI components (shadcn/radix pattern).
 */
const OVERLAY_SELECTORS = [
  // Dialogs (modals)
  '[data-slot="dialog-content"]',
  '[role="dialog"]',
  '[role="alertdialog"]',

  // Drawers (slide-in panels)
  '[data-slot="drawer-content"]',

  // Dropdown menus
  '[data-slot="dropdown-menu-content"]',

  // Context menus (right-click)
  '[data-slot="context-menu-content"]',

  // Popovers
  '[data-slot="popover-content"]',

  // Select dropdowns
  '[data-slot="select-content"]',

  // Command palette (when open inside a dialog, the dialog selector catches it)
  // But standalone command menus would need: '[data-slot="command"]'

  // Inline menus (@mention, /slash, #label autocomplete)
  '[data-inline-menu]',

  // Dialog-mode islands (from @craft-agent/ui Island primitive)
  '[data-ca-island-dialog="true"][data-state="open"]',
]

const NATIVE_VIEW_PAUSE_SELECTORS: ReadonlyArray<readonly [BrowserNativeViewPauseReason, string]> = [
  ['dialog', '[data-slot="dialog-content"], [role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]'],
  ['drawer', '[data-slot="drawer-content"][data-state="open"], [data-vaul-drawer][data-state="open"]'],
  [
    'menu',
    '[data-slot="dropdown-menu-content"][data-state="open"]:not([data-native-view-passthrough="true"]), [data-slot="context-menu-content"][data-state="open"]:not([data-native-view-passthrough="true"]), [role="menu"][data-state="open"]:not([data-native-view-passthrough="true"])',
  ],
  [
    'popover',
    '[data-slot="popover-content"][data-state="open"], [data-radix-popper-content-wrapper] > [data-state="open"]:not([role="tooltip"]):not([role="menu"])',
  ],
  ['select', '[data-slot="select-content"][data-state="open"]'],
  ['inline-menu', '[data-inline-menu]'],
  ['island-dialog', '[data-ca-island-dialog="true"][data-state="open"]'],
]

/** Returns semantic pause owners; Tooltip is intentionally excluded. */
export function detectNativeViewPauseReasons(root: Pick<Document, 'querySelector'> = document): BrowserNativeViewPauseReason[] {
  const reasons: BrowserNativeViewPauseReason[] = []
  for (const [reason, selector] of NATIVE_VIEW_PAUSE_SELECTORS) {
    if (root.querySelector(selector)) reasons.push(reason)
  }
  return reasons
}

/**
 * Check if any overlay is currently open in the DOM.
 * Returns true if an overlay is detected, false otherwise.
 *
 * This is used by the Escape key handler to determine whether
 * the escape should trigger chat interrupt or be handled by the overlay.
 */
export function hasOpenOverlay(): boolean {
  const bridge = getDismissibleLayerBridge()
  if (bridge?.hasOpenLayers()) {
    return true
  }

  const selector = OVERLAY_SELECTORS.join(', ')
  return document.querySelector(selector) !== null
}
