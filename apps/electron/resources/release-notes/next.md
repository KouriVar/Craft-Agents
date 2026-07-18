# Pending Release Notes

This file accumulates release notes for the next unreleased version. PRs that add user-visible behavior should append a bullet to the relevant section here. Versioned files (`X.Y.Z.md`) are owned by the release skill — never create them in feature commits.

## New Features

## Improvements

## Bug Fixes

- 新标签页输入框改由 Craft Agents 主界面直接渲染，回车访问后才显示原生浏览器页面，从架构上消除 Windows x64、Windows ARM 虚拟机与 macOS 的原生焦点、输入法和空白表面问题。
- 修复原生浏览器页面获得焦点后仍重复导航到当前标签页、导致浏览器表面重新挂载并在短暂延迟后丢失输入焦点的问题。
- 合并并发的空白标签创建请求，避免恢复、新建或连续点击时产生重复“新标签页”。

## Breaking Changes
