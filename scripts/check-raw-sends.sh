#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
violations=()

while IFS= read -r match; do
  case "$match" in
    *"apps/electron/src/preload/bootstrap.ts"*"ipcRenderer.sendSync('__get-"*) ;;
    *"apps/electron/src/preload/bootstrap.ts"*"ipcRenderer.send('__transport:status'"*) ;;
    *"apps/electron/src/preload/bootstrap.ts"*"ipcRenderer.send('terminal:embedded:"*) ;;
    *"apps/electron/src/preload/terminal-preload.cjs"*"ipcRenderer.send('terminal:"*) ;;
    *"apps/electron/src/preload/browser-page.ts"*"ipcRenderer.send(CAPTURE_CHANNEL"*) ;;
    *) violations+=("$match") ;;
  esac
done < <(rg -n --glob '*.{ts,tsx,cjs}' 'ipcRenderer\.(send|sendSync)\(' apps/electron/src/preload apps/electron/src/renderer || true)

while IFS= read -r match; do
  case "$match" in
    *"apps/electron/src/main/window-manager.ts"*"window.webContents.send(channel,"*) ;;
    *"apps/electron/src/main/terminal-pane-manager.ts"*"webContents.send('terminal:"*) ;;
    *"apps/electron/src/main/browser-pane-manager.ts"*"webContents.send(TOOLBAR_CHANNELS."*) ;;
    *"apps/electron/src/main/browser-pane-manager.ts"*"webContents.send(ASK_AI_CHANNELS.STATE"*) ;;
    *"apps/electron/src/main/browser-pane-manager.ts"*"webContents.send('browser-credentials:fill'"*) ;;
    *"apps/electron/src/main/index.ts"*"webContents.send(RPC_CHANNELS.screenCapture."*) ;;
    *) violations+=("$match") ;;
  esac
done < <(rg -n --glob '*.ts' 'webContents\.send\(' apps/electron/src/main || true)

if (( ${#violations[@]} > 0 )); then
  echo "Raw IPC check failed. Route new application IPC through RPC_CHANNELS/event sinks or explicitly review the local preload channel:" >&2
  printf '  %s\n' "${violations[@]}" >&2
  exit 1
fi

echo "Raw IPC check OK (only reviewed bootstrap, terminal, browser-toolbar/new-tab, credential, and pre-handshake fallback channels remain)"
