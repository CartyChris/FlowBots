import { spawn } from "node:child_process";

export const MCP_PROTOCOL_VERSION = "2025-06-18";

export interface StdioMcpCallInput {
  command: string;
  args: string[];
  cwd: string;
  tool: string;
  arguments?: Record<string, unknown>;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
}

export async function runStdioMcpCall(input: StdioMcpCallInput): Promise<{
  tools: Array<{ name: string; description?: string; inputSchema?: unknown }>;
  result: unknown;
}> {
  const child = spawn(input.command, input.args, {
    cwd: input.cwd,
    env: input.env ?? process.env,
    shell: false,
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
  });

  let buffer = "";
  let stderr = "";
  let done = false;
  let nextId = 0;
  const pending = new Map<
    number,
    { resolve: (value: any) => void; reject: (error: Error) => void }
  >();
  const timeoutMs = Math.max(250, input.timeoutMs ?? 20_000);

  const failAll = (message: string) => {
    for (const waiter of pending.values()) waiter.reject(new Error(message));
    pending.clear();
  };

  child.stderr?.on("data", (chunk: Buffer) => {
    stderr += chunk.toString("utf8");
    if (stderr.length > 16_384) stderr = stderr.slice(-16_384);
  });

  child.stdout?.on("data", (chunk: Buffer) => {
    buffer += chunk.toString("utf8");
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf("\n");
      if (!line) continue;
      let message: any;
      try {
        message = JSON.parse(line);
      } catch {
        // MCP servers sometimes log startup noise to stdout; skip non-JSON lines.
        continue;
      }
      if (typeof message?.id === "number") {
        const waiter = pending.get(message.id);
        if (!waiter) continue;
        pending.delete(message.id);
        if (message.error) {
          waiter.reject(new Error(String(message.error.message ?? JSON.stringify(message.error))));
        } else {
          waiter.resolve(message.result);
        }
      }
    }
  });

  child.on("error", (error) => {
    failAll(`could not run "${input.command}": ${error.message}`);
  });
  child.on("close", (code) => {
    if (!done && pending.size) {
      const suffix = stderr.trim() ? `: ${stderr.trim().slice(-800)}` : " with no output";
      failAll(`MCP server exited (code ${code ?? "unknown"})${suffix}`);
    }
  });

  const sendNotification = (method: string, params: Record<string, unknown> = {}) => {
    child.stdin?.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
  };

  const request = (method: string, params: Record<string, unknown> = {}) => {
    const id = ++nextId;
    return new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        const suffix = stderr.trim() ? ` — server said: ${stderr.trim().slice(-500)}` : "";
        reject(new Error(`MCP ${method} timed out after ${timeoutMs}ms${suffix}`));
      }, timeoutMs);
      timer.unref?.();
      pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      child.stdin?.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    });
  };

  try {
    await request("initialize", {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "rakazo", version: "0.1.0" },
    });
    sendNotification("notifications/initialized");
    const listed = await request("tools/list", {});
    const tools = Array.isArray(listed?.tools) ? listed.tools : [];
    const selected = tools.find((tool: any) => tool?.name === input.tool);
    if (!selected) throw new Error(`MCP tool "${input.tool}" is not available`);
    const result = await request("tools/call", {
      name: input.tool,
      arguments: input.arguments ?? {},
    });
    return { tools, result };
  } finally {
    done = true;
    pending.clear();
    try {
      child.stdin?.end();
    } catch {
      // no-op
    }
    try {
      child.kill("SIGTERM");
    } catch {
      // no-op
    }
  }
}

export function parseMcpHttpResponse(body: string, contentType: string): unknown {
  const trimmed = body.trim();
  if (!trimmed) throw new Error("MCP server returned an empty response");
  const isSse =
    contentType.toLowerCase().includes("text/event-stream") || /(^|\n)data:\s*/.test(trimmed);
  if (!isSse) return JSON.parse(trimmed);

  const payloads = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .filter((line) => line && line !== "[DONE]");
  if (!payloads.length) throw new Error("MCP SSE response contained no data events");
  return JSON.parse(payloads.at(-1)!);
}

export interface HttpMcpRequestInput {
  url: string;
  method: string;
  params?: Record<string, unknown>;
  sessionId?: string;
  authHeader?: string;
  fetchImpl?: typeof fetch;
}

export async function runHttpMcpRequest(input: HttpMcpRequestInput): Promise<{
  result: unknown;
  sessionId?: string;
}> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  };
  if (input.sessionId) headers["mcp-session-id"] = input.sessionId;
  if (input.authHeader) headers.authorization = input.authHeader;
  const response = await fetchImpl(input.url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: input.method,
      params: input.params ?? {},
    }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`MCP HTTP ${response.status}: ${text.slice(0, 800)}`);
  return {
    result: parseMcpHttpResponse(text, response.headers.get("content-type") ?? "application/json"),
    sessionId: response.headers.get("mcp-session-id") ?? input.sessionId,
  };
}
