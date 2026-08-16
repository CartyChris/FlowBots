import type { HarnessDefinition, HarnessProbe } from "./harness-registry.js";

export type PaperclipManagedAction = "onboard" | "run";

export interface PaperclipManagedInvocation {
  command: "npx";
  args: string[];
  cwd: string;
  env: { PAPERCLIP_HOME: string };
}

export function buildPaperclipManagedInvocation(
  action: PaperclipManagedAction,
  home: string,
): PaperclipManagedInvocation {
  const cwd = requiredString(home, "Paperclip home");
  return {
    command: "npx",
    args:
      action === "onboard"
        ? ["paperclipai", "onboard", "--yes"]
        : ["paperclipai", "run"],
    cwd,
    env: { PAPERCLIP_HOME: cwd },
  };
}

export function normalizePaperclipUrl(value: string): string {
  return normalizeServiceUrl(value, "Paperclip");
}

export interface PaperclipClientOptions {
  baseUrl: string;
  apiKey?: string;
  fetchFn?: typeof fetch;
}

export class PaperclipClient {
  readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly fetchFn: typeof fetch;

  constructor(options: PaperclipClientOptions) {
    this.baseUrl = normalizePaperclipUrl(options.baseUrl);
    this.apiKey = options.apiKey?.trim() || undefined;
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async probe(): Promise<HarnessProbe> {
    try {
      const response = await this.fetchFn(`${this.baseUrl}/api/health`, {
        method: "GET",
        headers: this.headers(),
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) {
        return { available: false, detail: `Paperclip answered HTTP ${response.status}` };
      }
      const body = (await response.json()) as Record<string, unknown>;
      if (body.status !== "ok") {
        return { available: false, detail: "Endpoint did not report Paperclip health status ok" };
      }
      const deploymentMode = stringValue(body.deploymentMode);
      const bootstrapStatus = stringValue(body.bootstrapStatus);
      const detail = ["Paperclip", deploymentMode, bootstrapStatus].filter(Boolean).join(" · ");
      return {
        available: true,
        ...(detail ? { detail } : {}),
        capabilities: {
          companies: true,
          agents: true,
          issues: true,
          budgets: true,
          activity: true,
          heartbeatRuns: true,
        },
      };
    } catch (error) {
      return {
        available: false,
        detail: error instanceof Error ? error.message : "Paperclip is unavailable",
      };
    }
  }

  listCompanies(): Promise<unknown> {
    return this.requestJson("/api/companies");
  }

  listAdapters(): Promise<unknown> {
    return this.requestJson("/api/adapters");
  }

  listAgents(companyId: string): Promise<unknown> {
    return this.requestJson(`/api/companies/${segment(companyId)}/agents`);
  }

  listIssues(companyId: string): Promise<unknown> {
    return this.requestJson(`/api/companies/${segment(companyId)}/issues`);
  }

  dashboard(companyId: string): Promise<unknown> {
    return this.requestJson(`/api/companies/${segment(companyId)}/dashboard`);
  }

  activity(companyId: string): Promise<unknown> {
    return this.requestJson(`/api/companies/${segment(companyId)}/activity`);
  }

  costsByAgent(companyId: string): Promise<unknown> {
    return this.requestJson(`/api/companies/${segment(companyId)}/costs/by-agent`);
  }

  heartbeatRunEvents(runId: string, afterSeq = 0): Promise<unknown> {
    const after = Number.isFinite(afterSeq) ? Math.max(0, Math.trunc(afterSeq)) : 0;
    return this.requestJson(`/api/heartbeat-runs/${segment(runId)}/events?afterSeq=${after}`);
  }

  heartbeatRunIssues(runId: string): Promise<unknown> {
    return this.requestJson(`/api/heartbeat-runs/${segment(runId)}/issues`);
  }

  invokeHeartbeat(agentId: string): Promise<unknown> {
    return this.requestJson(`/api/agents/${segment(agentId)}/heartbeat/invoke`, {
      method: "POST",
    });
  }

  pauseAgent(agentId: string): Promise<unknown> {
    return this.requestJson(`/api/agents/${segment(agentId)}/pause`, { method: "POST" });
  }

  resumeAgent(agentId: string): Promise<unknown> {
    return this.requestJson(`/api/agents/${segment(agentId)}/resume`, { method: "POST" });
  }

  private async requestJson(path: string, init: RequestInit = {}): Promise<unknown> {
    const response = await this.fetchFn(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        ...this.headers(),
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(init.headers ?? {}),
      },
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(
        `Paperclip request failed with HTTP ${response.status}${detail ? `: ${detail.slice(0, 500)}` : ""}`,
      );
    }
    const contentType = response.headers.get("content-type") ?? "";
    return contentType.includes("json") ? response.json() : response.text();
  }

  private headers(): Record<string, string> {
    return {
      Accept: "application/json",
      ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
    };
  }
}

export interface PaperclipHarnessBridgeInput {
  harnessId: string;
  cwd: string;
  command?: string;
  args?: string[];
  timeoutSec?: number;
  graceSec?: number;
  gatewayUrl?: string;
  gatewaySecretRef?: string;
}

export interface PaperclipAdapterConfig {
  adapterType:
    | "claude_local"
    | "codex_local"
    | "opencode_local"
    | "hermes_local"
    | "hermes_gateway"
    | "process";
  adapterConfig: Record<string, unknown>;
}

export function paperclipAdapterForHarness(
  input: PaperclipHarnessBridgeInput,
): PaperclipAdapterConfig {
  const cwd = requiredString(input.cwd, "Paperclip agent working directory");
  switch (input.harnessId) {
    case "claude-code":
      return { adapterType: "claude_local", adapterConfig: { cwd } };
    case "codex":
      return { adapterType: "codex_local", adapterConfig: { cwd } };
    case "opencode":
      return { adapterType: "opencode_local", adapterConfig: { cwd } };
    case "hermes":
      return { adapterType: "hermes_local", adapterConfig: { cwd } };
    case "hermes-gateway": {
      const apiBaseUrl = normalizeHermesGatewayUrl(
        requiredString(input.gatewayUrl, "Hermes gateway URL"),
      );
      const secretId = requiredString(
        input.gatewaySecretRef,
        "Paperclip Hermes gateway secret reference",
      );
      return {
        adapterType: "hermes_gateway",
        adapterConfig: {
          apiBaseUrl,
          apiKey: { type: "secret_ref", secretId, version: "latest" },
          sessionKeyStrategy: "issue",
        },
      };
    }
    default: {
      const command = requiredString(input.command, `Command for ${input.harnessId || "custom harness"}`);
      return {
        adapterType: "process",
        adapterConfig: {
          command,
          args: [...(input.args ?? [])],
          cwd,
          ...(input.timeoutSec !== undefined
            ? { timeoutSec: positiveSeconds(input.timeoutSec, "Paperclip process timeout") }
            : {}),
          graceSec: positiveSeconds(input.graceSec ?? 15, "Paperclip process grace period"),
        },
      };
    }
  }
}

export function paperclipHarnessDefinition(
  probe: () => Promise<HarnessProbe> = defaultPaperclipProbe,
): HarnessDefinition {
  return {
    id: "paperclip",
    label: "Paperclip",
    kind: "api",
    interactions: ["http"],
    workspacePolicies: ["read-only", "workspace-write", "container"],
    scheduleable: true,
    resident: true,
    outerVerificationRequired: true,
    probe,
  };
}

export async function defaultPaperclipProbe(): Promise<HarnessProbe> {
  return new PaperclipClient({
    baseUrl: process.env.PAPERCLIP_API_URL?.trim() || "http://127.0.0.1:3100",
    apiKey: process.env.PAPERCLIP_API_KEY,
  }).probe();
}

function normalizeHermesGatewayUrl(value: string): string {
  return normalizeServiceUrl(value, "Hermes gateway");
}

function normalizeServiceUrl(value: string, label: string): string {
  let parsed: URL;
  try {
    parsed = new URL(requiredString(value, `${label} URL`));
  } catch {
    throw new Error(`Enter a valid ${label} http:// or https:// URL`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`${label} URLs must use http:// or https://`);
  }
  if (parsed.username || parsed.password) {
    throw new Error(`Credential-bearing ${label} URLs are not allowed`);
  }
  if (parsed.search || parsed.hash) {
    throw new Error(`${label} URLs cannot include query strings or fragments`);
  }
  if (parsed.protocol === "http:" && !isLoopbackHost(parsed.hostname)) {
    throw new Error(`Remote ${label} servers must use HTTPS; HTTP is allowed only for loopback`);
  }
  const pathname = parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/+$/, "");
  return `${parsed.origin}${pathname}`;
}

function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

function segment(value: string): string {
  return encodeURIComponent(requiredString(value, "Paperclip id"));
}

function positiveSeconds(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be greater than zero`);
  return Math.max(1, Math.trunc(value));
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required`);
  return value.trim();
}
