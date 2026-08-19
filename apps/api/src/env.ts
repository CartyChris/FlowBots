import { resolveAuthSecret, resolveEncryptionKey, resolveSupervisorToken } from "@rakazo/core";
import type { MnemosyneMode } from "@rakazo/memory";

export interface AppEnv {
  databaseUrl: string;
  realtimeDatabaseUrl: string;
  authSecret: string;
  authUrl: string;
  webOrigin: string;
  apiUrl: string;
  signupsEnabled: string | undefined;
  signupAllowlist: string | undefined;
  encryptionKey: string;
  dataDir: string;
  sandboxSupervisorUrl: string;
  sandboxSupervisorToken: string;
  sandboxProvider: string;
  agentRuntime: string;
  openRouterKey: string | undefined;
  ollamaBaseUrl: string;
  e2bApiKey: string | undefined;
  composioApiKey: string | undefined;
  defaultProvider: string;
  defaultModel: string;
  wakeupDriver: string;
  mnemosyneMode: MnemosyneMode;
  mnemosyneCommand: string;
  mnemosyneTimeoutMs: number;
  port: number;
}

export function loadEnv(
  source: NodeJS.ProcessEnv = process.env,
  overrides: Partial<AppEnv> = {},
): AppEnv {
  const databaseUrl = overrides.databaseUrl ?? required(source, "DATABASE_URL");
  const authSecret = overrides.authSecret ?? resolveAuthSecret(source);
  const mnemosyneMode = resolveMnemosyneMode(overrides.mnemosyneMode ?? source.MNEMOSYNE_MODE);
  const mnemosyneTimeoutMs = resolveBoundedInteger(
    "MNEMOSYNE_TIMEOUT_MS",
    overrides.mnemosyneTimeoutMs ?? source.MNEMOSYNE_TIMEOUT_MS ?? 5000,
    500,
    60_000,
  );
  return {
    databaseUrl,
    realtimeDatabaseUrl:
      overrides.realtimeDatabaseUrl ?? source.REALTIME_DATABASE_URL ?? databaseUrl,
    authSecret,
    authUrl:
      overrides.authUrl ?? source.BETTER_AUTH_URL ?? source.WEB_ORIGIN ?? "http://127.0.0.1:5173",
    webOrigin: overrides.webOrigin ?? source.WEB_ORIGIN ?? "http://127.0.0.1:5173",
    apiUrl: overrides.apiUrl ?? source.API_URL ?? "http://127.0.0.1:3100",
    signupsEnabled: overrides.signupsEnabled ?? source.SIGNUPS_ENABLED,
    signupAllowlist: overrides.signupAllowlist ?? source.SIGNUP_ALLOWLIST,
    encryptionKey: overrides.encryptionKey ?? resolveEncryptionKey(source),
    dataDir: overrides.dataDir ?? source.DATA_DIR ?? "./data",
    sandboxSupervisorUrl:
      overrides.sandboxSupervisorUrl ?? source.SANDBOX_SUPERVISOR_URL ?? "http://127.0.0.1:7091",
    sandboxSupervisorToken: overrides.sandboxSupervisorToken ?? resolveSupervisorToken(source),
    sandboxProvider: overrides.sandboxProvider ?? source.SANDBOX_PROVIDER ?? "docker",
    agentRuntime: overrides.agentRuntime ?? source.AGENT_RUNTIME ?? "pi",
    openRouterKey: overrides.openRouterKey ?? source.OPENROUTER_API_KEY,
    ollamaBaseUrl: overrides.ollamaBaseUrl ?? source.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434",
    e2bApiKey: overrides.e2bApiKey ?? source.E2B_API_KEY,
    composioApiKey: overrides.composioApiKey ?? source.COMPOSIO_API_KEY,
    defaultProvider: overrides.defaultProvider ?? source.PI_DEFAULT_PROVIDER ?? "openrouter",
    defaultModel:
      overrides.defaultModel ?? source.PI_DEFAULT_MODEL ?? "deepseek/deepseek-v4-flash-0731",
    wakeupDriver: overrides.wakeupDriver ?? source.WAKEUP_DRIVER ?? "graphile",
    mnemosyneMode,
    mnemosyneCommand: resolveCommand(
      overrides.mnemosyneCommand ?? source.MNEMOSYNE_COMMAND ?? "mnemosyne",
    ),
    mnemosyneTimeoutMs,
    port: overrides.port ?? Number(source.API_PORT ?? 3100),
  };
}

function required(source: NodeJS.ProcessEnv, key: string): string {
  const value = source[key];
  if (!value) throw new Error(`Missing ${key}`);
  return value;
}

function resolveMnemosyneMode(value: string | undefined): MnemosyneMode {
  const mode = value?.trim() || "auto";
  if (mode === "auto" || mode === "off" || mode === "required") return mode;
  throw new Error("MNEMOSYNE_MODE must be auto, off, or required");
}

function resolveCommand(value: string): string {
  const command = value.trim();
  if (!command) throw new Error("MNEMOSYNE_COMMAND must not be empty");
  return command;
}

function resolveBoundedInteger(
  name: string,
  value: string | number,
  min: number,
  max: number,
): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return parsed;
}
