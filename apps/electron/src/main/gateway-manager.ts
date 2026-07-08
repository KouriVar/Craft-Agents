/**
 * TDAI Gateway Manager
 *
 * Manages the TDAI Gateway child process lifecycle from the Electron main process.
 *
 * Responsibilities:
 * 1. Start/stop the Gateway subprocess
 * 2. Write gateway config from user settings
 * 3. Health check loop
 * 4. Auto-restart on crash
 */

import { spawn, type ChildProcess } from "child_process";
import * as path from "path";
import * as fs from "fs";
import { app } from "electron";
import { getGatewayConfig, type MemorySettings } from "../shared/memory-settings";

const TAG = "[gateway-manager]";
const GATEWAY_PORT = 8420;
const HEALTH_CHECK_INTERVAL_MS = 30_000; // every 30 seconds
const RESTART_DELAY_MS = 2_000;

let child: ChildProcess | null = null;
let healthCheckTimer: ReturnType<typeof setInterval> | null = null;
let restartAttempts = 0;
const MAX_RESTART_ATTEMPTS = 3;

// ============================
// Config file generation
// ============================

function getAppDataDir(): string {
  // Use Electron's userData directory
  const userData = app.getPath("userData");
  return path.join(userData, "memory");
}

function getGatewayScriptPath(): string {
  if (app.isPackaged) {
    // electron-builder files: pattern puts resources/ → Resources/resources/
    return path.join(process.resourcesPath, "resources", "tdai-gateway", "gateway-server.cjs");
  }
  // Development: use the TencentDB project's compiled output
  // Adjust this path to match your local setup
  return path.join(
    app.getAppPath(),
    "..", "..", "..", "..",
    "助理目录", "Craft Agent", "TencentDB-Agent-Memory",
    "scripts", "dist", "gateway-server.cjs"
  );
}

function generateGatewayConfig(settings: MemorySettings): string {
  const dataDir = getAppDataDir();

  const yaml = [
    "server:",
    `  port: ${GATEWAY_PORT}`,
    "  host: \"127.0.0.1\"",
    "",
    "data:",
    `  baseDir: \"${dataDir}\"`,
    "",
    "llm:",
    `  baseUrl: \"${settings.deepseekBaseUrl}\"`,
    `  apiKey: \"${settings.deepseekApiKey}\"`,
    `  model: \"${settings.deepseekModel}\"`,
    "  maxTokens: 4096",
    "  timeoutMs: 120000",
    "",
    "memory:",
    "  timezone: \"Asia/Shanghai\"",
    "  storeBackend: \"sqlite\"",
    "",
    "  recall:",
    "    strategy: \"keyword\"",
    "    maxResults: 5",
    "    scoreThreshold: 0.0",
    "",
    "  capture:",
    "    enabled: true",
    "",
    "  extraction:",
    "    enabled: true",
    "",
    "  embedding:",
    "    enabled: false",
    "    provider: \"none\"",
    "",
    "  pipeline:",
    "    everyNConversations: 5",
    "    enableWarmup: true",
    "",
    "  bm25:",
    "    enabled: true",
    "    language: \"zh\"",
  ];

  // If embedding key is provided, enable hybrid mode
  if (settings.embeddingApiKey) {
    const embeddingProvider = settings.embeddingProvider || "openai";
    const embeddingBaseUrl = settings.embeddingBaseUrl || "https://api.openai.com/v1";
    const embeddingModel = settings.embeddingModel || "text-embedding-3-small";
    const embedIdx = yaml.findIndex(line => line.includes("embedding:"));
    if (embedIdx >= 0) {
      yaml[embedIdx + 1] = "    enabled: true";
      yaml[embedIdx + 2] = `    provider: \"${embeddingProvider}\"`;
      // Add apiKey, baseUrl, model, dimensions based on provider
      yaml.splice(embedIdx + 3, 0,
        `    apiKey: \"${settings.embeddingApiKey}\"`,
        `    baseUrl: \"${embeddingBaseUrl}\"`,
        `    model: \"${embeddingModel}\"`,
        "    dimensions: 1536",
      );
      // Update recall strategy
      const recallIdx = yaml.findIndex(line => line.includes("strategy:"));
      if (recallIdx >= 0) {
        yaml[recallIdx] = "    strategy: \"hybrid\"";
      }
    }
  }

  return yaml.join("\n") + "\n";
}

// ============================
// Gateway lifecycle
// ============================

export function getGatewayPort(): number {
  return GATEWAY_PORT;
}

export function getGatewayHealthUrl(): string {
  return `http://127.0.0.1:${GATEWAY_PORT}/health`;
}

export function isGatewayRunning(): boolean {
  return child !== null && child.exitCode === null;
}

export async function startGateway(): Promise<void> {
  if (child && child.exitCode === null) {
    console.info(`${TAG} Gateway already running`);
    return;
  }

  const settings = getGatewayConfig();
  if (!settings.enabled) {
    console.info(`${TAG} Memory is disabled, skipping Gateway start`);
    return;
  }

  if (!settings.deepseekApiKey) {
    console.warn(`${TAG} DeepSeek API key not set, cannot start Gateway`);
    return;
  }

  // 1. Ensure data directory exists
  const dataDir = getAppDataDir();
  fs.mkdirSync(dataDir, { recursive: true });

  // 2. Write config file
  const configPath = path.join(dataDir, "tdai-gateway.yaml");
  const configYaml = generateGatewayConfig(settings);
  fs.writeFileSync(configPath, configYaml, "utf-8");
  console.info(`${TAG} Config written to ${configPath}`);

  // 3. Copy BM25 data files (needed by tcvdb-text bundled inside gateway-server.cjs)
  const scriptPath = getGatewayScriptPath();
  const scriptDir = path.dirname(scriptPath);
  const dataDst = path.join(path.dirname(scriptDir), "data");
  if (!fs.existsSync(dataDst)) {
    // Copy from the resources/tdai-gateway/data/ directory
    const dataSrc = path.join(path.dirname(scriptPath), "..", "data");
    if (fs.existsSync(dataSrc)) {
      fs.cpSync(dataSrc, dataDst, { recursive: true });
      console.info(`${TAG} Copied BM25 data files to ${dataDst}`);
    }
  }

  // 4. Spawn Gateway process
  console.info(`${TAG} Starting Gateway: node ${scriptPath}`);
  console.info(`${TAG} CWD: ${path.dirname(scriptPath)}`);

  child = spawn("node", [scriptPath], {
    cwd: path.dirname(scriptPath),
    env: {
      ...process.env,
      TDAI_GATEWAY_CONFIG: configPath,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout?.on("data", (data: Buffer) => {
    console.info(`${TAG} [stdout] ${data.toString().trim()}`);
  });

  child.stderr?.on("data", (data: Buffer) => {
    console.error(`${TAG} [stderr] ${data.toString().trim()}`);
  });

  child.on("exit", (code, signal) => {
    console.warn(`${TAG} Gateway exited (code=${code}, signal=${signal})`);
    child = null;

    // Auto-restart on crash (unless shutdown was intentional)
    if (code !== 0 && restartAttempts < MAX_RESTART_ATTEMPTS) {
      restartAttempts++;
      console.warn(`${TAG} Auto-restarting in ${RESTART_DELAY_MS}ms (attempt ${restartAttempts}/${MAX_RESTART_ATTEMPTS})`);
      setTimeout(() => {
        startGateway().catch((err) => {
          console.error(`${TAG} Restart failed:`, err);
        });
      }, RESTART_DELAY_MS);
    }
  });

  child.on("error", (err) => {
    console.error(`${TAG} Failed to start Gateway:`, err.message);
    child = null;
  });

  // 5. Start health check loop
  if (!healthCheckTimer) {
    healthCheckTimer = setInterval(() => {
      void refreshGatewayHealth();
    }, HEALTH_CHECK_INTERVAL_MS);
  }

  restartAttempts = 0;
}

export async function stopGateway(): Promise<void> {
  if (healthCheckTimer) {
    clearInterval(healthCheckTimer);
    healthCheckTimer = null;
  }

  if (!child || child.exitCode !== null) return;

  console.info(`${TAG} Stopping Gateway...`);

  return new Promise<void>((resolve) => {
    if (!child) { resolve(); return; }

    const timeout = setTimeout(() => {
      console.warn(`${TAG} Gateway did not exit gracefully, force killing`);
      child?.kill("SIGKILL");
      resolve();
    }, 10_000);

    child.on("exit", () => {
      clearTimeout(timeout);
      child = null;
      resolve();
    });

    child.kill("SIGTERM");
  });
}

export async function restartGateway(): Promise<void> {
  console.info(`${TAG} Restarting Gateway...`);
  await stopGateway();
  await new Promise((r) => setTimeout(r, 1000));
  await startGateway();
}

// ============================
// Health check
// ============================

let lastHealthStatus: "ok" | "degraded" | "unreachable" = "unreachable";

export async function refreshGatewayHealth(): Promise<"ok" | "degraded" | "unreachable"> {
  try {
    const res = await fetch(getGatewayHealthUrl());
    if (res.ok) {
      const body = await res.json();
      lastHealthStatus = body.status === "ok" ? "ok" : "degraded";
    }
  } catch {
    lastHealthStatus = "unreachable";
    if (child && child.exitCode === null) {
      console.warn(`${TAG} Health check failed but process is alive`);
    }
  }

  return lastHealthStatus;
}

export function getLastHealthStatus(): "ok" | "degraded" | "unreachable" {
  return lastHealthStatus;
}
