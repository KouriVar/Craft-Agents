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

---

# Sidebar Reopen and Native Context Menu QA

- Failure capture: `/var/folders/sp/f2l8jmkx1bx_d4j8msxvlfpc0000gn/T/codex-clipboard-d4f0cbdc-ce35-47c5-b614-c91fad72ba99.png`
- State: macOS desktop development runtime, primary rail open/closed, session mode and browser mode.

## Findings and fixes

1. **P0 fixed — the sidebar control could collapse the rail but its visible closed-state hit target remained inside the draggable title-bar hierarchy.** The control is now an independent fixed, non-draggable button above the title-bar drag surface; the in-flow toolbar keeps an equal spacer so back/forward alignment does not move.
2. **P0 fixed — the recent-session context menu mixed a Radix context-menu root with dropdown-menu children.** Opening nested items could throw during render and route the whole window to the error boundary. Session rows now describe their actions to one Electron native-menu bridge instead of mounting a React overlay.
3. **P1 fixed — browser rows used the same overlay-based right-click path.** Browser tab and bookmark rows now use the same native bridge, with their existing reload/open/copy/close callbacks preserved.
4. **P1 fixed — the development-only global Inspect Element menu intercepted every renderer right click.** That catch-all handler is removed so feature-owned native menus are the only menus opened over session and browser rows.

## Interaction and runtime verification

- Sidebar control: passed consecutive `open → closed → open` activation in the running Electron window; accessibility state changed `Value: 1 → 0 → 1`.
- Session and browser rows: React/Radix context-menu wrappers removed; native menu payloads and existing action callbacks are covered by source-contract tests.
- Renderer error boundary: no longer reachable through the removed mixed-menu composition.
- Targeted tests: `40` passed, `0` failed.
- Electron TypeScript typecheck: passed.
- Diff whitespace validation: passed.
- Development runtime rebuilt and relaunched at `http://localhost:5173/`; no package build required.

final result: passed

---

# Release Sidebar and Conversation Controls QA

- Codex typography and sidebar reference: `/var/folders/sp/f2l8jmkx1bx_d4j8msxvlfpc0000gn/T/codex-clipboard-104d9001-d451-4753-a234-f8b4034e61fd.png`
- CraftAgent annotated request: `/var/folders/sp/f2l8jmkx1bx_d4j8msxvlfpc0000gn/T/codex-clipboard-97db22d2-01e5-4154-9dc0-f1f446d2dd83.png`
- Implementation capture: `/var/folders/sp/f2l8jmkx1bx_d4j8msxvlfpc0000gn/T/com.openai.sky.CUAService/Electron Screenshot 2026-08-02 at 3.41.45 PM.jpeg`
- Combined comparison: `/tmp/craftagent-release-sidebar-comparison.jpg`
- State: macOS desktop, populated project and session navigation, selected session, conversation toolbar visible.

## Findings and fixes

1. **P1 fixed — Back and Forward could be left with duplicate history destinations.** Semantic navigation is now pushed before layout-only URL replacement; the real Electron window returned from a session to a browser route and then moved forward to the same session successfully.
2. **P1 fixed — the primary sidebar toggle could sit below later panel surfaces.** The persistent top control layer is now above panel chrome; real-window collapse and expansion both passed.
3. **P1 fixed — Dynamic remained exposed after the product direction removed it.** The sidebar entry and dynamic main/list surfaces are removed from the app shell, and legacy Dynamic routes redirect to sessions.
4. **P1 fixed — project management required separate More and Add controls.** Those header controls are removed; clicking the Projects section title opens the existing All Projects page. Project-row session creation remains available.
5. **P2 fixed — sidebar icon and type weights varied between rows and states.** Primary glyphs now use the default Lucide stroke, and navigation, project, and session labels share a medium weight without selected-row over-boldening.
6. **P2 fixed — Continue Work used a separate gray button treatment.** It now renders through the same `MetadataBadge` component as Current Session, including the split-chevron menu behavior.
7. **P2 fixed — Help visually occupied the workspace switcher's hit area.** Workspace/function selection and Help are separate sibling buttons with a shared footer rhythm.

## Required fidelity surfaces

- Fonts and typography: passed; hierarchy is medium-weight and stable across selected and unselected rows.
- Icons: passed; default library strokes are retained rather than custom thick/thin variants.
- Spacing and layout rhythm: passed; footer controls, sidebar rows, and top navigation use the established CraftAgent tokens.
- Colors and components: passed; conversation metadata controls reuse the same component and active-surface tokens.
- Copy and content: passed; only the deprecated Dynamic surface was removed.

## Interaction and runtime verification

- Real Electron sidebar collapse and expansion: passed.
- Real Electron Back and Forward across distinct session/browser routes: passed.
- Real Electron Projects-title navigation to `route=projects` and visible `所有项目`: passed.
- Dynamic entry absence and conversation control presence in accessibility tree: passed.
- Targeted tests: `51` passed, `0` failed.
- Electron TypeScript typecheck: passed.
- Renderer production build: passed; existing large-chunk warning remains.
- Diff whitespace validation: passed.

final result: passed

---

# Project Navigation Migration QA

- Source annotation: `/var/folders/sp/f2l8jmkx1bx_d4j8msxvlfpc0000gn/T/codex-clipboard-e71ea22e-fc71-48b4-b722-8e720db9e4a8.png`
- Implementation capture: `/var/folders/sp/f2l8jmkx1bx_d4j8msxvlfpc0000gn/T/com.openai.sky.CUAService/Electron Screenshot 2026-08-02 at 2.42.25 PM.jpeg`
- Combined comparison: `/private/tmp/craftagent-project-navigation-migration-comparison.jpg`
- State: macOS desktop, populated session navigation, projects overview in the main content region.

## Findings and fixes

1. **P1 fixed — project navigation was duplicated between the primary navigation and the project section.** The top-level project entry is removed; project navigation now lives only in the project section.
2. **P1 fixed — the project section had no compact path to the full project index.** A More action now sits immediately left of Add and opens the existing `All projects` view in the main content region.
3. **P1 preserved — the Add action remains available beside More.** It continues to open the existing project-creation entry without changing project rows or session nesting.
4. The project section remains visible when it has no rows, so More and Add do not disappear in an empty workspace.

## Required fidelity surfaces

- Fonts and typography: unchanged.
- Spacing and hierarchy: passed. More and Add are grouped with the project section label, while project rows retain the established CraftAgent rail axes.
- Colors, icons, selection surfaces, and copy: use the existing CraftAgent design tokens.
- Main-content project list: reuses the existing project list rather than introducing a second presentation.

## Interaction and runtime verification

- Top primary navigation has no project item: passed.
- Project-section More opens route `projects` and renders `All projects` in the main region: passed.
- Project-section Add opens the existing creation entry: passed.
- Targeted sidebar and panel tests: `22` passed, `0` failed.
- Shared and Electron TypeScript typechecks: passed.
- Renderer production build: passed; existing large-chunk warning remains.
- Diff whitespace validation: passed.

final result: passed

---

# Sidebar Stoplight Alignment QA

- Codex reference: `/var/folders/sp/f2l8jmkx1bx_d4j8msxvlfpc0000gn/T/codex-clipboard-59024c67-9f16-46c7-bfef-36f6d46d8233.png`
- CraftAgent source capture: `/var/folders/sp/f2l8jmkx1bx_d4j8msxvlfpc0000gn/T/codex-clipboard-2c59c723-1a81-44fa-9774-35ba78576b9b.png`
- Implementation capture: `/var/folders/sp/f2l8jmkx1bx_d4j8msxvlfpc0000gn/T/com.openai.sky.CUAService/Electron Screenshot 2026-08-02 at 10.02.47 AM.jpeg`
- Combined comparison: `/private/tmp/craftagent-sidebar-stoplight-alignment-comparison.jpg`
- Source pixels: Codex `494 x 1617`; implementation `1193 x 768`; comparison crop `468 x 768`.
- State: macOS desktop, session navigation mode, primary rail open.

## Findings and fixes

1. **P1 fixed — primary navigation glyphs sat about 6–7 CSS pixels to the right of the red macOS window control.** The Codex-specific navigation override added `12px` of left padding on top of the shared rail inset. It now uses `6px`, placing the glyph centers on the traffic-light axis without moving row labels or selection surfaces.
2. **P1 fixed — project and bookmark folder glyphs used a separate, approximately 4px-right axis.** Their symmetric `10px` padding is now split into `6px` left and `10px` right padding, matching the primary navigation glyph axis while preserving the right-side count and add controls.
3. The workspace avatar, help control, section labels, plain session titles, mode switcher, and outer panel geometry were already correctly placed and were intentionally left unchanged.

## Required fidelity surfaces

- Fonts and typography: unchanged.
- Spacing and layout rhythm: passed. The red window control, primary navigation glyphs, project glyphs, and footer avatar now form one stable vertical axis.
- Colors and visual tokens: unchanged; CraftAgent's visual language remains intact.
- Image quality and asset fidelity: unchanged; the existing icon set is retained.
- Copy and content: unchanged.

## Interaction and runtime verification

- Combined Codex/reference and CraftAgent/implementation visual comparison: passed.
- Primary navigation selection surface and click targets: preserved.
- Sessions mode project glyph alignment: passed.
- Browser mode bookmark glyph alignment and mode round-trip: passed.
- Targeted sidebar and panel tests: `21` passed, `0` failed.
- Electron TypeScript typecheck: passed.
- Renderer production build: passed; existing large-chunk warning remains.
- Diff whitespace validation: passed.

final result: passed

---

# Session Environment Popover QA

- Source visual truth:
  - `/var/folders/sp/f2l8jmkx1bx_d4j8msxvlfpc0000gn/T/codex-clipboard-0b4209c7-c102-4f20-93b8-22a68460cd07.png`
  - `/var/folders/sp/f2l8jmkx1bx_d4j8msxvlfpc0000gn/T/codex-clipboard-3f938a6a-313f-4c2d-81d4-c00ba7a1a706.png`
  - `/var/folders/sp/f2l8jmkx1bx_d4j8msxvlfpc0000gn/T/codex-clipboard-56d8cd55-49b4-49de-9232-2a766bda52c1.png`
  - `/var/folders/sp/f2l8jmkx1bx_d4j8msxvlfpc0000gn/T/codex-clipboard-1fc0c84b-9166-4172-a292-779c292cefc7.png`
- Initial CraftAgent capture:
  - `/var/folders/sp/f2l8jmkx1bx_d4j8msxvlfpc0000gn/T/codex-clipboard-2c30d767-b662-4097-8bf7-8b53e4722226.png`
- Implementation screenshots:
  - Repository, compact state: `/var/folders/sp/f2l8jmkx1bx_d4j8msxvlfpc0000gn/T/com.openai.sky.CUAService/Electron Screenshot 2026-08-02 at 9.35.57 AM.jpeg`
  - Repository, changes expanded: `/var/folders/sp/f2l8jmkx1bx_d4j8msxvlfpc0000gn/T/com.openai.sky.CUAService/Electron Screenshot 2026-08-02 at 9.36.15 AM.jpeg`
  - Ordinary conversation: `/var/folders/sp/f2l8jmkx1bx_d4j8msxvlfpc0000gn/T/com.openai.sky.CUAService/Electron Screenshot 2026-08-02 at 9.36.33 AM.jpeg`
- Combined comparison: `/private/tmp/craftagent-info-popover-comparison.jpg`
- Source pixels: primary Codex crop `641 x 989`; implementation Electron viewport `1056 x 768`; comparison canvas `1280 x 768`.
- Density normalization: the primary reference crop was fitted to a `480 x 720` comparison slot and the full implementation capture to a `760 x 720` slot. The reference supplies hierarchy and density only; CraftAgent tokens, typography, radii, and colors remain authoritative.
- State: repository session with the information popover open, then branch menu and changes disclosure exercised; ordinary non-repository conversation checked separately.

## Findings and comparison history

1. **P1 fixed — the original panel exposed implementation detail instead of task-level choices.** A large nested Git card, task context, session context, empty file/output sections, and repeated separators made the panel read like a settings inspector.
2. The Git surface now follows the reference hierarchy: changes, local repository, branch, commit/push, pull request, and advanced actions are compact rows with progressive disclosure.
3. **P1 fixed — the first compact pass still forced the popover to fill the available vertical space.** The panel now uses that measurement only as a maximum height, so short content remains short and long expanded content scrolls.
4. **P1 fixed — code-topic guessing could show Git in an ordinary conversation.** Git visibility now depends on the native repository status result. The ordinary `天空蓝色原因` conversation showed sources only; the repository session showed the environment section.
5. Empty sources, session files, and outputs are omitted. Existing nonempty source/file/output actions remain available.

## Required fidelity surfaces

- Fonts and typography: existing CraftAgent type scale and platform font stack are preserved. Section labels use the existing muted `12px` treatment and rows use the existing `14px` content scale.
- Spacing and layout rhythm: passed. Rows share a compact `40px` minimum height, `8px` internal radius, and one-level disclosure panels; the popover is content-sized with a measured maximum height.
- Colors and visual tokens: passed. Existing foreground, muted, border, background, success, warning, accent, and shadow tokens are reused; no Codex color or hard-coded reference styling was copied.
- Image quality and asset fidelity: passed. Existing connector avatars are preserved and Git controls use the project's Lucide icon set; no placeholder or custom-drawn asset was added.
- Copy and content: passed. Repository labels are localized; redundant technical metadata and empty sections are no longer displayed.

## Interaction and runtime verification

- Repository-only Git visibility: passed.
- Ordinary-conversation Git suppression: passed.
- Branch dropdown: passed.
- Changes disclosure and bounded scrolling: passed.
- Targeted tests: `15` passed, `0` failed.
- Electron TypeScript typecheck: passed.
- Renderer production build: passed; existing large-chunk warning remains.
- Diff whitespace validation: passed.

final result: passed

---

# Sidebar Mode Restoration QA

- Source visual truth:
  - The existing `Direct Sidebar Toggle and Motion Polish QA` comparison in this report, which established the native `Craft 会话 / Craft 浏览器` switcher and grouped sidebar presentation.
  - User correction: browser and sessions remain two modes of one left sidebar; the native pinned/project/all-session groups stay in that sidebar; only the independent desktop middle column is removed.
- Implementation screenshots:
  - `/var/folders/sp/f2l8jmkx1bx_d4j8msxvlfpc0000gn/T/com.openai.sky.CUAService/Electron Screenshot 2026-08-02 at 1.15.07 AM.jpeg` — browser mode.
  - `/var/folders/sp/f2l8jmkx1bx_d4j8msxvlfpc0000gn/T/com.openai.sky.CUAService/Electron Screenshot 2026-08-02 at 1.17.17 AM.jpeg` — restored session mode and original-width rail.
  - `/var/folders/sp/f2l8jmkx1bx_d4j8msxvlfpc0000gn/T/com.openai.sky.CUAService/Electron Screenshot 2026-08-02 at 1.15.38 AM.jpeg` — Projects promoted to the main surface.
- Viewport: `1056 x 768`, macOS Electron logical desktop capture.
- State: dark desktop; sessions, browser, and project-list routes; review open where supported.

## Full-view and focused comparison evidence

The restored session capture uses the original compact primary rail, native section labels, project disclosure rows, session rows, selected state, and bottom workspace switcher. The browser capture changes the same rail in place to bookmarks and tabs; it does not add a Browser destination to the session navigation. The Projects capture retains the session rail and renders the project collection in the flexible main surface with no visible middle column.

## Findings and comparison history

- Fixed P1: the discarded pass forced session mode and exposed Browser as a separate navigation destination. The route now drives the existing two-mode switcher again.
- Fixed P1: the discarded pass replaced the native grouped session rows with the old full `SessionList` navigator. The slot and its parallel styling path were removed; pinned, project, and all-session groups are restored.
- Fixed P2: the discarded pass widened the rail to `264px`. Its one-time storage mutation is reverted to the original `220px` only when that migration marker is present; manually resized widths remain untouched.
- Fixed P2: browser search no longer opens an invisible session-list search state; the shared search dialog is used from both rail modes.

## Required fidelity surfaces

- Fonts and typography: existing sidebar labels, row sizes, weights, truncation, and CJK font stack are restored.
- Spacing and layout rhythm: original `220px` rail default, row density, section padding, panel gap, radii, and edge insets are preserved.
- Colors and visual tokens: existing foreground, muted, hover, selected, focus, glass, and panel tokens are reused.
- Image and icon fidelity: existing Lucide/provider favicons and workspace avatar remain; no replacement art or custom SVG was introduced.
- Copy and content: `Craft 会话`, `Craft 浏览器`, pinned/project/all-session groups, bookmarks, and browser tabs remain localized and route-correct.

## Verification

- Live Electron interaction: session → browser → session passed.
- Projects in the main content surface with session rail retained: passed.
- Targeted navigation/panel tests: `19 passed`, `0 failed`.
- Electron TypeScript typecheck: passed.
- Renderer production build: passed.
- Whitespace validation: passed.

final result: passed

---

# Unified Primary Navigation QA

- Source visual truth:
  - `/var/folders/sp/f2l8jmkx1bx_d4j8msxvlfpc0000gn/T/codex-clipboard-37e4b452-b3c2-4152-bde1-ef88ad102d7a.png`
  - `/var/folders/sp/f2l8jmkx1bx_d4j8msxvlfpc0000gn/T/codex-clipboard-6ac96b8e-0979-40a3-abd1-1dd77881930b.png`
  - User specification: remove the permanent second column; keep the native
    session groups and the existing session/browser mode switch in the primary
    rail; render other collections and details in the main content surface;
    add review only when requested.
- Implementation screenshots:
  - `/var/folders/sp/f2l8jmkx1bx_d4j8msxvlfpc0000gn/T/com.openai.sky.CUAService/Electron Screenshot 2026-08-02 at 12.59.21 AM.jpeg`
  - `/var/folders/sp/f2l8jmkx1bx_d4j8msxvlfpc0000gn/T/com.openai.sky.CUAService/Electron Screenshot 2026-08-02 at 1.03.19 AM.jpeg`
- Combined comparison: `/private/tmp/craftagent-unified-navigation-comparison.jpg`
- Source pixels: `970 x 1768` and `620 x 1754`.
- Implementation pixels and CSS viewport: `1056 x 768`, macOS Electron logical
  desktop capture. The source references were proportionally contained beside
  the implementation; density-only differences were excluded from findings.
- State: dark desktop; settings navigation; conversation with review open.

## Full-view comparison evidence

The settings reference establishes a single left navigation surface followed
by one content surface. The implementation now follows that structure: opening
settings replaces the primary rail with settings navigation and leaves one
main page. In the conversation reference, review is an optional adjacent work
surface. The implementation now renders primary rail + conversation + review;
the duplicated all-sessions middle column is absent.

## Focused region comparison evidence

The left rail was checked at readable scale because it carries the highest
interaction risk after the merge. It contains app destinations followed by the
native pinned, project, and all-session groups, selected/unread/processing
states, and session context actions. Its existing mode switch replaces those
groups with bookmarks and tabs when Craft Browser is selected. No separate
desktop session-list resize handle or visible toggle remains.

## Findings

- No actionable P0/P1/P2 mismatch remains in the requested information
  architecture.
- Fixed P1: an intermediate implementation replaced the native grouped rail
  with the full legacy `SessionList` and split Browser into an unrelated nav
  destination. That implementation was discarded; the original rail and
  session/browser switch are restored.
- Fixed P2: the obsolete View-menu action could toggle an invisible middle
  column. The item is removed; its legacy event aliases the unified sidebar.
- P3: very long session and model names still truncate at the narrowest allowed
  rail width, using the existing tooltip and title behavior.

## Required fidelity surfaces

- Fonts and typography: existing platform/CJK stacks, row sizes, hierarchy,
  weights, wrapping, truncation, and antialiasing are preserved.
- Spacing and layout rhythm: passed. Desktop now has one fixed primary rail and
  one flexible main surface; optional review uses the existing gap, radii,
  shadow, and resize tokens. No permanent middle track remains.
- Colors and visual tokens: existing shell, panel, selection, muted, focus,
  and semantic-state tokens are reused without introducing a parallel theme.
- Image quality and asset fidelity: existing application icons and avatars are
  reused. No placeholder art, custom SVG, CSS drawing, or replacement asset was
  introduced.
- Copy and content: `Craft 会话`, application destinations, `所有会话`, settings
  groups, project/automation titles, and review actions remain localized.

## Comparison history

1. Initial implementation still treated the session navigator as a separate
   desktop column and hid the all-session fallback while that column was open.
2. An intermediate unified pass embedded the full `SessionList` in the primary
   rail and promoted Browser to a separate nav destination. Runtime/user review
   rejected that information architecture.
3. The rejected slot, separate Browser destination, forced session-only header,
   and one-time `264px` width mutation were removed.
4. Post-fix runtime captures verify the original Craft Session/Craft Browser
   modes share the same rail, while Projects and other collections use the main
   content surface.

## Interaction and runtime verification

- Session selection from Browser back to conversation: passed.
- Shared workspace/session search from the rail header: passed.
- Projects list in main content and project detail replacement: passed.
- Automations list in main content: passed.
- Skills/experts center in main content: passed.
- Browser mode replacing the same rail with bookmarks and tabs: passed.
- Settings rail replacement and return-to-app: passed.
- Review open/close with unified rail: passed.
- Electron TypeScript typecheck: passed.
- Targeted navigation and panel tests: passed.

final result: passed

---

# Direct Sidebar Toggle and Motion Polish QA

- Source visual truth:
  - `/var/folders/sp/f2l8jmkx1bx_d4j8msxvlfpc0000gn/T/codex-clipboard-53701021-e74e-43a2-9eb1-c892e5604d78.png`
  - `/var/folders/sp/f2l8jmkx1bx_d4j8msxvlfpc0000gn/T/codex-clipboard-8434bc65-3b9f-4263-a8de-f214cb1f0aab.png`
- Implementation screenshots:
  - `/private/tmp/craftagent-motion-polish-clean.png`
  - `/private/tmp/craftagent-motion-polish-collapsed.png`
  - `/private/tmp/craftagent-motion-polish-mode-menu.png`
  - `/private/tmp/craftagent-motion-polish-review-open.png`
  - `/private/tmp/craftagent-motion-polish-review-closed.png`
- Combined focused comparison:
  `/private/tmp/craftagent-motion-polish-comparison-final.png`
- Source pixels: `544 x 392` for the focused mode-switcher reference.
- Implementation pixels and CSS viewport: `1195 x 768`, captured from the
  Electron window at its logical desktop size.
- Density normalization: the implementation was cropped to the same
  `544 x 392` top-left region and placed beside the source at native pixels.
- State: macOS desktop, dark primary sidebar, sessions view. The source shows
  the old persistent pill highlighted in red; the requested implementation
  intentionally removes that idle fill.

## Full-view comparison evidence

The implementation preserves the established Craft sidebar scale, hierarchy,
and placement while making the `Craft 会话/浏览器` control visually neutral at
rest. Search and Dynamic remain aligned on the same row. The content and review
panels keep equal outer spacing in both review-closed and review-open captures.

## Focused region comparison evidence

The side-by-side top-left crop confirms that the mode label no longer carries
the persistent rounded gray selection surface from the source. The open menu
capture confirms that hover/open feedback and the current-mode check remain,
so removing the idle fill did not weaken the switch affordance.

## Findings

- No actionable P0/P1/P2 mismatch remains within the requested scope.
- Fixed P1 interaction issue: the top-left icon was a dropdown trigger rather
  than the direct sidebar toggle shown by its label. It now calls the sidebar
  action on a single click; the native View menu remains the complete layout
  command surface.
- Fixed P2 motion issue: the review sidebar was conditionally mounted already
  at full width, leaving no visible transition trajectory. Its shell now stays
  mounted and animates width, gap compensation, opacity, translation, and a
  restrained scale while the conversation panel reflows with the same spring.
- P3 platform note: the behavior was exercised on macOS. Windows shares the
  same renderer-side toggle and panel animation path, but no native Windows
  capture was available in this environment.

## Required fidelity surfaces

- Fonts and typography: existing platform/CJK stacks, sizes, weights, line
  heights, truncation, and localized `Craft ` spacing are unchanged.
- Spacing and layout rhythm: the neutral mode trigger keeps its original hit
  target and row alignment. The review panel uses the existing `PANEL_GAP`,
  width, radii, and spring tokens, so open/closed transitions do not introduce
  a spacing jump.
- Colors and visual tokens: the idle trigger is transparent; hover and open
  feedback continue to use the existing foreground-opacity tokens. No new
  hard-coded UI color was introduced.
- Image quality and asset fidelity: existing icons and avatars are preserved;
  no placeholder, custom SVG, CSS drawing, or substitute image was added.
- Copy and content: `Craft 会话`, `Craft 浏览器`, their descriptions, and all
  review-panel labels remain localized and unchanged.

## Comparison history

1. Initial issue: the titlebar icon opened a layout dropdown and did not
   collapse the sidebar; the mode switch looked permanently pressed; review
   open/close snapped the main content width.
2. Fix: connected the titlebar icon directly to the sidebar action, removed
   the idle mode fill, kept the review shell mounted from zero width, and
   restored the component library's menu/dialog/popover motion for users who
   have not requested reduced motion.
3. Post-fix evidence: direct collapse changed the control value from `0` to
   `1` and removed the sidebar; a second click restored it. Review open changed
   its control value and route state, produced the expected three-panel layout,
   and closing restored the conversation width.

## Interaction and runtime verification

- Direct sidebar collapse from the titlebar icon: passed.
- Direct sidebar restore from the same icon: passed.
- Sessions/Browser mode menu and switch: passed.
- Review panel open and close: passed; conversation content reflowed and both
  final layouts were captured.
- Targeted unit tests: `13` passed, `0` failed.
- Electron TypeScript typecheck: passed.
- Renderer production build: passed; existing large-chunk warning remains.
- Targeted ESLint: passed with no warnings or errors.
- Runtime renderer: no visible crash, clipped persistent control, or broken
  panel layout occurred during the tested states.

final result: passed

---

# Split Title Bar and Auto-layout Panel QA

- Source visual truth:
  - `/var/folders/sp/f2l8jmkx1bx_d4j8msxvlfpc0000gn/T/codex-clipboard-33e6f066-69a9-4098-8ca0-32d52a0888ab.png`
  - `/var/folders/sp/f2l8jmkx1bx_d4j8msxvlfpc0000gn/T/codex-clipboard-7cc1cea5-56b9-43d1-a631-4907f5269630.png`
- Implementation screenshots:
  - `/private/tmp/craftagent-split-topbar-collapsed.jpg`
  - `/private/tmp/craftagent-split-topbar-expanded.jpg`
  - `/private/tmp/craftagent-sidebar-resized.jpg`
- Combined full-view comparison:
  `/private/tmp/craftagent-layout-comparison.jpg`
- Combined focused help comparison:
  `/private/tmp/craftagent-help-comparison.jpg`
- Source pixels: `2985 x 1460` for the layout reference and `562 x 209`
  for the help-location reference, both tagged at `144 dpi`.
- Implementation pixels and CSS viewport: `1195 x 768`, captured at the
  Electron window's logical size; the Computer Use capture is tagged at
  `72 dpi`.
- Density normalization: the layout source was proportionally contained in a
  `1195 x 768` comparison cell beside the `1195 x 768` implementation. The
  help source and a `170 x 248` implementation crop were each proportionally
  contained in equal `561 x 248` cells. No visual findings were inferred from
  the surrounding desktop, different app content, or density mismatch.
- State: macOS desktop, light theme, Browser selected. Both collapsed and
  expanded second-navigator states were captured. The reference shows a chat
  state, so the comparison is limited to the window frame, panel geometry, and
  persistent sidebar controls shared by both states.

## Full-view comparison evidence

The right-hand panel now begins at the window's top inset instead of below a
full-width title bar. Its top, right, and bottom outer gaps use the same `6px`
panel inset. The left navigation retains its existing traffic-light and
navigation-control region. Collapsing the second navigator lets content fill
the available width; expanding it inserts the navigator between the unchanged
left sidebar and content while preserving the same outer panel geometry.

## Focused region comparison evidence

The focused comparison confirms that Help has moved from the otherwise empty
right end of the title bar into the far right of the bottom workspace row. The
workspace avatar and name remain on the left, and the Help trigger remains
visually independent from the workspace dropdown.

## Findings

- No actionable P0/P1/P2 difference remains within the agreed scope.
- Intentional difference: the implementation retains CraftAgent's existing
  content, sidebar density, colors, radii, and window controls rather than
  copying the red markup or the reference's temporary chat content.
- Intentional deferral: Windows minimize, maximize, and close controls remain
  unchanged. The requested floating/hover treatment was explicitly excluded
  from this pass.

## Required fidelity surfaces

- Fonts and typography: existing CraftAgent font family, sizes, weights, line
  heights, truncation, and CJK/Latin spacing remain unchanged; the structural
  refactor introduces no new display type.
- Spacing and layout rhythm: top, right, and bottom content insets are equal at
  `6px`; the existing left-sidebar title-bar offset is preserved; panel gaps
  remain `6px`; both navigator visibility and sidebar width changes reflow the
  content rather than overlaying it.
- Colors and visual tokens: existing shell, panel, foreground, muted,
  hover, border, radius, and elevation tokens are reused.
- Image quality and asset fidelity: the existing workspace avatar is reused
  without resampling in-product; Help and navigation controls use the project's
  existing icon library. No placeholder, custom SVG, CSS drawing, or substitute
  asset was added.
- Copy and content: existing localized Help documentation items are preserved;
  no new user-facing copy was introduced by this layout change.

## Comparison history

1. Initial comparison after splitting the title bar found no P0/P1/P2 visual
   mismatch in the requested framing. The right panel reached the top and kept
   equal outer insets.
2. Interaction verification confirmed the same geometry with the second
   navigator both expanded and collapsed.
3. Sidebar-resize verification moved the first-column boundary from roughly
   `165px` to `257px`; the right panel reflowed to the new boundary and retained
   its top, right, and bottom insets. The sidebar was restored before the final
   collapsed-state capture.
4. Focused verification opened the Help menu from the bottom workspace row and
   confirmed all documentation destinations remain available.

## Interaction and runtime verification

- Second navigator collapse/expand: passed.
- Left sidebar resize and content auto-layout: passed.
- Bottom Help trigger and documentation menu: passed.
- TypeScript typecheck: passed.
- Targeted unit tests: `8` passed, `0` failed.
- Renderer production build: passed; only the existing large-chunk warning
  remains.
- Targeted ESLint: `0` errors; existing hook-dependency warnings remain.
- Runtime renderer: no visible crash, overflow, or inaccessible persistent
  control was observed in the tested states.

final result: passed

---

# Default Navigator Collapse and Header Rhythm QA

- Source visual truth:
  - `/var/folders/sp/f2l8jmkx1bx_d4j8msxvlfpc0000gn/T/codex-clipboard-6a3fd3b4-3858-41fe-944d-b0e3ff2af7e6.png`
  - `/var/folders/sp/f2l8jmkx1bx_d4j8msxvlfpc0000gn/T/codex-clipboard-72390018-fff5-4bf2-99ad-9826c36f0916.png`
  - `/var/folders/sp/f2l8jmkx1bx_d4j8msxvlfpc0000gn/T/codex-clipboard-9a21501a-eceb-4a34-be63-128e26461a3d.png`
- Implementation screenshots:
  - `/private/tmp/craftagent-final-default-collapsed.png`
  - `/private/tmp/craftagent-final-browser-collapsed.png`
- Focused comparison evidence:
  - `/private/tmp/craftagent-final-topbar-focus-comparison.png`
- Source pixels: `2848 x 360`, `2844 x 1869`, and `535 x 372`.
- Implementation pixels: `1195 x 768`.
- CSS viewport: approximately `1195 x 768`; Computer Use exposes the logical
  window capture but not the native device scale factor.
- Density normalization: the source title-bar region was cropped from the
  `@2x` screenshot and normalized to `1195 x 54`; the implementation title-bar
  region was captured at `1195 x 54`. Both were stacked in the same
  `1195 x 108` comparison image.
- State: macOS desktop, light theme, isolated QA workspace; both Craft 会话 and
  Craft 浏览器 modes were exercised.

## Full-view comparison evidence

The implementation launches with the detail navigator collapsed, leaving the
first column and content panel visible. The layout menu shows a check beside
`折叠会话列表`; toggling it restores the existing navigator. Switching between
Craft 会话 and Craft 浏览器 preserves that shared collapsed state.

The prior `48px` top bar plus separate `6px` content spacer has been replaced
by one `54px` top-bar region. The content panel begins at the same vertical
position, while controls now center against the full header region instead of
appearing high within a shorter bar.

## Focused region comparison evidence

The combined title-bar comparison confirms that the window header and first
panel retain the requested compact vertical footprint. The Craft mode switcher
shows the full `Craft 会话` / `Craft 浏览器` labels with a Latin-CJK space.

The isolated QA workspace has no recent sessions, so the exact recent-row state
from the source screenshot could not be reproduced. Alignment is enforced by
the component grid and regression test: section labels use the same `20px`
left inset as row text, rather than the selected-row surface's `8px` inset.

## Findings

- No actionable P0/P1/P2 difference remains.
- P2 fixed: the second navigator previously launched expanded and duplicated
  information already present in the first column.
- P2 fixed: the desktop controls were centered within `48px` while the content
  started after another `6px`, creating an uneven top/bottom visual rhythm.
- P3 fixed: the mode switcher now uses the requested Craft naming and preserves
  the full browser label at the minimum desktop sidebar width.
- P3 fixed: section headings align with row text rather than selected-row fill.

## Required fidelity surfaces

- Fonts and typography: the existing CraftAgent font stack, weights, and sizes
  remain unchanged; only the requested Craft prefix and inter-script space were
  added.
- Spacing and layout rhythm: the desktop header is a single `54px` region,
  panel bottom inset remains `6px`, and section labels share the row-text inset.
- Colors and visual tokens: no color, opacity, radius, or shadow token changed.
- Image quality and asset fidelity: existing application icons and live assets
  are retained; no replacement visual assets were introduced.
- Copy and content: `Craft 会话` and `Craft 浏览器` appear in both the trigger
  and its menu, while descriptions remain localized.

## Comparison history

1. Initial runtime capture showed the navigator collapsed correctly, but
   `Craft 浏览器` truncated in the first-column header.
2. Fix: the mode trigger was made non-shrinking at the supported desktop
   sidebar width.
3. Post-fix capture:
   `/private/tmp/craftagent-final-browser-collapsed.png` shows the full label
   with the navigator still collapsed.

## Interaction and runtime verification

- Fresh default navigator state: passed.
- Layout-menu selected state: passed.
- Manual navigator restore: passed.
- Craft 会话 / Craft 浏览器 switching: passed.
- Shared collapsed state across both modes: passed.
- TypeScript typecheck: passed.
- Focused regression tests: `6 passed`, `0 failed`.
- Targeted ESLint: `0 errors`; only existing warnings remain.
- Runtime console: no renderer errors observed; existing Electron deprecation
  and optional connection warnings remain.

final result: passed

---

# Workspace Menu, Global Search, and Browser Sidebar QA

- Source visual truth:
  - `/var/folders/sp/f2l8jmkx1bx_d4j8msxvlfpc0000gn/T/codex-clipboard-488c2938-52c9-4884-8efb-51072e979e7d.png`
  - `/var/folders/sp/f2l8jmkx1bx_d4j8msxvlfpc0000gn/T/codex-clipboard-5c4f0fbd-5807-4921-9fe7-f70f33794e69.png`
  - `/var/folders/sp/f2l8jmkx1bx_d4j8msxvlfpc0000gn/T/codex-clipboard-66bd6c9b-dcc7-4082-a01a-55f020a96a40.png`
  - `/var/folders/sp/f2l8jmkx1bx_d4j8msxvlfpc0000gn/T/codex-clipboard-c8ca4ea9-a97f-44c3-8e90-cc9a8e73b96c.png`
- Implementation screenshots:
  - `/private/tmp/craftagent-workspace-menu-qa.png`
  - `/private/tmp/craftagent-search-empty-qa.png`
  - `/private/tmp/craftagent-search-results-qa.png`
  - `/private/tmp/craftagent-browser-sidebar-qa.png`
  - `/private/tmp/craftagent-sessions-sidebar-qa.png`
- Combined comparison evidence:
  - `/private/tmp/craftagent-search-comparison.png`
  - `/private/tmp/craftagent-search-focus-comparison.png`
  - `/private/tmp/craftagent-workspace-comparison.png`
  - `/private/tmp/craftagent-workspace-focus-comparison.png`
- Source pixels:
  - Search reference: `3122 x 2002`, `144dpi` (`@2x` nominal CSS size approximately `1561 x 1001`).
  - Workspace reference: `514 x 467`, `144dpi` (`@2x` nominal CSS size approximately `257 x 234`).
- Implementation pixels: `1195 x 768`, `72dpi`.
- CSS viewport: approximately `1195 x 768`; Computer Use exposes the logical window capture but not the native device scale factor.
- Density normalization: full-view comparisons were independently resized to `720px` high. Focused crops were extracted from the actual modal and workspace-menu regions before being placed into the same comparison images.
- State: macOS desktop, light theme, populated workspace; both Sessions and Browser modes were tested.

## Full-view comparison evidence

The search dialog is globally centered rather than positioned relative to the
sidebar. Its coded size is exactly `488 x 458px`, with viewport-safe maximum
dimensions and CraftAgent's existing `rounded-modal` token. The full-view
comparison confirms centered composition, dimmed backdrop, stable fixed frame,
and the requested compact command-palette hierarchy.

Browser mode removes projects and recent conversations from the first column.
It instead shows the `书签栏` folder, bookmark empty/populated state, and a
separate list of live browser tabs. Returning to Sessions restores the normal
navigation, project groups, and recent conversations.

## Focused region comparison evidence

The workspace-menu focused comparison confirms that the menu and the bottom
workspace trigger share the same left and right edges. The search focused
comparison confirms the input/header rhythm, selected row styling, compact icon
scale, dialog radius, and shadow against the Codex reference. The implementation
intentionally uses CraftAgent's smaller radius and semantic tokens.

## Findings

- No actionable P0/P1/P2 visual difference remains.
- Intentional difference: the empty search state shows four working CraftAgent
  shortcuts and explanatory copy instead of Codex's recent-chat results.
- Intentional difference: search results include snippets and content-type
  labels, because CraftAgent searches more than conversations.
- P3: the browser first column and the existing second-column tab navigator
  currently both expose tabs. This is retained because the user explicitly
  requested keeping the second column during the migration.

## Required fidelity surfaces

- Fonts and typography: existing CraftAgent UI font and optical weights are
  retained; `15px` search input, `13px` rows, and `10–11px` metadata remain
  legible and truncate long text safely.
- Spacing and layout rhythm: the search frame is `488 x 458px`, uses a `58px`
  input header, compact `40–48px` rows, fixed centering, and the existing modal
  radius. Sidebar rows remain on the existing compact grid.
- Colors and visual tokens: backdrop, surface, border, selected/hover states,
  muted copy, and shadows all use existing CraftAgent semantic tokens.
- Image quality and asset fidelity: real workspace avatars and live favicons are
  reused. All other marks use the project's existing Lucide icon library; no
  placeholder drawing or handcrafted SVG was introduced.
- Copy and content: bookmark and tab labels are localized across all supported
  locales. Search shortcuts and result metadata match the requested Chinese UI.

## Comparison history

1. Initial interaction check showed that an empty/stale workspace search index
   could miss current conversation titles.
2. Fix: merged the live session metadata into the indexed search result stream,
   deduplicated by entry ID, while preserving the broader index for knowledge,
   files, projects, browser history, skills, and settings.
3. Post-fix evidence:
   `/private/tmp/craftagent-search-results-qa.png` shows four automatic matches
   for `网站`; pressing Enter closed the dialog and opened the selected result.
   No actionable P0/P1/P2 issue remains.

## Interaction and runtime verification

- Workspace menu width: passed; menu and selected trigger edges align.
- Empty search state: passed; four shortcuts render and are keyboard selectable.
- Live search: passed; `网站` returned four matches with titles, snippets, and
  source labels.
- Search keyboard navigation: passed; Enter opened the active result and closed
  the modal.
- Browser mode: passed; projects/recent sessions are hidden and the first column
  contains `书签栏` plus live tab rows.
- Sessions mode: passed; normal navigation, projects, and recent conversations
  return after switching back.
- TypeScript typecheck: passed.
- Locale parity and sorted-key checks: passed.
- Targeted ESLint: `0` errors; only pre-existing hook-dependency warnings remain.
- Runtime console: no renderer errors observed; existing Electron deprecation
  and optional browser-permission warnings remain.

final result: passed

---

# Sidebar Header, Mode Switcher, and Workspace Menu QA

- Source visual truth:
  - `/var/folders/sp/f2l8jmkx1bx_d4j8msxvlfpc0000gn/T/codex-clipboard-b9d931a6-9abf-4520-be89-863303021915.png`
  - `/var/folders/sp/f2l8jmkx1bx_d4j8msxvlfpc0000gn/T/codex-clipboard-0a167cf1-a183-40cc-b987-4d7128231ea6.png`
  - `/var/folders/sp/f2l8jmkx1bx_d4j8msxvlfpc0000gn/T/codex-clipboard-d4840f2d-eb1d-40e5-9e6f-60e41d347928.png`
- Implementation screenshots:
  - `/private/tmp/craftagent-sidebar-round3-base.png`
  - `/private/tmp/craftagent-sidebar-round3-mode-open-fixed.png`
  - `/private/tmp/craftagent-sidebar-round3-workspace-open.png`
- Focused side-by-side comparisons:
  - `/private/tmp/craftagent-round3-compare-top.png`
  - `/private/tmp/craftagent-round3-compare-mode-fixed.png`
  - `/private/tmp/craftagent-round3-compare-workspace.png`
- Source pixels: `973 x 663`, `543 x 265`, and `545 x 389`.
- Implementation pixels: `1195 x 768` for all three desktop states.
- CSS viewport: approximately `1195 x 768`; Computer Use provides a
  logical-window screenshot and does not expose the Electron device scale factor.
- Density normalization: each focused source and implementation region was
  independently resized to `480px` width, then placed side by side with a
  `16px` divider.
- States: light theme; Browser selected; session/browser menu open; workspace
  menu open from the viewport bottom.

## Full-view comparison evidence

The desktop title bar no longer contains the Craft brand/menu or the workspace
selector. It retains only layout, history, and help controls. The first sidebar
row now contains the session/browser pill, global search, and dynamic entry.
New Session uses the same compact row height and visual weight as the remaining
navigation items. Projects and recent sessions retain the prior hierarchy.
The workspace trigger occupies the former settings position at the bottom.

## Focused region comparison evidence

The mode-switcher comparison shows the same rounded trigger, left-aligned
two-row menu, secondary descriptions, and right-aligned selected check as the
reference. The workspace comparison shows the active workspace row, Add
Workspace separator, and the requested Settings and What's New rows. The top
comparison confirms the brand removal, compact New Session treatment, and
search/dynamic placement.

## Findings

- No actionable P0/P1/P2 issue remains.
- Intentional difference: the two mode labels are Sessions and Browser rather
  than ChatGPT and Codex, matching CraftAgent's actual product areas.
- Intentional difference: Settings and What's New extend the workspace menu
  beyond the reference because the user explicitly requested that migration.
- P3: the system cursor is visible in some evidence captures; it is not part of
  the rendered interface.

## Required fidelity surfaces

- Fonts and typography: the trigger and menu use CraftAgent's existing UI font,
  compact `13px` labels, `11px` descriptions, and semibold hierarchy without
  wrapping.
- Spacing and layout rhythm: the trigger, `244px` menu width, rounded menu
  surface, compact navigation rows, and bottom workspace trigger align with the
  reference proportions.
- Colors and visual tokens: backgrounds, hover states, muted descriptions,
  semantic accent dots, and selected checks use existing theme tokens.
- Image and asset fidelity: the existing workspace avatar is reused; all other
  visible controls use the project's icon library with no placeholder or
  custom-drawn substitutes.
- Copy and content: Sessions, Browser, descriptions, New Session, Search,
  Dynamic, Settings, and What's New are localized in all supported locales.

## Comparison history

1. Initial comparison identified one P2: the mode menu's two rows were taller
   than the normalized reference and made the popup feel too loose.
2. Fix: reduced each menu row from `58px` to `50px`.
3. Post-fix evidence:
   `/private/tmp/craftagent-round3-compare-mode-fixed.png` confirms the revised
   popup height and rhythm. No actionable P0/P1/P2 issue remains.

## Interaction and runtime verification

- Sessions/Browser menu: passed; switching to Sessions restored the full
  sessions navigator in the second column.
- Search icon: passed; opened the global workspace search dialog.
- Dynamic icon: passed; opened the Dynamic navigator and detail state.
- Workspace menu: passed; opened upward from the bottom trigger and exposed the
  active workspace, Add Workspace, Settings, and What's New.
- Settings row: passed; navigated to Settings from the workspace menu.
- Brand and top workspace controls: absent in the desktop title bar.
- TypeScript typecheck: passed.
- Locale parity and sorted-key checks: passed.
- Targeted ESLint: `0` errors; existing hook-dependency warnings remain.
- Runtime console: no renderer errors observed; existing Electron deprecation
  and optional browser-permission warnings remain.

final result: passed

---

# Codex-style Navigation Sidebar QA

- Source visual truth:
  - `/var/folders/sp/f2l8jmkx1bx_d4j8msxvlfpc0000gn/T/codex-clipboard-9237dcbd-7eed-4bd8-b5c7-91e47a6e6964.png`
  - `/var/folders/sp/f2l8jmkx1bx_d4j8msxvlfpc0000gn/T/codex-clipboard-2aed1eca-a1e0-4d40-978c-784099efcba7.png`
- Implementation screenshot: `/private/tmp/craftagent-ui-qa-implementation.png`
- Side-by-side focused comparison: `/private/tmp/craftagent-sidebar-comparison.png`
- Source pixels: `575 x 2058`
- Implementation pixels: `1195 x 768`
- CSS viewport: approximately `1195 x 768`; the Computer Use capture is normalized to the macOS window's logical size, and the underlying device scale factor is not exposed.
- Density normalization: the Codex sidebar was resized to `215 x 768`; the CraftAgent first column was cropped to `198 x 768`, then both were placed in one `429 x 768` comparison image.
- State: macOS desktop, light theme, Browser selected, populated workspace with two projects and recent sessions.

## Full-view comparison evidence

The implementation preserves CraftAgent's existing global title bar and panel
chrome while adopting the Codex hierarchy below it: primary product areas,
projects, recent sessions, and viewport-bottom settings. The second navigator
column remains present and still changes between browser tabs and all sessions.
The first column is denser than the previous empty navigation state and uses the
existing application spacing, radius, icon, and color tokens.

## Focused region comparison evidence

The focused side-by-side image makes the complete first-column hierarchy
readable at equal height. Section labels, project folders, nested/recent session
rows, selected-row fill, truncation, and bottom actions were compared directly.
No additional crop was required because both entire sidebars remain legible in
the combined evidence.

## Findings

- No actionable P0/P1/P2 difference remains.
- Intentional difference: CraftAgent keeps its workspace selector in the shared
  title bar instead of duplicating Codex's product/account header inside the
  sidebar.
- Intentional difference: CraftAgent keeps a narrower first column and its
  existing typography tokens to preserve the requested space saving.
- P3 fixed: fallback session and overflow copy now use existing localized
  strings instead of hard-coded English.

## Required fidelity surfaces

- Fonts and typography: existing CraftAgent sans-serif stack, `11px` section
  labels, and `12px` navigation/session rows remain internally consistent;
  truncation prevents long session names from changing the column width.
- Spacing and layout rhythm: `32px` rows, compact section gaps, existing
  control radii, and a fixed bottom action region mirror the reference's rhythm.
- Colors and visual tokens: all foreground, muted, accent, hover, and selected
  states use existing semantic theme tokens; light-theme contrast remains clear.
- Image and asset fidelity: all visible UI marks use the project's existing
  Lucide icon library; no reference imagery or custom-drawn substitute was
  required.
- Copy and content: primary labels, project names, recent session names, section
  labels, fallback titles, and overflow copy use existing localization.

## Comparison history

1. Initial comparison: no P0/P1/P2 mismatch was found. The implementation
   retained the intended hierarchy and working second-column navigation.
2. P3 copy cleanup: hard-coded `Untitled` and `More` fallbacks were replaced
   with existing translation keys. The compared visible state did not contain
   either fallback, so no visual recapture was necessary.

## Interaction and runtime verification

- Recent session selection: passed; opened the selected session and restored
  the all-sessions navigator in the second column.
- Browser selection: passed; restored the browser-tab navigator and browser
  content.
- TypeScript typecheck: passed.
- Locale parity and sort checks: passed.
- Console/runtime check: no renderer errors observed; only existing Electron
  deprecation and denied optional browser-permission warnings appeared.

final result: passed

---

# Codex-scale Sidebar Polish and Collapse QA

- Source visual truth:
  `/var/folders/sp/f2l8jmkx1bx_d4j8msxvlfpc0000gn/T/codex-clipboard-9237dcbd-7eed-4bd8-b5c7-91e47a6e6964.png`
- Implementation screenshots:
  - `/private/tmp/craftagent-sidebar-polish-final-light.jpg`
  - `/private/tmp/craftagent-sidebar-polish-final.jpg`
- Combined focused comparison:
  `/private/tmp/craftagent-sidebar-polish-comparison.jpg`
- Source pixels: `575 x 2058`, tagged at `144 dpi`.
- Implementation pixels and CSS viewport: `1195 x 768`, captured at the
  Electron window's logical size and tagged at `72 dpi`.
- Density normalization: the Codex source sidebar was proportionally reduced
  to `215 x 768`; the CraftAgent sidebar was cropped at `264 x 768`. Both were
  placed at native logical height in one comparison image. The widths were not
  forced equal because the source and implementation intentionally use different
  sidebar widths; row scale, icon scale, typography, and vertical rhythm were
  compared at equal height.
- State: macOS desktop, sessions navigation, light content theme with the
  existing CraftAgent shell tint, empty session list. Collapse and restore were
  each tested from the top-left layout menu.

## Full-view comparison evidence

The revised CraftAgent first column now uses `14px` primary and session text,
`17px` primary icons, `36px` navigation/session rows, and `12px` section labels.
At equal logical height, its controls are substantially closer to Codex's visual
weight and no longer read as a miniaturized version. The selected New Session
row adds semibold text to the existing background highlight. Workspace and Help
controls were enlarged proportionally without changing the column structure.

## Focused region comparison evidence

The combined comparison keeps both complete sidebars legible. It confirms the
larger icons, text, row height, group spacing, and selected-row emphasis. The
source contains populated pinned/recent sessions while the isolated QA workspace
is empty, so content density and exact text wrapping were excluded from the
fidelity judgment.

## Findings

- No actionable P0/P1/P2 visual mismatch remains within this iteration's scope.
- Fixed P1 interaction issue: hidden sidebar content could retain a hit region,
  and the layout dropdown used a generic click event. The menu now uses its
  native selection event and the collapsed sidebar disables pointer events.
- P3 platform test gap: the Windows-only `12px` outer-window radius was verified
  through platform-scoped CSS, maximize-state handling, typecheck, tests, and
  production build. A native Windows visual capture is unavailable in the macOS
  test environment; the change intentionally does not affect macOS or internal
  panel radii.

## Required fidelity surfaces

- Fonts and typography: existing platform font stacks are preserved. Main
  navigation and content rows are `14px`; section labels are `12px`; selected
  destinations use weight `600`; line height, truncation, and CJK rendering
  remain token-compatible.
- Spacing and layout rhythm: primary and content rows are `36px` high with
  `8px` radii and `10px` icon/text gaps. Group expansion animates height and
  opacity over `180ms`; press, hover, icon, chevron, and selection transitions
  use short `120–150ms` feedback.
- Colors and visual tokens: existing foreground, muted, hover, selected,
  accent, shell, and panel tokens are reused. No new hard-coded UI color was
  introduced.
- Image quality and asset fidelity: existing workspace avatars and browser
  favicons are preserved; navigation uses the project's icon library. No
  placeholder, CSS drawing, custom SVG, or substituted image asset was added.
- Copy and content: all existing localized navigation and workspace copy is
  unchanged.

## Comparison history

1. Initial issue: CraftAgent used mostly `12px` text, `14px` icons, `32px` rows,
   and background-only selection, making it visibly smaller and lighter than the
   Codex reference.
2. Fix: raised the navigation scale, added semibold selected states, enlarged
   header/footer controls, and added restrained hover, press, selection,
   chevron, and expand/collapse motion.
3. Initial interaction issue: selecting Collapse Sidebar could leave an
   invisible sidebar hit area and relied on a generic click event.
4. Fix: switched the three layout commands to the dropdown's native `onSelect`
   path and removed pointer events from the hidden sidebar container.
5. Post-fix evidence: `/private/tmp/craftagent-sidebar-polish-final-light.jpg`
   and the live collapse/restore captures confirm the larger visual scale and a
   working two-way sidebar transition.

## Interaction and runtime verification

- Sidebar collapse from layout menu: passed.
- Sidebar restore from layout menu: passed.
- Sessions/Browser mode switch: passed.
- Project and bookmark disclosure motion: code path and renderer build passed;
  the isolated workspace had no nested sessions/bookmarks to exercise visually.
- Targeted unit tests: `11` passed, `0` failed.
- TypeScript typecheck: passed.
- Renderer production build: passed; existing large-chunk warning remains.
- Targeted ESLint: `0` errors; `2` pre-existing WorkspaceSwitcher hook warnings
  remain.
- Runtime renderer: no visible crash or overflow occurred during the tested
  switch, collapse, and restore states.

final result: passed

---

# Review Sidebar Overflow Regression QA

- Source visual truth:
  - `/var/folders/sp/f2l8jmkx1bx_d4j8msxvlfpc0000gn/T/codex-clipboard-c1f6460f-d8be-4aaf-b736-41c811b6204a.png`
  - `/var/folders/sp/f2l8jmkx1bx_d4j8msxvlfpc0000gn/T/codex-clipboard-e13f0b8d-055f-44f9-9b90-5e390d2b8aa4.png`
  - Expected closed layout: `/var/folders/sp/f2l8jmkx1bx_d4j8msxvlfpc0000gn/T/codex-clipboard-a71469c6-22f3-4941-b5cc-0e89fc3c224b.png`
- Implementation screenshots:
  - `/private/tmp/craftagent-overflow-fix-default-large.png`
  - `/private/tmp/craftagent-overflow-fix-review-open.png`
  - `/private/tmp/craftagent-overflow-fix-review-closed.png`
- Combined comparison: `/private/tmp/craftagent-overflow-fix-comparison.png`
- Source pixels: expected closed layout `2316 x 1772`; implementation
  `1352 x 768` Electron desktop capture.
- Density normalization: source resized proportionally to `768px` height and
  placed next to the native implementation capture. Theme and conversation
  content differ; panel geometry, edge spacing, and horizontal overflow were
  the comparison targets.
- State: sessions detail, review closed on initial load; then review opened and
  closed again.

## Findings and comparison history

1. **P1 fixed — hidden review panel inflated horizontal scroll width.** The
   previous implementation kept a zero-width wrapper mounted while its child
   retained the full review width and the wrapper allowed visible overflow.
   This produced the broken initial horizontal offset and bottom scrollbar in
   the supplied captures.
2. The review panel now uses enter/exit presence. It mounts from zero width,
   animates to the saved width, animates back to zero, and is then removed from
   layout entirely. Its content uses the animated wrapper's width instead of a
   hidden fixed width.
3. Post-fix captures show the initial closed state, open state, and second
   closed state all aligned with no bottom horizontal scrollbar.

## Required fidelity surfaces

- Fonts and typography: unchanged; no type styles were touched.
- Spacing and layout rhythm: passed. Sidebar, navigator, content, and review
  retain existing gap/radius tokens; the closed state no longer reserves or
  overflows review width.
- Colors and visual tokens: unchanged.
- Image quality and asset fidelity: unchanged; no assets were added or replaced.
- Copy and content: unchanged.

## Interaction and runtime verification

- Fresh renderer reload with review closed: passed.
- Review open animation and final three-panel layout: passed.
- Review close animation and restored content width: passed.
- Bottom horizontal scrollbar absent in all three settled captures: passed.
- Targeted tests: `13` passed, `0` failed.
- Electron TypeScript typecheck, targeted ESLint, and renderer production build:
  passed.

final result: passed

---

# Primary Rail Edge Spacing QA

- Source annotations:
  - `/var/folders/sp/f2l8jmkx1bx_d4j8msxvlfpc0000gn/T/codex-clipboard-092451e5-f84d-4af7-bd75-55690a45ca24.png`
  - `/var/folders/sp/f2l8jmkx1bx_d4j8msxvlfpc0000gn/T/codex-clipboard-156d25bf-f6d0-4d69-884e-e335d187f9cd.png`
- Implementation captures:
  - Before: `/var/folders/sp/f2l8jmkx1bx_d4j8msxvlfpc0000gn/T/com.openai.sky.CUAService/Electron Screenshot 2026-08-02 at 9.45.31 AM.jpeg`
  - After: `/var/folders/sp/f2l8jmkx1bx_d4j8msxvlfpc0000gn/T/com.openai.sky.CUAService/Electron Screenshot 2026-08-02 at 9.46.42 AM.jpeg`
  - Workspace menu open: `/var/folders/sp/f2l8jmkx1bx_d4j8msxvlfpc0000gn/T/com.openai.sky.CUAService/Electron Screenshot 2026-08-02 at 9.46.53 AM.jpeg`
- Combined comparison: `/private/tmp/craftagent-panel-edge-spacing-comparison.jpg`
- Source pixels: `340 x 1528` and `846 x 246`; implementation viewport `884 x 768`; comparison canvas `1700 x 900`.
- State: desktop session detail with the primary rail open; workspace switcher checked in both closed and menu-open states.

## Findings and fixes

1. **P1 fixed — a visible 6px gutter separated the primary rail from the main workspace.** The shared panel stack still applied its generic inter-panel gap after the second-column removal. The primary-rail seam now cancels that gap while review-panel spacing remains unchanged.
2. **P1 fixed — the rail exposed both its vertical scrollbar and the panel stack's horizontal scrollbar.** Both surfaces retain scrolling behavior but use the existing hidden-scrollbar utility; horizontal overflow inside the rail is clipped.
3. **P1 fixed — the bottom workspace/help module used a second 6px horizontal inset plus 4px bottom padding inside the shell's existing 6px edge inset.** The redundant footer inset is removed. Its visible background now starts at the same 6px left edge and ends at the same 6px bottom edge used by the top, right, and bottom workspace surfaces.
4. The right-review sizing calculation now measures the actual zero-gap primary-rail seam, preventing the removed gutter from continuing to reduce available content width invisibly.

## Required fidelity surfaces

- Fonts and typography: unchanged.
- Spacing and layout rhythm: passed. The window keeps one `6px` outer inset on all four sides; the primary rail/main surface seam is `0px`; the workspace/help module no longer adds a second outer inset.
- Colors and visual tokens: unchanged.
- Image quality and asset fidelity: unchanged.
- Copy and content: unchanged.

## Interaction and runtime verification

- Primary rail/main surface seam: passed, `0px` visible gutter.
- Rail vertical scrollbar: hidden while content remains scrollable.
- Panel-stack horizontal scrollbar: hidden while overflow behavior remains available.
- Workspace/help row closed and menu-open states: passed.
- Right review open/close after available-width adjustment: passed.
- Targeted tests: `21` passed, `0` failed.
- Electron TypeScript typecheck: passed.
- Renderer production build: passed; existing large-chunk warning remains.
- Diff whitespace validation: passed.

final result: passed

---

# Sidebar Brand-to-Stoplight Alignment QA

- CraftAgent issue capture: `/var/folders/sp/f2l8jmkx1bx_d4j8msxvlfpc0000gn/T/codex-clipboard-68c35512-589a-46ef-83ca-dc8fd0b12009.png`
- Codex reference crop: `/var/folders/sp/f2l8jmkx1bx_d4j8msxvlfpc0000gn/T/codex-clipboard-635a1831-fd97-4010-b4f7-4464736df8c0.png`
- Implementation capture: `/var/folders/sp/f2l8jmkx1bx_d4j8msxvlfpc0000gn/T/com.openai.sky.CUAService/Electron Screenshot 2026-08-02 at 10.16.44 AM.jpeg`
- Combined comparison: `/private/tmp/craftagent-brand-stoplight-alignment-comparison.jpg`
- State: macOS desktop, session navigation mode, mode-switch button closed.

## Findings and fix

1. **P1 fixed — the `Craft` word started about 8 CSS pixels to the right of the red traffic light's left edge.** The header wrapper contributed an extra `8px` left inset outside the mode button's existing `12px` internal padding.
2. The wrapper's left inset is removed while its right inset is preserved. This moves the label and its hover/selected surface left as one unit, exactly matching the reference behavior where the surface may extend beyond the label alignment line.
3. Search, notifications, primary navigation glyphs, session rows, project rows, and footer controls are unchanged.

## Required fidelity surfaces

- Fonts and typography: unchanged.
- Spacing and layout rhythm: passed. The `Craft` label's left edge now follows the red traffic light's left edge; the mode-button background is intentionally allowed to extend farther left.
- Colors and visual tokens: unchanged.
- Image and icon fidelity: unchanged.
- Copy and content: unchanged.

## Interaction and runtime verification

- Reference and implementation side-by-side visual comparison: passed.
- Mode-switch button hit target and menu wiring: preserved.
- Targeted sidebar and panel tests: `21` passed, `0` failed.
- Electron TypeScript typecheck: passed.
- Renderer production build: passed; existing large-chunk warning remains.
- Diff whitespace validation: passed.

final result: passed

---

# Sidebar Dual-Axis Hierarchy QA

- ChatGPT reference: `/var/folders/sp/f2l8jmkx1bx_d4j8msxvlfpc0000gn/T/codex-clipboard-80eae4b5-4c90-47b3-a119-bc7c2172efb7.png`
- CraftAgent annotated issue capture: `/var/folders/sp/f2l8jmkx1bx_d4j8msxvlfpc0000gn/T/codex-clipboard-6d4aedc8-0962-4fdb-b4de-6f472d27e6be.png`
- Implementation capture: `/var/folders/sp/f2l8jmkx1bx_d4j8msxvlfpc0000gn/T/com.openai.sky.CUAService/Electron Screenshot 2026-08-02 at 1.38.54 PM.jpeg`
- Combined comparison: `/private/tmp/craftagent-sidebar-dual-axis-comparison.jpg`
- State: macOS desktop, populated session navigation, one expanded project, selected recent session.

## Findings and fixes

1. **P1 fixed — recent and pinned session titles used the icon axis instead of the content-text axis.** All text-only session rows now begin on the same axis as primary navigation labels and project names.
2. **P1 fixed — project child sessions and overflow actions used an additional inconsistent indent.** Project children now share their parent project's text axis, matching the reference hierarchy.
3. **P1 fixed — section labels were offset from the traffic-light/icon axis.** Section labels now align with the red traffic light's left edge, navigation glyphs, folder glyphs, and the brand label.
4. Browser hierarchy follows the same rule: top-level tab favicons use the icon axis, while nested bookmark content uses the content axis.

## Required fidelity surfaces

- Fonts and typography: unchanged.
- Spacing and hierarchy: passed. The rail now uses two deliberate axes rather than one global inset: traffic-light/icon/section-label axis and navigation/project/session text axis.
- Selection surfaces: preserve the full available row width and may extend left of the text axis.
- Colors, icons, avatars, copy, and content: unchanged.

## Interaction and runtime verification

- Full-height reference/implementation comparison: passed.
- Populated project, child session, section label, selected session, and footer states: passed.
- Targeted sidebar and panel tests: `21` passed, `0` failed.
- Electron TypeScript typecheck: passed.
- Renderer production build: passed; existing large-chunk warning remains.
- Diff whitespace validation: passed.

final result: passed
