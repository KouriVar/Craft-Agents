import { app } from "electron";
import * as fs from "fs";
import * as path from "path";
import { z } from "zod";

const memorySettingsSchema = z.object({
  enabled: z.boolean().default(false),
  deepseekApiKey: z.string().default(""),
  deepseekModel: z.string().default("deepseek-chat"),
  deepseekBaseUrl: z.string().default("https://api.deepseek.com/v1"),
  embeddingApiKey: z.string().default(""),
  embeddingProvider: z.string().default(""),
  embeddingModel: z.string().default(""),
  embeddingBaseUrl: z.string().default(""),
});

export interface MemorySettings {
  readonly enabled: boolean;
  readonly deepseekApiKey: string;
  readonly deepseekModel: string;
  readonly deepseekBaseUrl: string;
  readonly embeddingApiKey: string;
  readonly embeddingProvider: string;
  readonly embeddingModel: string;
  readonly embeddingBaseUrl: string;
}

const DEFAULT_SETTINGS: MemorySettings = {
  enabled: false,
  deepseekApiKey: "",
  deepseekModel: "deepseek-chat",
  deepseekBaseUrl: "https://api.deepseek.com/v1",
  embeddingApiKey: "",
  embeddingProvider: "",
  embeddingModel: "",
  embeddingBaseUrl: "",
};

let cachedSettings: MemorySettings | null = null;

function getConfigPath(): string {
  const userData = app.getPath("userData");
  return path.join(userData, "memory-settings.json");
}

function parseMemorySettings(raw: unknown): MemorySettings {
  return memorySettingsSchema.parse(raw);
}

function readMemorySettingsFile(configPath: string): MemorySettings {
  const raw = fs.readFileSync(configPath, "utf-8");
  return parseMemorySettings(JSON.parse(raw));
}

export function getGatewayConfig(): MemorySettings {
  if (cachedSettings) return cachedSettings;

  try {
    const configPath = getConfigPath();
    if (fs.existsSync(configPath)) {
      cachedSettings = readMemorySettingsFile(configPath);
    } else {
      cachedSettings = { ...DEFAULT_SETTINGS };
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error("[memory-settings] Failed to load config:", error.message);
    } else {
      throw error;
    }
    cachedSettings = { ...DEFAULT_SETTINGS };
  }

  return cachedSettings;
}

export function setGatewayConfig(settings: Partial<MemorySettings>): MemorySettings {
  const current = getGatewayConfig();
  cachedSettings = parseMemorySettings({ ...current, ...settings });

  try {
    const configPath = getConfigPath();
    const dir = path.dirname(configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(configPath, JSON.stringify(cachedSettings, null, 2), "utf-8");
  } catch (err) {
    if (err instanceof Error) {
      console.error("[memory-settings] Failed to save config:", err.message);
    } else {
      throw err;
    }
  }

  return cachedSettings;
}

export type MemoryGatewayStatus = "ok" | "degraded" | "unreachable" | "stopped";

export function createMemorySettingsStore(configDir: string) {
  const configPath = path.join(configDir, "memory-settings.json");

  return {
    get(): MemorySettings {
      try {
        if (fs.existsSync(configPath)) {
          return readMemorySettingsFile(configPath);
        }
      } catch (error) {
        if (error instanceof Error) {
          console.error("[memory-settings] Failed to load:", error.message);
        } else {
          throw error;
        }
      }
      return { ...DEFAULT_SETTINGS };
    },
    set(settings: Partial<MemorySettings>): MemorySettings {
      const current = this.get();
      const merged = parseMemorySettings({ ...current, ...settings });
      try {
        const dir = path.dirname(configPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(configPath, JSON.stringify(merged, null, 2), "utf-8");
      } catch (err) {
        if (err instanceof Error) {
          console.error("[memory-settings] Failed to save:", err.message);
        } else {
          throw err;
        }
      }
      return merged;
    },
  };
}
