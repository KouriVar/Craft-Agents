# Pending Release Notes

This file accumulates release notes for the next unreleased version. PRs that add user-visible behavior should append a bullet to the relevant section here. Versioned files (`X.Y.Z.md`) are owned by the release skill — never create them in feature commits.

## Features

- **TencentDB Agent Memory guide**: Added built-in source setup documentation for TencentDB Agent Memory (OpenClaw plugin + Hermes Gateway sidecar path). See `tencentdb-agent-memory.md`.

## Improvements

## Bug Fixes

- **macOS Dock icon consistency**: Packaged macOS builds now use `icon.icns` consistently and remove the macOS 26 asset catalog reference that could make the Dock icon change appearance after launch. Fixes #737.

## Breaking Changes
