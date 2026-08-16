import { randomUUID } from "node:crypto";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { runCliProcess } from "./cli-agent.js";
import type { HarnessDefinition, HarnessProbe } from "./harness-registry.js";

export interface PrimeAgentRpcOptions {
  cwd: string;
  provider?: string;
  model?: string;
  sessionDir?: string;
  resume?: string;
  env?: NodeJS.ProcessEnv;
}

export interface PrimeAgentRpcInvocation {
  command: "prime-agent";
  args: string[];
  cwd: string;
}

export function buildPrimeAgentRpcInvocation(options: PrimeAgentRpcOptions): PrimeAgentRpcInvocation {
  const cwd = requiredString(options.cwd, "Prime Agent workspace");
  const args = ["--mode", "rpc"];
  if (options.provider) args.push("--provider", options.provider);
  if (options.model) args.push("--model", options.model);
  if (options.sessionDir) args.push("--session-dir", options.sessionDir);
  if (options.resume) args.push("--resume", options.resume);
  return { command: "prime-agent", args, cwd };
}

export class LfJsonlDecoder {
  private buffer = "";

  push(chunk: string | Buffer): unknown[] {
    this.buffer += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    const messages: unknown[] = [];
    while (true) {
      const index = this.buffer.indexOf("\n");
      if (index < 0) break;
      let line = this.buffer.slice(0, index);
      this.buffer = this.buffer.slice(index + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (!line.trim()) continue;
      messages.push(JSON.parse(line));
    }
    return messages;
  }

  finish(): unknown[] {
    let line = this.buffer;
    this.buffer = "";
    if (line.endsWith("\r")) line = line.slice(0, -1);
    return line.trim() ? [JSON.parse(line)] : [];
  }
}

export interface PrimeRpcTransport {
  send(line: string): void;
  onMessage(listener: (message: unknown) => void): () => void;
  onClose(listener: (error?: Error) => void): () => void;
  close(): Promise<void>;
}

export type PrimeRpcEventListener = (event: unknown) => void;

interface PendingRequest {
  resolve(value: unknown): void;
  reject(error: Error): void;
}

export class PrimeAgentRpcClient {
  private readonly pending = new Map<string, PendingRequest>();
  private readonly eventListeners = new Set<PrimeRpcEventListener>();
  private readonly idFactory: () => string;
  private readonly unsubscribeMessage: () => void;
  private readonly unsubscribeClose: () => void;
  private closed = false;

  constructor(
    private readonly transport: PrimeRpcTransport,
    options: { idFactory?: () => string } = {},
  ) {
    this.idFactory = options.idFactory ?? randomUUID;
    this.unsubscribeMessage = transport.onMessage((message) => this.handleMessage(message));
    this.unsubscribeClose = transport.onClose((error) => this.handleClose(error));
  }

  onEvent(listener: PrimeRpcEventListener): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  request(type: string, fields: Record<string, unknown> = {}): Promise<unknown> {
    if (this.closed) return Promise.reject(new Error("Prime Agent RPC session is closed"));
    const id = this.idFactory();
    const payload = { id, type, ...fields };
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      try {
        this.transport.send(JSON.stringify(payload));
      } catch (error) {
        this.pending.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  prompt(message: string): Promise<void> {
    return this.request("prompt", { message }).then(noValue);
  }

  steer(message: string): Promise<void> {
    return this.request("steer", { message }).then(noValue);
  }

  followUp(message: string): Promise<void> {
    return this.request("follow_up", { message }).then(noValue);
  }

  abort(): Promise<void> {
    return this.request("abort").then(noValue);
  }

  getState(): Promise<unknown> {
    return this.request("get_state");
  }

  getSessionStats(): Promise<unknown> {
    return this.request("get_session_stats");
  }

  getMessages(): Promise<unknown> {
    return this.request("get_messages");
  }

  setModel(provider: string, modelId: string): Promise<unknown> {
    return this.request("set_model", { provider, modelId });
  }

  compact(customInstructions?: string): Promise<unknown> {
    return this.request("compact", customInstructions ? { customInstructions } : {});
  }

  sendAgentMessage(
    targetActiveSessionId: string,
    message: string,
    deliveryMode: "auto" | "steer" | "follow_up" = "auto",
  ): Promise<unknown> {
    return this.request("send_message", { targetActiveSessionId, message, deliveryMode });
  }

  observe(activeSessionId: string): Promise<unknown> {
    return this.request("observe", { activeSessionId });
  }

  unobserve(activeSessionId: string): Promise<unknown> {
    return this.request("unobserve", { activeSessionId });
  }

  listSchedules(includeInactive = false): Promise<unknown> {
    return this.request("list_schedules", { includeInactive });
  }

  addSchedule(schedule: string, prompt: string): Promise<unknown> {
    return this.request("add_schedule", { schedule, prompt });
  }

  cancelSchedule(jobId: string): Promise<unknown> {
    return this.request("cancel_schedule", { jobId });
  }

  listHeartbeats(): Promise<unknown> {
    return this.request("list_heartbeats");
  }

  getHeartbeat(): Promise<unknown> {
    return this.request("get_heartbeat");
  }

  setHeartbeat(
    schedule: string,
    prompt: string,
    deliveryMode?: "steer" | "follow_up",
  ): Promise<unknown> {
    return this.request("set_heartbeat", {
      schedule,
      prompt,
      ...(deliveryMode ? { deliveryMode } : {}),
    });
  }

  updateHeartbeat(action: "pause" | "resume" | "clear"): Promise<unknown> {
    return this.request("update_heartbeat", { action });
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.unsubscribeMessage();
    this.unsubscribeClose();
    const error = new Error("Prime Agent RPC session closed");
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
    await this.transport.close();
  }

  private handleMessage(message: unknown): void {
    const record = asRecord(message);
    const id = typeof record?.id === "string" ? record.id : undefined;
    if (record?.type === "response" && id && this.pending.has(id)) {
      const pending = this.pending.get(id)!;
      this.pending.delete(id);
      if (record.success === false) {
        pending.reject(new Error(responseError(record)));
      } else {
        pending.resolve(record.data);
      }
      return;
    }
    for (const listener of this.eventListeners) listener(message);
  }

  private handleClose(error?: Error): void {
    if (this.closed) return;
    this.closed = true;
    const closeError = error ?? new Error("Prime Agent RPC transport closed");
    for (const pending of this.pending.values()) pending.reject(closeError);
    this.pending.clear();
  }
}

export interface PrimeAgentProcessSession {
  client: PrimeAgentRpcClient;
  pid?: number;
  close(): Promise<void>;
}

export function launchPrimeAgentRpc(options: PrimeAgentRpcOptions): PrimeAgentProcessSession {
  const invocation = buildPrimeAgentRpcInvocation(options);
  const child = spawn(invocation.command, invocation.args, {
    cwd: invocation.cwd,
    env: options.env ?? process.env,
    shell: false,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const transport = new PrimeAgentProcessTransport(child);
  const client = new PrimeAgentRpcClient(transport);
  return {
    client,
    pid: child.pid,
    close: () => client.close(),
  };
}

class PrimeAgentProcessTransport implements PrimeRpcTransport {
  private readonly decoder = new LfJsonlDecoder();
  private readonly messageListeners = new Set<(message: unknown) => void>();
  private readonly closeListeners = new Set<(error?: Error) => void>();
  private stderrTail = "";
  private closed = false;
  private closePromise?: Promise<void>;

  constructor(private readonly child: ChildProcessWithoutNullStreams) {
    child.stdout.on("data", (chunk: Buffer) => {
      try {
        for (const message of this.decoder.push(chunk)) this.emitMessage(message);
      } catch (error) {
        this.emitClose(error instanceof Error ? error : new Error(String(error)));
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      this.stderrTail = `${this.stderrTail}${chunk.toString("utf8")}`.slice(-32 * 1024);
    });
    child.on("error", (error) => this.emitClose(error));
    child.on("close", (code, signal) => {
      if (this.closed) return this.emitClose();
      const detail = this.stderrTail.trim();
      this.emitClose(
        new Error(
          `Prime Agent exited${code === null ? "" : ` with code ${code}`}${signal ? ` (${signal})` : ""}${detail ? `: ${detail}` : ""}`,
        ),
      );
    });
  }

  send(line: string): void {
    if (this.closed || !this.child.stdin.writable) throw new Error("Prime Agent stdin is closed");
    this.child.stdin.write(`${line}\n`);
  }

  onMessage(listener: (message: unknown) => void): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  onClose(listener: (error?: Error) => void): () => void {
    this.closeListeners.add(listener);
    return () => this.closeListeners.delete(listener);
  }

  close(): Promise<void> {
    if (this.closePromise) return this.closePromise;
    this.closed = true;
    this.closePromise = new Promise((resolve) => {
      if (this.child.exitCode !== null || this.child.signalCode !== null) return resolve();
      const done = () => resolve();
      this.child.once("close", done);
      this.child.stdin.end();
      this.child.kill("SIGTERM");
      const force = setTimeout(() => this.child.kill("SIGKILL"), 1_000);
      force.unref?.();
      this.child.once("close", () => clearTimeout(force));
    });
    return this.closePromise;
  }

  private emitMessage(message: unknown): void {
    for (const listener of this.messageListeners) listener(message);
  }

  private emitClose(error?: Error): void {
    for (const listener of this.closeListeners) listener(error);
  }
}

export function primeAgentHarnessDefinition(
  probe: () => Promise<HarnessProbe> = defaultPrimeAgentProbe,
): HarnessDefinition {
  return {
    id: "prime-agent",
    label: "Prime Agent",
    kind: "rpc",
    interactions: ["headless", "rpc"],
    workspacePolicies: ["read-only", "workspace-write", "container"],
    scheduleable: true,
    resident: true,
    outerVerificationRequired: true,
    probe,
  };
}

export async function defaultPrimeAgentProbe(): Promise<HarnessProbe> {
  const result = await runCliProcess({
    command: "prime-agent",
    args: ["--help"],
    cwd: process.cwd(),
    timeoutMs: 5_000,
    maxOutputBytes: 128 * 1024,
  });
  const output = `${result.stdout}\n${result.stderr}`.trim();
  if (result.code !== 0 || result.timedOut || result.aborted) {
    return {
      available: false,
      detail: output || (result.timedOut ? "Prime Agent probe timed out" : "Prime Agent is unavailable"),
    };
  }
  return {
    available: true,
    detail: output.split(/\r?\n/).find(Boolean),
    capabilities: {
      rpc: output.includes("rpc") || output.includes("--mode"),
      daemon: true,
      schedules: true,
      heartbeats: true,
      persistentSubagents: true,
      outerVerificationRequired: true,
    },
  };
}

function responseError(record: Record<string, unknown>): string {
  const error = record.error;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const message = (error as Record<string, unknown>).message;
    if (typeof message === "string") return message;
  }
  return typeof record.message === "string" ? record.message : "Prime Agent RPC command failed";
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function noValue(): void {
  return undefined;
}

function requiredString(value: string, label: string): string {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}
