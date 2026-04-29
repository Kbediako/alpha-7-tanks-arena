import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

const configDir = dirname(fileURLToPath(import.meta.url));

loadEnv({ path: resolve(configDir, "../../../.env") });
loadEnv({ path: resolve(configDir, "../.env") });

const numberFromEnv = (name: string, fallback: number): number => {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const booleanFromEnv = (name: string, fallback: boolean): boolean => {
  const raw = process.env[name];
  if (!raw) return fallback;
  return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
};

const publicClientUrl = process.env.PUBLIC_CLIENT_URL ?? "http://localhost:5173";
const allowedOrigins = Array.from(
  new Set(
    (process.env.ALLOWED_ORIGINS ?? "http://localhost:5173,http://127.0.0.1:5173")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean)
      .concat(publicClientUrl)
  )
);

export const serverConfig = {
  port: numberFromEnv("PORT", 2567),
  nodeEnv: process.env.NODE_ENV ?? "development",
  allowedOrigins,
  publicClientUrl,
  maxPlayers: numberFromEnv("MAX_PLAYERS", 12),
  demoMaxPlayers: numberFromEnv("DEMO_MAX_PLAYERS", 8),
  roomTickRate: numberFromEnv("ROOM_TICK_RATE", 30),
  roomPatchRate: numberFromEnv("ROOM_PATCH_RATE", 20),
  roomAutoStartSeconds: numberFromEnv("ROOM_AUTO_START_SECONDS", 12),
  enableBots: booleanFromEnv("ENABLE_BOTS", false),
  logLevel: process.env.LOG_LEVEL ?? "info",
  buildVersion: process.env.npm_package_version ?? "0.1.0"
} as const;

export type ServerConfig = typeof serverConfig;
