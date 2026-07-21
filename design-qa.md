## Browser new-page naming and address search — 2026-07-21

- Source visual truth: `/var/folders/sp/f2l8jmkx1bx_d4j8msxvlfpc0000gn/T/codex-clipboard-5d27d386-e28c-4007-afbd-92699e462196.png`
- Implementation screenshot: `/Users/halfsignal/开发/代码/CraftAgent/artifacts/design-qa/browser-new-tab-search.png`
- Combined comparison: `/Users/halfsignal/开发/代码/CraftAgent/artifacts/design-qa/browser-new-tab-comparison.png`
- Implementation surface: `http://127.0.0.1:5189/browser-empty-state.html`
- Viewport: 1280 × 720 browser capture
- State: dark/system theme, blank browser tab, fixed search/address mode

### Full-view and focused comparison evidence

The supplied full-shell reference and the rendered new-tab surface were compared side by side. The page keeps the existing centered, single-line address field and removes the old three-mode menu entirely. The focused control remains visually aligned with the product's border, radius, muted icon, and foreground/background tokens.

### Required fidelity surfaces

- Fonts and typography: the existing input font size, weight, and muted placeholder treatment are preserved.
- Spacing and layout rhythm: the single field retains the established centered width, 56 px height, internal padding, and compact icon spacing.
- Colors and visual tokens: existing background, foreground, border, muted-foreground, and focus tokens are reused in light and dark themes.
- Image quality and assets: the existing Lucide search and submit icons are reused; no bitmap asset or ad-hoc style was introduced.
- Copy and content: browser creation is now “新建网页”; an empty item is “新标签页” with no subtitle; a loaded item uses the full current URL as its subtitle.

### Primary interactions and validation

- Plain text submission resolves to Google Search; verified `Craft Agent` produced `https://www.google.com/search?q=Craft%20Agent`.
- Host/path submission remains direct; verified `example.com/docs` reached the browser navigation bridge unchanged, where the existing browser manager normalizes it to HTTPS.
- The blank-page control exposes exactly one textbox and one submit button, with no mode selector.
- Session-mode creation copy and behavior remain on the existing session branch.
- Browser utility tests: 18 passed. Renderer production build, i18n parity, i18n sorting, i18n coverage, and whitespace validation passed.

### Findings and comparison history

- [Resolved P1] One translation key previously represented both the create action and the empty tab title, preventing the two labels from differing.
- [Resolved P1] The blank browser page still exposed the legacy Open/Search/Ask AI mode switch instead of a predictable address/search field.
- [Resolved P2] Empty tabs repeated their title as a subtitle, while loaded tabs reduced the subtitle to a hostname instead of the requested current address.
- Post-fix evidence shows no remaining actionable P0/P1/P2 issue in the changed browser-new-page flow.

final result: passed

---

## Finder folder drag and visible staging — 2026-07-21

- Source visual truth: `/var/folders/sp/f2l8jmkx1bx_d4j8msxvlfpc0000gn/T/codex-clipboard-708b770f-416b-4e36-8db1-c6085550e134.png`
- Implementation screenshot: `/Users/halfsignal/开发/代码/CraftAgent/artifacts/design-qa/folder-drag-preview.png`
- Combined comparison: `/Users/halfsignal/开发/代码/CraftAgent/artifacts/design-qa/folder-drag-comparison.png`
- Implementation surface: `http://127.0.0.1:5189/playground.html` → Chat → AttachmentPreview
- Viewport: 1280 × 720 browser capture
- State: dark/system theme, mixed image + PDF + folder preview

### Full-view and focused comparison evidence

The supplied composer screenshot and the rendered mixed-attachment state were placed in one comparison image. Both use the same existing 64 px attachment row, compact media tile, two-line name/type hierarchy, semantic purple folder icon, and horizontal preview strip. A separate focused crop was unnecessary because the attachment cards remain legible in the combined 1200 px comparison.

### Required fidelity surfaces

- Fonts and typography: existing attachment filename and metadata sizes, weights, wrapping, and truncation are unchanged.
- Spacing and layout rhythm: folder and file cards share the same height, gap, padding, radius, shadow, and preview-row alignment.
- Colors and visual tokens: existing foreground, muted, border, background, shadow, and accent tokens are reused.
- Image quality and assets: existing image/PDF rendering remains unchanged; the folder uses the existing Lucide icon rather than a new asset.
- Copy and content: the card shows the folder basename plus the localized folder type while retaining the absolute path for submission and tooltip context.

### Primary interactions and validation

- Finder directory entries are now classified before `FileReader`; directories become folder context cards immediately while regular files continue through the binary attachment reader.
- Manual selection and Finder drag share the same attachment factory and deduplication path.
- The first user attachment change now synchronizes to parent draft state instead of being mistaken for initial hydration.
- Removed the folder card in the rendered preview and verified it disappeared; browser console errors: none.
- Folder staging/submission tests: 7 passed. Renderer production build: passed.
- Full TypeScript check remains blocked by pre-existing Zod/Tiptap duplicate dependency errors outside the changed files.

### Findings and comparison history

- [Resolved P1] Dropped directories were sent to `FileReader` as if they were files, so Finder folder drops could never stage successfully.
- [Resolved P1] The first manual folder change was skipped by draft synchronization, allowing the visible card to disappear after a remount or parent refresh.
- Post-fix evidence shows no remaining actionable P0/P1/P2 visual issue.

final result: passed

---

## Flat settings navigator — 2026-07-21

- Source visual truth: `/var/folders/sp/f2l8jmkx1bx_d4j8msxvlfpc0000gn/T/codex-clipboard-e8e8685f-d984-4972-bbaa-1c9690eab971.png`
- Implementation surface: `http://127.0.0.1:5189/playground.html` → Settings → Settings Navigator
- Viewport: 1280 × 720 browser capture; component state is 800 × 600
- State: dark/system theme, Appearance selected, then Workspace selected for interaction verification

### Comparison evidence

The source and implementation were placed side by side in one comparison image. The implementation now matches the reference information architecture: muted group labels, compact icon-and-label rows, one rounded selected state, and no nested parent card or vertical child guide. CraftAgent's existing semantic colors, icon set, typography, and 10 px selection radius are retained instead of copying Codex's palette.

### Function and preservation checks

- All permanent settings pages remain available in the flat list; contextual Explore and Shortcuts routes remain registered at their contextual entry points.
- Settings are grouped into Application, Work, Connections, and System without adding another navigation level.
- The existing per-page “Open in new window” action remains available on row hover.
- Clicked Workspace in the rendered preview and verified the single selected state moved from Appearance.
- Renderer production build, i18n parity, i18n sorting, and whitespace validation passed.

### Findings

- [Resolved P2] The former navigator displayed a selected category card around a second indented selected row, producing two competing selection states and excessive sidebar density.
- No remaining actionable P0/P1/P2 visual issue.

final result: passed

---

## Contextual shortcuts and settings navigation — 2026-07-21

- Source visual truth: `/var/folders/sp/f2l8jmkx1bx_d4j8msxvlfpc0000gn/T/codex-clipboard-02ee6f54-43de-4f87-9352-ad0bb30ae20b.png`
- Implementation screenshot: `/Users/halfsignal/开发/代码/CraftAgent/artifacts/design-qa/settings-shortcut-panel-final.png`
- Combined comparison: `/Users/halfsignal/开发/代码/CraftAgent/artifacts/design-qa/settings-shortcut-comparison-final.png`
- Viewport: 1280 × 720 browser capture; component state is 800 × 600
- State: light/system theme, session header controls visible, shortcuts review panel open

### Full-view comparison evidence

The reference establishes the compact session-header action cluster and right-side review panel pattern. The implementation keeps the existing 32 px header-control scale, border, radius, muted icon color, and spacing. The keyboard action appears immediately before Share, followed by Resources, the existing right-panel control, and Close.

### Focused-region comparison evidence

The shortcut content is the existing settings implementation embedded without duplication. It retains the product's section headings, bordered settings cards, compact keycaps, row separators, and scrolling behavior inside the 430 px review surface.

### Primary interactions and preservation checks

- The session keyboard action opens the review sidebar and selects a singleton Shortcuts tab.
- Repeated opens focus the existing tab instead of creating duplicates.
- Shortcuts remain available from the review panel add menu and empty state.
- The original `settings/shortcuts` route and component registry entry remain intact as a fallback.
- Explore preferences remain routable and now have a contextual gear next to Work Brief refresh.
- All 13 original settings page components remain registered; only permanent navigation visibility changed.

### Findings and validation

- [Resolved P1] The first playground capture lacked the action registry provider. Added the same provider used by the production shell and repeated the capture in a clean local preview.
- No remaining actionable P0/P1/P2 visual issue.
- Renderer production build: passed.
- Full TypeScript check remains blocked by pre-existing duplicate Sentry/Tiptap dependency types outside the changed files.

final result: passed

---

## Folder reference attachment — 2026-07-21

- Source visual truth: `/var/folders/sp/f2l8jmkx1bx_d4j8msxvlfpc0000gn/T/codex-clipboard-201e6040-0a9e-46f8-8cb4-ce6c87c15861.png`
- Component implementation screenshot: `/Users/halfsignal/开发/代码/CraftAgent/artifacts/design-qa/attachment-folder-preview.png`
- Composer implementation screenshot: `/Users/halfsignal/开发/代码/CraftAgent/artifacts/design-qa/folder-input-final.png`
- Viewports: 867 × 862 component comparison; 1280 × 720 full composer state
- State: light/system theme, image + PDF + folder component state and a selected-folder composer state

### Full-view comparison evidence

The folder reference uses the existing attachment row, 64 px card height, 8 px radius, minimal shadow, compact media tile, two-line metadata, and hover remove action visible in the supplied PDF reference. The full composer capture confirms that the new folder control fits beside the paperclip without displacing the model selector or send action.

### Focused-region comparison evidence

The source and implementation were inspected in the same comparison input. The folder card aligns with the neighboring PDF card in height, padding, type hierarchy, muted metadata, and media-tile treatment. The folder icon uses the existing Lucide/CraftAgent icon stack and semantic accent token.

### Required fidelity surfaces

- Fonts and typography: existing CraftAgent input and attachment typography is preserved; filename truncation and 10 px metadata match neighboring attachments.
- Spacing and layout rhythm: card dimensions, 8 px row gap, preview padding, toolbar density, radii, and shadow remain aligned with the existing attachment design.
- Colors and visual tokens: only existing background, foreground, muted, border, accent, and shadow tokens are used.
- Image quality and assets: existing image previews remain unchanged; folder and remove actions use the project icon library, with no generated or approximate assets.
- Copy and content: folder cards display the selected basename and localized “Folder” metadata; the full absolute path is available as the title and is sent as a folder mention.

### Primary interactions tested

- Opened the real InputContainer playground example and selected a folder through the mocked native-directory path.
- Verified the folder card appears and exposes an accessible `Remove CraftAgent` action.
- Removed the selected folder from the real composer and verified the card disappears.
- Added it again and confirmed the toolbar, model selector, and send action remained visible.
- Checked a fresh playground tab for console errors: none.
- Unit coverage verifies folder-only messages and mixed file/folder messages convert folders to `[folder:/absolute/path]` while regular files remain binary attachments.

### Findings and comparison history

- [Resolved P1] The playground initially white-screened because recently added label hooks had no mock API. Added fail-soft label mocks and repeated the capture in a clean tab.
- [Resolved P2] The first folder card had no accessible remove name. Added a localized attachment-specific aria label and verified it in the rendered DOM.
- Post-fix evidence shows no remaining actionable P0/P1/P2 issue.

final result: passed

---

# Explore Home — Navigator Selection QA

- Source visual truth: `/var/folders/sp/f2l8jmkx1bx_d4j8msxvlfpc0000gn/T/codex-clipboard-a5202b0f-411a-4892-9550-608cdc689acf.png`
- Target state: Explore home is visible while the session navigator remains available, with no session row carrying the selected background or accent rail.
- Interaction contract: selecting a session restores its normal selected state; returning to the bare Explore route suppresses only the visual selection and preserves the underlying session state.

## Validation

- Selection override path verified: the bare unified Explore route passes an explicit `null` selection override to `SessionList`; session-detail routes continue using the existing single-panel or multi-panel selection behavior.
- Electron renderer typecheck: passed.
- Standalone browser rendering is not a valid production capture for this state because the application shell requires the Electron bridge; packaged-app visual confirmation remains part of the handoff test.

## Findings

- P0: none.
- P1: none.
- P2: none in the state logic.

final result: logic passed; packaged visual confirmation pending

---

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

# Explore Home Simplification QA — 2026-07-21

- Source visual truth: `/var/folders/sp/f2l8jmkx1bx_d4j8msxvlfpc0000gn/T/codex-clipboard-15741e46-ade1-4422-be99-34ae117b34c6.png`
- Implementation screenshot: `/tmp/craftagent-explore-simplified-wide.png`
- Viewport: 1536 x 1200 browser capture; Explore component preview is 800 x 600
- State: light theme, empty input, populated AI summary, three recommendations
- Primary interactions tested: opened the input-action menu, switched from Search to Ask AI, entered a prompt, and verified the submit action became enabled
- Console checked: no errors; only the playground's expected missing-theme-API fallback warning

## Full-view comparison evidence

The annotated source asks to remove the three supporting workstream boxes, the recommendation heading/caption, and the recommendation icons. The rendered implementation removes all three while preserving the page's input → summary → recommendations hierarchy and existing CraftAgent surface treatment.

## Focused-region comparison evidence

The input region was inspected in both empty and populated states. Its leading control opens a three-option menu (Open, Search, Ask AI), visibly reflects the selected mode, and leaves enough width for the prompt. The trailing action is a compact circular accent control with clear enabled and disabled states.

## Required fidelity surfaces

- Fonts and typography: Existing app typography and optical hierarchy are unchanged; removing the recommendation subheading makes the page quieter without weakening row titles and descriptions.
- Spacing and layout rhythm: Removing the workstream grid and recommendation heading closes the intended excess vertical space. Summary metadata and recommendation rows remain evenly padded.
- Colors and visual tokens: The input, cards, borders, and text use existing semantic tokens; the new submit state uses the established accent and tinted-shadow tokens.
- Image quality and assets: No imagery is present or required. Standard interface icons use the project's existing icon library; recommendation decoration was removed as requested.
- Copy and content: The AI headline and recent-work summary remain. Hidden source/workstream details are no longer repeated visually, and recommendations appear without extra explanatory copy.

## Findings

No actionable P0, P1, or P2 mismatch remains.

## Comparison history

- Pass 1: The requested information and icon removals were visible in the rendered implementation. Wide and constrained preview widths preserved hierarchy and did not overflow, so no corrective visual loop was required.

## Follow-up polish

- P3: Recheck the accent button against the user's active custom theme in the packaged app; semantic tokens already provide the intended fallback.

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

---

# Explore Home Design QA

- Source visual truth: `/var/folders/sp/f2l8jmkx1bx_d4j8msxvlfpc0000gn/T/codex-clipboard-a968d5da-4c2a-4c69-828c-d82e7e408370.png`
- Implementation screenshot: `/tmp/craftagent-explore-home-redesign.png`
- Combined comparison: `/tmp/craftagent-explore-qa-comparison.png`
- Viewport: 1280 x 720 browser capture; Explore component preview is 800 x 600
- State: light theme, populated AI briefing, three recommendations
- Primary interactions tested: entering a URL enables the submit action; refreshing regenerates and restores the briefing
- Console errors checked: none

## Full-view comparison evidence

The source shows a search field followed by two overlapping recent-work lists. The implementation preserves the quiet CraftAgent visual language while establishing the requested three-part hierarchy: a prominent input, one synthesized work briefing, and a compact list of recommended next steps. Repetition and oversized session cards are removed.

## Focused-region comparison evidence

The full-view capture keeps the input, briefing card, model provenance, and recommendation rows readable at the captured scale, so a separate crop was not required. The central briefing uses the product's existing surface, border, radius, shadow, foreground, and muted-foreground tokens.

## Required fidelity surfaces

- Fonts and typography: Existing application font stack is preserved. Heading, section label, body, metadata, and recommendation hierarchy remain distinct without introducing display typography.
- Spacing and layout rhythm: Three sections use a consistent 36px vertical rhythm; internal card spacing follows existing compact surface patterns. The layout scrolls cleanly at the 800 x 600 preview size.
- Colors and visual tokens: Only existing semantic Tailwind tokens and CraftAgent radius/shadow tokens are used. Contrast remains appropriate in light theme and token usage supports dark themes.
- Image quality and assets: The screen contains no custom imagery. Icons come from the application's existing icon system; no placeholder, CSS-drawn, or generated assets were introduced.
- Copy and content: Labels describe work status and next actions directly. Model provenance explicitly says the default model was used.

## Findings

No actionable P0, P1, or P2 visual issues remain.

## Open questions

- The playground chrome is English while fixture content is Chinese; this is preview-only. The production screen follows the app's active locale.

## Comparison history

- Pass 1: The implementation removed the duplicated recent-work regions, established the requested three-part structure, and showed no P0/P1/P2 layout, token, typography, or content issues in the rendered comparison. No visual correction loop was required.

## Follow-up polish

- P3: Review the final density once the packaged app supplies longer real model output; server-side limits already cap headline, summary, thread, and recommendation lengths.

final result: passed
