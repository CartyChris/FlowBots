import { runCliProcess } from "./cli-agent.js";
import type { HarnessDefinition, HarnessProbe } from "./harness-registry.js";

export interface OpenHandsInvocation {
  command: "openhands";
  args: string[];
  cwd: string;
}

export type OpenHandsSecurityMode = "confirm" | "always-approve" | "llm-approve";

export interface OpenHandsHeadlessOptions {
  cwd: string;
  task: string;
  resume?: string;
  overrideWithEnvs?: boolean;
  security?: OpenHandsSecurityMode;
}

export interface OpenHandsAcpOptions {
  cwd: string;
  resume?: string;
  security?: OpenHandsSecurityMode;
  streaming?: boolean;
}

export function buildOpenHandsHeadlessInvocation(
  options: OpenHandsHeadlessOptions,
): OpenHandsInvocation {
  const args = ["--headless", "--json", "--exit-without-confirmation"];
  if (options.overrideWithEnvs) args.push("--override-with-envs");
  if (options.resume) args.push("--resume", options.resume);
  appendSecurity(args, options.security);
  args.push("-t", requiredString(options.task, "OpenHands task"));
  return { command: "openhands", args, cwd: requiredString(options.cwd, "OpenHands workspace") };
}

export function buildOpenHandsAcpInvocation(options: OpenHandsAcpOptions): OpenHandsInvocation {
  const args = ["acp"];
  if (options.resume) args.push("--resume", options.resume);
  appendSecurity(args, options.security);
  if (options.streaming !== false) args.push("--streaming");
  return { command: "openhands", args, cwd: requiredString(options.cwd, "OpenHands workspace") };
}

function appendSecurity(args: string[], security: OpenHandsSecurityMode | undefined): void {
  if (security === "always-approve") args.push("--always-approve");
  else if (security === "llm-approve") args.push("--llm-approve");
}

export function normalizeOpenHandsAgentServerUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(requiredString(value, "OpenHands Agent Server URL"));
  } catch {
    throw new Error("Enter a valid OpenHands Agent Server http:// or https:// URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("OpenHands Agent Server URLs must use http:// or https://");
  }
  if (parsed.username || parsed.password) {
    throw new Error("Credential-bearing OpenHands Agent Server URLs are not allowed");
  }
  if (parsed.search || parsed.hash) {
    throw new Error("OpenHands Agent Server URLs cannot include query strings or fragments");
  }
  if (parsed.protocol === "http:" && !isLoopbackHost(parsed.hostname)) {
    throw new Error("Remote OpenHands Agent Servers must use HTTPS; HTTP is allowed only for loopback");
  }
  const pathname = parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/+$/, "");
  return `${parsed.origin}${pathname}`;
}

export interface OpenHandsAgentServerClientOptions {
  baseUrl: string;
  apiKey?: string;
  fetchFn?: typeof fetch;
}

export class OpenHandsAgentServerClient {
  readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly fetchFn: typeof fetch;

  constructor(options: OpenHandsAgentServerClientOptions) {
    this.baseUrl = normalizeOpenHandsAgentServerUrl(options.baseUrl);
    this.apiKey = options.apiKey?.trim() || undefined;
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async probe(): Promise<HarnessProbe> {
    try {
      const response = await this.fetchFn(`${this.baseUrl}/`, {
        method: "GET",
        headers: this.headers(),
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) {
        return { available: false, detail: `OpenHands Agent Server answered HTTP ${response.status}` };
      }
      const body = (await response.json()) as Record<string, unknown>;
      if (body.title !== "OpenHands Agent Server" || typeof body.version !== "string") {
        return { available: false, detail: "Endpoint did not identify itself as OpenHands Agent Server" };
      }
      return {
        available: true,
        version: body.version,
        detail: body.title,
      };
    } catch (error) {
      return {
        available: false,
        detail: error instanceof Error ? error.message : "OpenHands Agent Server is unavailable",
      };
    }
  }

  async sendMessage(conversationId: string, text: string, run = false): Promise<unknown> {
    return this.requestJson(
      `/api/conversations/${encodeURIComponent(requiredString(conversationId, "conversation id"))}/events`,
      {
        method: "POST",
        body: JSON.stringify({
          role: "user",
          content: [{ type: "text", text, cache_prompt: false }],
          run,
        }),
      },
    );
  }

  async askAgent(conversationId: string, question: string): Promise<unknown> {
    return this.requestJson(
      `/api/conversations/${encodeURIComponent(requiredString(conversationId, "conversation id"))}/ask_agent`,
      { method: "POST", body: JSON.stringify({ question }) },
    );
  }

  async condense(conversationId: string): Promise<unknown> {
    return this.requestJson(
      `/api/conversations/${encodeURIComponent(requiredString(conversationId, "conversation id"))}/condense`,
      { method: "POST" },
    );
  }

  async searchConversations(): Promise<unknown> {
    return this.requestJson("/api/conversations/search", { method: "GET" });
  }

  conversationStreamUrl(conversationId: string): string {
    const url = new URL(this.baseUrl);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    const root = url.pathname === "/" ? "" : url.pathname.replace(/\/+$/, "");
    url.pathname = `${root}/api/conversations/${encodeURIComponent(requiredString(conversationId, "conversation id"))}/stream`;
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  }

  websocketHeaders(): Record<string, string> {
    return this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {};
  }

  private async requestJson(path: string, init: RequestInit): Promise<unknown> {
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
        `OpenHands Agent Server request failed with HTTP ${response.status}${detail ? `: ${detail.slice(0, 500)}` : ""}`,
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

export function openHandsHarnessDefinitions(
  probe: () => Promise<HarnessProbe> = defaultOpenHandsCliProbe,
): HarnessDefinition[] {
  return [
    {
      id: "openhands-local",
      label: "OpenHands",
      kind: "acp",
      interactions: ["headless", "acp"],
      workspacePolicies: ["read-only", "workspace-write", "container"],
      scheduleable: true,
      resident: false,
      outerVerificationRequired: true,
      probe,
    },
    {
      id: "openhands-agent-server",
      label: "OpenHands Agent Server",
      kind: "agent-server",
      interactions: ["http"],
      workspacePolicies: ["container"],
      scheduleable: true,
      resident: true,
      outerVerificationRequired: true,
      probe,
    },
  ];
}

export async function defaultOpenHandsCliProbe(): Promise<HarnessProbe> {
  const result = await runCliProcess({
    command: "openhands",
    args: ["--version"],
    cwd: process.cwd(),
    timeoutMs: 5_000,
    maxOutputBytes: 64 * 1024,
  });
  const output = `${result.stdout}\n${result.stderr}`.trim();
  if (result.code !== 0 || result.timedOut || result.aborted) {
    return {
      available: false,
      detail: output || (result.timedOut ? "OpenHands version probe timed out" : "OpenHands is unavailable"),
    };
  }
  return { available: true, ...(output ? { version: output.split(/\r?\n/)[0] } : {}) };
}

export async function runOpenHandsHeadless(
  options: OpenHandsHeadlessOptions & { signal?: AbortSignal; timeoutMs?: number },
) {
  const invocation = buildOpenHandsHeadlessInvocation(options);
  return runCliProcess({
    ...invocation,
    signal: options.signal,
    timeoutMs: options.timeoutMs ?? 30 * 60_000,
    maxOutputBytes: 16 * 1024 * 1024,
  });
}

function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

function requiredString(value: string, label: string): string {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}
