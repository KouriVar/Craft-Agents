# Panel Edge Inset QA

- Source visual truth:
  - `/var/folders/sp/f2l8jmkx1bx_d4j8msxvlfpc0000gn/T/codex-clipboard-b2531a7f-ed7d-453e-81ec-5164d31b0fdd.png`
  - `/var/folders/sp/f2l8jmkx1bx_d4j8msxvlfpc0000gn/T/codex-clipboard-85122bc4-4f31-4f63-9593-c3fddc3f5d2e.png`
- Source pixels: macOS `2864 x 1867`; Windows crop `2998 x 196`
- Implementation screenshot: unavailable
- CSS viewport and density: not recoverable from the supplied screenshots
- State: desktop shell; normal, collapsed sidebars, focus mode, and browser tab navigator

## Full-view comparison evidence

The supplied macOS screenshot shows the left and top clearances larger than the
right and bottom clearances. The Windows crop shows the first panel touching the
expanded top bar. A same-state implementation capture could not be produced
because the installed Craft Agents instance owns the single local server lock,
and this macOS host cannot run the Windows window-material branch.

## Focused region evidence

The relevant regions are the four outer panel edges and the expanded/collapsed
top-bar boundary. Source inspection found two independent offsets on the left
edge (`AppShell` plus `PanelStackContainer`) and no desktop gap below the
expanded fixed top bar.

## Findings and fixes

- P1 fixed: collapsed sidebars added a second left inset. The panel stack no
  longer owns an outer-edge inset.
- P1 fixed: expanded Windows top bar had no gap before the panel surface. The
  desktop top-bar inset now includes the shared `6px` edge gap.
- P1 fixed: focus mode used a separate `8px` reveal strip. Its collapsed inset
  and transform now use the same `6px` edge token.
- P2 fixed: right-sidebar width budgeting counted only one horizontal edge.
  It now reserves both left and right insets.
- Compact layout remains flush and keeps its existing top-bar sizing.

## Comparison history

1. Initial evidence: left/top spacing was larger on macOS; Windows panel touched
   the top bar.
2. First implementation: outer top padding exposed a focus-mode double offset.
3. Revised implementation: vertical spacing moved into the fixed top-bar inset;
   the panel stack's duplicate left inset was removed.
4. Post-fix code evidence: regression tests assert shared desktop edge tokens,
   expanded/collapsed top-bar offsets, and absence of the duplicate left inset.

## Verification

- TypeScript typecheck: passed
- Renderer production build: passed
- Focused app-shell and native-overlay tests: `57 passed`, `0 failed`
- Targeted ESLint: `0 errors` (existing warnings remain)
- Same-state macOS implementation screenshot: blocked by active single-instance server
- Windows implementation screenshot: blocked because no Windows runtime is available

final result: blocked

---

# Settings Navigation QA

- Source visual truth:
  - `/var/folders/sp/f2l8jmkx1bx_d4j8msxvlfpc0000gn/T/codex-clipboard-86afbd42-abc5-478f-8a18-b5af042324d3.png`
  - `/var/folders/sp/f2l8jmkx1bx_d4j8msxvlfpc0000gn/T/codex-clipboard-21ac16ca-94d6-485a-a2b1-efdfcd102ec7.png`
  - `/var/folders/sp/f2l8jmkx1bx_d4j8msxvlfpc0000gn/T/codex-clipboard-56bc1bf2-2670-46d5-9772-5aa9e2a75207.png`
- Expanded implementation: `design-qa-interface-settings.png`
- Collapsed implementation: `design-qa-settings-list-collapsed.png`
- State: macOS desktop, dark theme, settings/interface.

## Full-view comparison evidence

The page-level subtitle is absent. The horizontal section navigator now hugs its
content, has a rounded bordered surface, and aligns its selected label with the
settings content below. The settings navigator keeps its original width and row
styling.

## Focused region evidence

The selected settings page expands in place to reveal its page sections. Nested
items reuse the application sidebar's indentation, vertical guide, hover
chevron, and animated expand/collapse behavior. Selecting another settings page
opens that page's own sections; nested section clicks update the route hash and
scroll to the corresponding content.

## Verification

- Expanded and collapsed states captured from the running Electron development app
- Nested `settings/interface#shortcuts` navigation verified in the running app
- TypeScript typecheck: passed
- Targeted ESLint: 0 errors (existing hook warnings remain)
- Whitespace validation: passed

final result: passed
