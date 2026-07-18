# Design QA — Session usage information

## Sources

- Full information popover reference: `codex-clipboard-1e4c24db-e819-418a-80a1-f6766d543bb5.png`
- Context-usage content reference: `codex-clipboard-a7b36920-25c0-4cd7-9b09-d7ec545a33ba.png`
- Rendered implementation: Electron design-system playground, dark theme, 800 × 600 preview canvas, 360 px component width.

## Full-view comparison

- The new section sits after Sources, matching the requested location and the existing section rhythm.
- The section uses the existing CraftAgent dark surface, border, radius, muted-label, and purple-accent tokens instead of introducing a visually separate card style.
- Model identity and estimated cost form the primary row; context pressure and token details remain scannable below it.

## Focused comparison

- The reference's `18% used / 82% remaining / 47K of 258K` information is preserved in one compact line and reinforced by a progress bar.
- Input, output, cache-read, and cache-write tokens are separated so the cost estimate is auditable rather than presented as an unexplained number.
- DeepSeek displays the current official standard-pricing state and explicitly notes that there is no current peak/off-peak rate.
- Long pricing/disclaimer text wraps without clipping at 360 px; numeric values remain aligned and legible.

## Validation

- Dark-theme visual review: passed.
- 360 px width overflow and wrapping review: passed.
- Browser console errors: none.
- Localization key parity and sorting: passed.
- Electron renderer typecheck and production build: passed.
- Session usage unit tests: passed.

## Findings history

- P0: none.
- P1: none.
- P2: none after final focused comparison.

final result: passed
