import type { AdapterContext } from "@rakazo/adapter-kit";
import { describe, expect, it, vi } from "vitest";

const context: AdapterContext = {
  operationId: "op-1",
  traceId: "trace-1",
  workspaceId: "workspace-1",
  userId: "user-1",
  botId: "bot-1",
  signal: new AbortController().signal,
};

describe("MCP connector", () => {
  it("discovers configured tools with a server namespace and routes execution", async () => {
    const modulePath = "./mcp-connector.js";
    const mod = (await import(modulePath)) as {
      McpConnector: new (
        options: Record<string, unknown>,
      ) => {
        discoverTools(ctx: AdapterContext): Promise<Array<{ name: string; description: string }>>;
        execute(
          call: { tool: string; args: Record<string, unknown>; executionId: string },
          ctx: AdapterContext,
        ): AsyncIterable<{ type: string; data?: unknown; message?: string }>;
      };
    };
    const listTools = vi.fn(async () => [
      {
        name: "search",
        description: "Search the connected knowledge base",
        inputSchema: { type: "object", properties: { query: { type: "string" } } },
      },
    ]);
    const callTool = vi.fn(async () => ({ content: [{ type: "text", text: "found" }] }));
    const connector = new mod.McpConnector({
      loadServers: vi.fn(async () => [
        {
          id: "docs",
          name: "Docs",
          transport: "http",
          url: "https://mcp.example.test",
        },
      ]),
      listTools,
      callTool,
    });

    const tools = await connector.discoverTools(context);
    expect(tools).toEqual([
      expect.objectContaining({
        name: "mcp__docs__search",
        description: expect.stringContaining("Docs"),
      }),
    ]);

    const events = [];
    for await (const event of connector.execute(
      { tool: "mcp__docs__search", args: { query: "roadmap" }, executionId: "exec-1" },
      context,
    )) {
      events.push(event);
    }
    expect(callTool).toHaveBeenCalledWith(
      expect.objectContaining({ id: "docs", transport: "http" }),
      "search",
      { query: "roadmap" },
    );
    expect(events).toEqual([
      { type: "result", data: { content: [{ type: "text", text: "found" }] } },
    ]);
  });

  it("does not let one MCP server claim another server's tool namespace", async () => {
    const modulePath = "./mcp-connector.js";
    const mod = (await import(modulePath)) as {
      McpConnector: new (options: Record<string, unknown>) => any;
    };
    const connector = new mod.McpConnector({
      loadServers: vi.fn(async () => [
        { id: "alpha", name: "Alpha", transport: "http", url: "https://alpha.example.test" },
      ]),
      listTools: vi.fn(async () => [{ name: "ping", description: "Ping" }]),
      callTool: vi.fn(async () => ({ ok: true })),
    });

    const events = [];
    for await (const event of connector.execute(
      { tool: "mcp__beta__ping", args: {}, executionId: "exec-2" },
      context,
    )) {
      events.push(event);
    }
    expect(events[0]).toEqual(expect.objectContaining({ type: "error" }));
  });
});
