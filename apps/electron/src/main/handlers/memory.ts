/**
 * Memory IPC handlers
 *
 * Wire up the Gateway Manager with renderer-side settings UI.
 * These use ipcMain.invoke / ipcRenderer.invoke (Electron IPC).
 */

import { ipcMain } from "electron";
import {
  getGatewayConfig,
  setGatewayConfig,
  type MemoryGatewayStatus,
  type MemorySettings,
} from "../../shared/memory-settings";
import {
  startGateway,
  stopGateway,
  restartGateway,
  refreshGatewayHealth,
  isGatewayRunning,
} from "../gateway-manager";

export function registerMemoryIpcHandlers(): void {
  // Get current settings
  ipcMain.handle("memory:getConfig", async (): Promise<MemorySettings> => {
    return getGatewayConfig();
  });

  // Save settings and restart Gateway
  ipcMain.handle("memory:setConfig", async (_event, settings: MemorySettings): Promise<void> => {
    setGatewayConfig(settings);

    if (settings.enabled && settings.deepseekApiKey) {
      await restartGateway();
    } else {
      await stopGateway();
    }
  });

  // Get Gateway health status
  ipcMain.handle("memory:getStatus", async (): Promise<MemoryGatewayStatus> => {
    if (!isGatewayRunning()) return "stopped";
    return refreshGatewayHealth();
  });
}
