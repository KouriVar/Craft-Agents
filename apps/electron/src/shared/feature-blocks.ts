import { app } from "electron";
import * as fs from "fs";
import * as path from "path";
import { z } from "zod";

const featureBlockSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  url: z.string().url(),
  pinned: z.boolean().default(true),
});

const featureBlocksConfigSchema = z.object({
  blocks: z.array(featureBlockSchema),
});

export interface FeatureBlock {
  readonly id: string;
  readonly title: string;
  readonly url: string;
  readonly pinned: boolean;
}

export interface FeatureBlocksConfig {
  readonly blocks: readonly FeatureBlock[];
}

const DEFAULT_CONFIG: FeatureBlocksConfig = {
  blocks: [
    {
      id: "figma",
      title: "Figma",
      url: "https://www.figma.com/files/recents-and-sharing/recently-viewed",
      pinned: true,
    },
  ],
};

let cachedConfig: FeatureBlocksConfig | null = null;

function getConfigPath(): string {
  const userData = app.getPath("userData");
  return path.join(userData, "feature-blocks.json");
}

function parseFeatureBlocksConfig(raw: unknown): FeatureBlocksConfig {
  return featureBlocksConfigSchema.parse(raw);
}

function readFeatureBlocksFile(configPath: string): FeatureBlocksConfig {
  const raw = fs.readFileSync(configPath, "utf-8");
  return parseFeatureBlocksConfig(JSON.parse(raw));
}

export function getFeatureBlocksConfig(): FeatureBlocksConfig {
  if (cachedConfig) return cachedConfig;

  try {
    const configPath = getConfigPath();
    cachedConfig = fs.existsSync(configPath)
      ? readFeatureBlocksFile(configPath)
      : { ...DEFAULT_CONFIG, blocks: [...DEFAULT_CONFIG.blocks] };
  } catch (error) {
    if (error instanceof Error) {
      console.error("[feature-blocks] Failed to load config:", error.message);
    } else {
      throw error;
    }
    cachedConfig = { ...DEFAULT_CONFIG, blocks: [...DEFAULT_CONFIG.blocks] };
  }

  return cachedConfig;
}

export function setFeatureBlocksConfig(config: FeatureBlocksConfig): FeatureBlocksConfig {
  cachedConfig = parseFeatureBlocksConfig(config);

  try {
    const configPath = getConfigPath();
    const dir = path.dirname(configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(configPath, JSON.stringify(cachedConfig, null, 2), "utf-8");
  } catch (error) {
    if (error instanceof Error) {
      console.error("[feature-blocks] Failed to save config:", error.message);
    } else {
      throw error;
    }
  }

  return cachedConfig;
}
