# Pending Release Notes

This file accumulates release notes for the next unreleased version. PRs that add user-visible behavior should append a bullet to the relevant section here. Versioned files (`X.Y.Z.md`) are owned by the release skill — never create them in feature commits.

## Improvements

- **Built-in interactive visualizations**: Craft Agent now ships with the `visualize` skill and its preview resources. It is available immediately after installation, stays updated with the app, and can still be overridden by a global, workspace, or project skill with the same name.
- **Inline visualization runtime**: Interactive charts, simulators, data explorers, and controls can now run directly inside assistant responses with adaptive sizing, theme support, and confirmed follow-up actions.
- **Cowart widget integration**: Cowart tool calls can open the project canvas directly in a review-sidebar tab and safely send confirmed follow-up messages back to the active session.
- **Package validation**: Desktop builds now verify every copied resource and required Electron artifact before packaging.

## Bug Fixes

- **macOS Dock icon consistency**: Packaged macOS builds now use `icon.icns` consistently and remove the macOS 26 asset catalog reference that could make the Dock icon change appearance after launch. Fixes #737.
- **Widget rendering consistency**: Inline visualizations now render in streaming and completed responses, preserve full-document HTML correctly, and grow beyond the previous height cutoff.
- **Theme-matched widget canvas**: Inline visualizations now blend their outer page canvas into the current Craft Agent theme instead of forcing a white iframe background, while preserving visualization-specific styles.
- **Edge-to-edge visualization content**: Removed the default root padding around generated visualization documents without changing spacing inside cards, charts, or controls.

## Breaking Changes
