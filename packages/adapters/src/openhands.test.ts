import { describe, expect, it, vi } from "vitest";
import {
  buildOpenHandsAcpInvocation,
  buildOpenHandsHeadlessInvocation,
  normalizeOpenHandsAgentServerUrl,
  OpenHandsAgentServerClient,
  openHandsHarnessDefinitions,
} from "./openhands.js";

describe("OpenHands CLI invocation", () => {
  it("builds headless JSON argv without shell interpolation", () => {
    expect(
      buildOpenHandsHeadlessInvocation({
        cwd: "/work/repo; touch /tmp/nope",
        task: "fix the failing tests",
        resume: "conv-123",
        overrideWithEnvs: true,
      }),
    ).toEqual({
      command: "openhands",
      args: [
        "--headless",
        "--json",
        "--exit-without-confirmation",
        "--override-with-envs",
        "--resume",
        "conv-123",
        "-t",
        "fix the failing tests",
      ],
      cwd: "/work/repo; touch /tmp/nope",
    });
  });

  it("builds ACP argv separately so interactive protocol sessions can be long-lived", () => {
    expect(
      buildOpenHandsAcpInvocation({ cwd: "/work/repo", resume: "abc", security: "llm-approve" }),
    ).toEqual({
      command: "openhands",
      args: ["acp", "--resume", "abc", "--llm-approve", "--streaming"],
      cwd: "/work/repo",
    });
  });
});

describe("OpenHands Agent Server URL policy", () => {
  it("allows loopback HTTP but requires HTTPS for remote servers", () => {
    expect(normalizeOpenHandsAgentServerUrl("http://127.0.0.1:18000/")).toBe(
      "http://127.0.0.1:18000",
    );
    expect(normalizeOpenHandsAgentServerUrl("https://agents.example.com/")).toBe(
      "https://agents.example.com",
    );
    expect(() => normalizeOpenHandsAgentServerUrl("http://agents.example.com")).toThrow(/HTTPS/i);
  });

  it("rejects embedded credentials, query strings, and fragments", () => {
    expect(() => normalizeOpenHandsAgentServerUrl("https://u:p@agents.example.com")).toThrow(
      /credential/i,
    );
    expect(() => normalizeOpenHandsAgentServerUrl("https://agents.example.com?token=x")).toThrow(
      /query|fragment/i,
    );
  });
});

describe("OpenHandsAgentServerClient", () => {
  it("probes the official server-info response and keeps bearer auth out of the URL", async () => {
    const fetchFn = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            uptime: 12,
            idle_time: 0,
            title: "OpenHands Agent Server",
            version: "1.11.4",
            docs: "/docs",
            redoc: "/redoc",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    ) as unknown as typeof fetch;
    const client = new OpenHandsAgentServerClient({
      baseUrl: "http://127.0.0.1:18000",
      apiKey: "super-secret",
      fetchFn,
    });

    await expect(client.probe()).resolves.toEqual({
      available: true,
      version: "1.11.4",
      detail: "OpenHands Agent Server",
    });
    expect(fetchFn).toHaveBeenCalledWith(
      "http://127.0.0.1:18000/",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer super-secret" }),
      }),
    );
    expect(client.baseUrl).not.toContain("super-secret");
  });

  it("sends a current Agent Server user event with optional run=true", async () => {
    const fetchFn = vi.fn(
      async () =>
        new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    ) as unknown as typeof fetch;
    const client = new OpenHandsAgentServerClient({
      baseUrl: "https://agents.example.com",
      fetchFn,
    });

    await client.sendMessage("conv-1", "please continue", true);
    expect(fetchFn).toHaveBeenCalledWith(
      "https://agents.example.com/api/conversations/conv-1/events",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          role: "user",
          content: [{ type: "text", text: "please continue", cache_prompt: false }],
          run: true,
        }),
      }),
    );
  });

  it("builds WebSocket stream URLs without leaking auth", () => {
    const local = new OpenHandsAgentServerClient({ baseUrl: "http://127.0.0.1:18000" });
    const remote = new OpenHandsAgentServerClient({
      baseUrl: "https://agents.example.com/base",
      apiKey: "secret",
    });
    expect(local.conversationStreamUrl("abc")).toBe(
      "ws://127.0.0.1:18000/api/conversations/abc/stream",
    );
    expect(remote.conversationStreamUrl("abc")).toBe(
      "wss://agents.example.com/base/api/conversations/abc/stream",
    );
    expect(remote.conversationStreamUrl("abc")).not.toContain("secret");
  });

  it("reports non-OpenHands endpoints as unavailable instead of accepting any 200", async () => {
    const fetchFn = (async () =>
      new Response(JSON.stringify({ title: "something else", version: "1" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })) as typeof fetch;
    const client = new OpenHandsAgentServerClient({
      baseUrl: "https://agents.example.com",
      fetchFn,
    });
    await expect(client.probe()).resolves.toMatchObject({ available: false });
  });
});

describe("OpenHands harness metadata", () => {
  it("exposes CLI/ACP and Agent Server as separate but related harnesses", () => {
    const definitions = openHandsHarnessDefinitions(async () => ({ available: true }));
    expect(definitions.map((item) => item.id)).toEqual([
      "openhands-local",
      "openhands-agent-server",
    ]);
    expect(definitions[0]).toMatchObject({
      kind: "acp",
      resident: false,
      outerVerificationRequired: true,
    });
    expect(definitions[0]!.interactions).toEqual(expect.arrayContaining(["headless", "acp"]));
    expect(definitions[1]).toMatchObject({
      kind: "agent-server",
      resident: true,
      outerVerificationRequired: true,
    });
    expect(definitions[1]!.interactions).toContain("http");
  });
});
