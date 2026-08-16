import { runCliProcess } from "./cli-agent.js";
import type { HarnessDefinition, HarnessProbe } from "./harness-registry.js";

export interface HermesModelRef {
  provider: string;
  model: string;
}

export interface HermesMoaPreset {
  id: string;
  references: HermesModelRef[];
  aggregator: HermesModelRef;
  maxTokens?: number;
  referenceTemperature?: number;
  aggregatorTemperature?: number;
  enabled: boolean;
}

export interface HermesMoaConfig {
  defaultPreset?: string;
  presets: HermesMoaPreset[];
}

export interface HermesMoaVirtualModel {
  provider: "hermes-moa";
  id: string;
  name: string;
  aggregator: HermesModelRef;
  references: HermesModelRef[];
  default: boolean;
}

export function normalizeHermesMoaConfig(input: unknown): HermesMoaConfig {
  const root = record(input, "Hermes MoA config");
  const rawPresets = record(root.presets ?? {}, "Hermes MoA presets");
  const presets = Object.entries(rawPresets).map(([id, raw]) => normalizePreset(id, raw));
  const defaultPreset = optionalString(root.default_preset);
  if (defaultPreset && !presets.some((preset) => preset.id === defaultPreset)) {
    throw new Error(`Hermes MoA default preset "${defaultPreset}" does not exist`);
  }
  return {
    ...(defaultPreset ? { defaultPreset } : {}),
    presets,
  };
}

export function hermesMoaVirtualModels(config: HermesMoaConfig): HermesMoaVirtualModel[] {
  return config.presets
    .filter((preset) => preset.enabled)
    .map((preset) => ({
      provider: "hermes-moa" as const,
      id: preset.id,
      name: `MoA: ${preset.id}`,
      aggregator: { ...preset.aggregator },
      references: preset.references.map((reference) => ({ ...reference })),
      default: preset.id === config.defaultPreset,
    }));
}

function normalizePreset(id: string, value: unknown): HermesMoaPreset {
  const raw = record(value, `Hermes MoA preset ${id}`);
  if (!Array.isArray(raw.reference_models)) {
    throw new Error(`Hermes MoA preset "${id}" reference_models must be an array`);
  }
  const references = raw.reference_models.map((reference, index) =>
    normalizeModelRef(reference, `${id} reference ${index + 1}`),
  );
  if (references.length === 0) {
    throw new Error(`Hermes MoA preset "${id}" requires at least one reference model`);
  }
  const aggregator = normalizeModelRef(raw.aggregator, `${id} aggregator`);
  return {
    id,
    references,
    aggregator,
    ...(positiveInteger(raw.max_tokens) ? { maxTokens: positiveInteger(raw.max_tokens) } : {}),
    ...(finiteNumber(raw.reference_temperature) !== undefined
      ? { referenceTemperature: finiteNumber(raw.reference_temperature) }
      : {}),
    ...(finiteNumber(raw.aggregator_temperature) !== undefined
      ? { aggregatorTemperature: finiteNumber(raw.aggregator_temperature) }
      : {}),
    enabled: raw.enabled !== false,
  };
}

function normalizeModelRef(value: unknown, label: string): HermesModelRef {
  const raw = record(value, `Hermes MoA ${label}`);
  const provider = requiredString(raw.provider, `${label} provider`);
  const model = requiredString(raw.model, `${label} model`);
  return { provider, model };
}

export interface HermesInvocation {
  command: "hermes";
  args: string[];
}

export interface HermesServeOptions {
  host?: string;
  port?: number;
  profile?: string;
  insecure?: boolean;
  skipBuild?: boolean;
}

export function buildHermesServeInvocation(options: HermesServeOptions = {}): HermesInvocation {
  const args: string[] = [];
  if (options.profile) args.push("-p", options.profile);
  args.push("serve");
  if (options.host) args.push("--host", options.host);
  if (options.port !== undefined) args.push("--port", String(validPort(options.port)));
  if (options.insecure) args.push("--insecure");
  if (options.skipBuild) args.push("--skip-build");
  return { command: "hermes", args };
}

export type HermesGatewayAction = "run" | "start" | "stop" | "restart" | "status" | "list";

export function buildHermesGatewayInvocation(
  action: HermesGatewayAction,
  profile?: string,
): HermesInvocation {
  const args: string[] = [];
  if (profile) args.push("-p", profile);
  args.push("gateway", action);
  return { command: "hermes", args };
}

export function buildHermesChatInvocation(options: {
  profile?: string;
  prompt?: string;
  provider?: string;
  model?: string;
} = {}): HermesInvocation {
  const args: string[] = [];
  if (options.profile) args.push("-p", options.profile);
  args.push("chat");
  if (options.provider) args.push("--provider", options.provider);
  if (options.model) args.push("--model", options.model);
  if (options.prompt) args.push(options.prompt);
  return { command: "hermes", args };
}

export function hermesHarnessDefinitions(
  probe: () => Promise<HarnessProbe> = defaultHermesProbe,
): HarnessDefinition[] {
  return [
    {
      id: "hermes",
      label: "Hermes Agent",
      kind: "cli",
      interactions: ["chat", "headless"],
      workspacePolicies: ["read-only", "workspace-write", "container"],
      scheduleable: true,
      resident: false,
      outerVerificationRequired: true,
      probe,
    },
    {
      id: "hermes-serve",
      label: "Hermes Server",
      kind: "rpc",
      interactions: ["rpc", "http"],
      workspacePolicies: ["read-only", "workspace-write", "container"],
      scheduleable: true,
      resident: true,
      outerVerificationRequired: true,
      probe,
    },
    {
      id: "hermes-gateway",
      label: "Hermes Gateway",
      kind: "cli",
      interactions: ["chat", "http"],
      workspacePolicies: ["read-only", "workspace-write", "container"],
      scheduleable: true,
      resident: true,
      outerVerificationRequired: true,
      probe,
    },
  ];
}

export async function defaultHermesProbe(): Promise<HarnessProbe> {
  const result = await runCliProcess({
    command: "hermes",
    args: ["--version"],
    cwd: process.cwd(),
    timeoutMs: 5_000,
    maxOutputBytes: 64 * 1024,
  });
  const output = `${result.stdout}\n${result.stderr}`.trim();
  if (result.code !== 0 || result.timedOut || result.aborted) {
    return {
      available: false,
      detail: output || (result.timedOut ? "Hermes version probe timed out" : "Hermes is unavailable"),
    };
  }
  return {
    available: true,
    ...(output ? { version: output.split(/\r?\n/)[0] } : {}),
    capabilities: {
      chat: true,
      moa: true,
      gateway: true,
      serve: true,
      profiles: true,
      cron: true,
      mcp: true,
      delegation: true,
      memory: true,
      outerVerificationRequired: true,
    },
  };
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required`);
  return value.trim();
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function positiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function validPort(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > 65535) throw new Error("Hermes port is invalid");
  return value;
}
