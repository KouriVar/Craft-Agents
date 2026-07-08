import { ipcMain } from "electron";
import {
  getFeatureBlocksConfig,
  setFeatureBlocksConfig,
  type FeatureBlocksConfig,
} from "../../shared/feature-blocks";

export function registerFeatureBlocksIpcHandlers(): void {
  ipcMain.handle("featureBlocks:getConfig", async (): Promise<FeatureBlocksConfig> => {
    return getFeatureBlocksConfig();
  });

  ipcMain.handle("featureBlocks:setConfig", async (_event, config: FeatureBlocksConfig): Promise<FeatureBlocksConfig> => {
    return setFeatureBlocksConfig(config);
  });
}
