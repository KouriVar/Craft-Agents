**Design QA — Explore Ask AI launcher reset**

- source visual truth path: `/var/folders/sp/f2l8jmkx1bx_d4j8msxvlfpc0000gn/T/codex-clipboard-eb51b548-0589-4506-9f2b-9b85a356aec6.png`
- implementation screenshot path: `/Users/halfsignal/开发/代码/CraftAgent/artifacts/design-qa/ask-ai-reset-implementation.jpeg`
- URL-navigation screenshot path: `/Users/halfsignal/开发/代码/CraftAgent/artifacts/design-qa/url-navigation-implementation.jpeg`
- combined comparison path: `/Users/halfsignal/开发/代码/CraftAgent/artifacts/design-qa/ask-ai-stuck-vs-reset.jpeg`
- viewport: 1195 × 768, macOS dark theme
- state: returned to the same browser tab after two consecutive Ask AI submissions

**Full-view comparison evidence**

The source shows the reusable new-tab launcher stuck with the previous prompt and a permanent `正在思考…` indicator after navigation to ChatPage. The rebuilt implementation returns to the same browser tab with an empty smart input, no loading indicator, no stale error, and the unified Explore/session navigator intact.

**Focused region comparison evidence**

The combined image keeps the complete smart-input region and navigator visible. The critical differences—cleared prompt, absent spinner, localized `标签页`, and unchanged tab/session structure—are readable without an additional crop.

**Findings**

- [Resolved P1] Successful Ask AI navigation left `submitting=true`, permanently blocking the reusable launcher.
  - Fix: reset input, intent override, error, and submitting state only after the existing ChatPage navigation succeeds.
- [Resolved P2] The earlier package rendered `OPEN TABS` in a Chinese interface.
  - Fix: reuse the existing localized `browser.tabs` copy (`标签页`).
- Fonts and typography: the existing CraftAgent font stack, weights, truncation, and hierarchy are unchanged.
- Spacing and layout rhythm: the smart input and unified navigator retain their existing frame, padding, row density, and alignment.
- Colors and visual tokens: existing background, foreground, border, loading, selected, and muted tokens remain unchanged.
- Image quality and asset fidelity: existing Lucide UI icons and live favicons are retained; no replacement assets were introduced.
- Copy and content: the reset state displays the existing localized placeholder and no stale prompt or progress copy.

**Primary interactions tested**

- Ask AI submission 1 created a real session and navigated to the existing ChatPage.
- Returning to the same browser tab showed an empty input with no `正在思考…` state.
- Ask AI submission 2 created a second real session without stalling.
- Returning again produced the same clean initialized launcher.
- Entering `example.com` selected `打开网页` and navigated the current browser tab to Example Domain, confirming URL work still owns the tab.
- Failure-path unit tests confirm that session creation/open failures do not clear the prompt or falsely mark the launcher as successful.

**Comparison history**

1. User capture identified the persistent loading state after returning from Ask AI (P1).
2. The success lifecycle was moved behind an explicit session-open coordinator and covered with success and recovery tests.
3. The formal macOS package was rebuilt, then the two-question return flow and URL-navigation flow were repeated in the packaged App.
4. The post-fix screenshot shows the launcher reset after the second return; no P0/P1/P2 issue remains.

final result: passed

---

# Previous Design QA — Session usage information

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
