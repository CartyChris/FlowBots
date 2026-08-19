import type {
  AdapterContext,
  ConnectorCall,
  ConnectorEvent,
  ConnectorProvider,
  ConnectorTool,
} from "@rakazo/adapter-kit";
import { runHttpMcpRequest, runStdioMcpCall } from "./mcp-client.js";

export type McpServerConfig =
  | {
      id: string;
      name: string;
      transport: "stdio";
      command: string;
      args: string[];
      cwd: string;
      env?: NodeJS.ProcessEnv;
    }
  | {
      id: string;
      name: string;
      transport: "http";
      url: string;
      authHeader?: string;
    };

export type McpToolDescriptor = {
  name: string;
  description?: string;
  inputSchema?: unknown;
};

type LoadServers = (context: AdapterContext) => Promise<McpServerConfig[]>;
type ListTools = (server: McpServerConfig) => Promise<McpToolDescriptor[]>;
type CallTool = (
  server: McpServerConfig,
  tool: string,
  args: Record<string, unknown>,
) => Promise<unknown>;

export class McpConnector implements ConnectorProvider {
  private readonly loadServers: LoadServers;
  private readonly listTools: ListTools;
  private readonly callTool: CallTool;

  constructor(options: {
    loadServers: LoadServers;
    listTools?: ListTools;
    callTool?: CallTool;
  }) {
    this.loadServers = options.loadServers;
    this.listTools = options.listTools ?? defaultListTools;
    this.callTool = options.callTool ?? defaultCallTool;
  }

  describe() {
    return {
      id: "mcp",
      contractVersion: "1",
      adapterVersion: "0.1.0",
      capabilities: { discover: true, oauth: false, secretsBrokered: true },
    };
  }

  async discoverTools(context: AdapterContext): Promise<ConnectorTool[]> {
    const servers = await this.loadServers(context);
    const results = await Promise.all(
      servers.map(async (server) => {
        try {
          const tools = await this.listTools(server);
          return tools.map(
            (tool): ConnectorTool => ({
              name: namespacedTool(server.id, tool.name),
              description: `[${server.name}] ${tool.description ?? tool.name}`,
              inputSchema: asSchema(tool.inputSchema),
            }),
          );
        } catch {
          return [];
        }
      }),
    );
    return results.flat();
  }

  async *execute(call: ConnectorCall, context: AdapterContext): AsyncIterable<ConnectorEvent> {
    const parsed = parseNamespacedTool(call.tool);
    if (!parsed) {
      yield { type: "error", message: `unknown MCP tool ${call.tool}` };
      return;
    }
    const server = (await this.loadServers(context)).find((item) => item.id === parsed.serverId);
    if (!server) {
      yield { type: "error", message: `MCP server ${parsed.serverId} is not configured` };
      return;
    }
    try {
      const result = await this.callTool(server, parsed.tool, call.args ?? {});
      yield { type: "result", data: result };
    } catch (error) {
      yield { type: "error", message: error instanceof Error ? error.message : String(error) };
    }
  }
}

export function namespacedTool(serverId: string, tool: string): string {
  const id = serverId.trim();
  if (!/^[A-Za-z0-9._-]+$/.test(id)) throw new Error(`invalid MCP server id "${serverId}"`);
  if (!tool.trim() || tool.includes("__")) throw new Error(`invalid MCP tool name "${tool}"`);
  return `mcp__${id}__${tool}`;
}

function parseNamespacedTool(value: string): { serverId: string; tool: string } | undefined {
  if (!value.startsWith("mcp__")) return undefined;
  const rest = value.slice(5);
  const separator = rest.indexOf("__");
  if (separator <= 0) return undefined;
  const serverId = rest.slice(0, separator);
  const tool = rest.slice(separator + 2);
  if (!serverId || !tool) return undefined;
  return { serverId, tool };
}

function asSchema(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : { type: "object", properties: {} };
}

async function defaultListTools(server: McpServerConfig): Promise<McpToolDescriptor[]> {
  if (server.transport === "stdio") {
    const response = await runStdioMcpCall({
      command: server.command,
      args: server.args,
      cwd: server.cwd,
      env: server.env,
      timeoutMs: 10_000,
    });
    return response.tools;
  }
  const initialized = await runHttpMcpRequest({
    url: server.url,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "flowbots", version: "0.1.0" },
    },
    authHeader: server.authHeader,
  });
  const listed = await runHttpMcpRequest({
    url: server.url,
    method: "tools/list",
    sessionId: initialized.sessionId,
    authHeader: server.authHeader,
  });
  const envelope = unwrapJsonRpc(listed.result);
  return Array.isArray((envelope as { tools?: unknown[] })?.tools)
    ? ((envelope as { tools: McpToolDescriptor[] }).tools ?? [])
    : [];
}

async function defaultCallTool(
  server: McpServerConfig,
  tool: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  if (server.transport === "stdio") {
    return (
      await runStdioMcpCall({
        command: server.command,
        args: server.args,
        cwd: server.cwd,
        env: server.env,
        tool,
        arguments: args,
      })
    ).result;
  }
  const initialized = await runHttpMcpRequest({
    url: server.url,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "flowbots", version: "0.1.0" },
    },
    authHeader: server.authHeader,
  });
  const called = await runHttpMcpRequest({
    url: server.url,
    method: "tools/call",
    params: { name: tool, arguments: args },
    sessionId: initialized.sessionId,
    authHeader: server.authHeader,
  });
  return unwrapJsonRpc(called.result);
}

function unwrapJsonRpc(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  return "result" in record ? record.result : value;
}
