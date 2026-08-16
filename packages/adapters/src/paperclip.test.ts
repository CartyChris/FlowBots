import { describe, expect, it, vi } from "vitest";
import {
  buildPaperclipManagedInvocation,
  normalizePaperclipUrl,
  paperclipAdapterForHarness,
  PaperclipClient,
  paperclipHarnessDefinition,
} from "./paperclip.js";

describe("Paperclip managed local lifecycle", () => {
  it("uses the official one-command onboarding and run surfaces with direct argv", () => {
    expect(buildPaperclipManagedInvocation("onboard", "/Users/me/Library/Application Support/Rakazo/paperclip")).toEqual({
      command: "npx",
      args: ["paperclipai", "onboard", "--yes"],
      cwd: "/Users/me/Library/Application Support/Rakazo/paperclip",
    });
    expect(buildPaperclipManagedInvocation("run", "/tmp/paperclip; touch /tmp/nope")).toEqual({
      command: "npx",
      args: ["paperclipai", "run"],
      cwd: "/tmp/paperclip; touch /tmp/nope",
    });
  });
});

describe("Paperclip URL policy", () => {
  it("allows loopback HTTP and requires HTTPS for remote instances", () => {
    expect(normalizePaperclipUrl("http://localhost:3100/")).toBe("http://localhost:3100");
    expect(normalizePaperclipUrl("https://paperclip.example.com/")).toBe("https://paperclip.example.com");
    expect(() => normalizePaperclipUrl("http://paperclip.example.com")).toThrow(/HTTPS/i);
  });

  it("rejects embedded credentials/query/fragment", () => {
    expect(() => normalizePaperclipUrl("https://u:p@paperclip.example.com")).toThrow(/credential/i);
    expect(() => normalizePaperclipUrl("https://paperclip.example.com?key=x")).toThrow(/query|fragment/i);
    expect(() => normalizePaperclipUrl("https://paperclip.example.com/#x")).toThrow(/query|fragment/i);
  });
});

describe("Paperclip API projection", () => {
  it("probes only the official /api/health endpoint", async () => {
    const fetchFn = vi.fn(async () =>
      new Response(JSON.stringify({ status: "ok", deploymentMode: "local_trusted" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ) as unknown as typeof fetch;
    const client = new PaperclipClient({ baseUrl: "http://localhost:3100", fetchFn });
    await expect(client.probe()).resolves.toMatchObject({ available: true });
    expect(fetchFn).toHaveBeenCalledWith(
      "http://localhost:3100/api/health",
      expect.objectContaining({ headers: expect.objectContaining({ Accept: "application/json" }) }),
    );
  });

  it("keeps auth in headers and exposes company/dashboard/agent/issue/activity surfaces", async () => {
    const fetchFn = vi.fn(async (url: string, init?: RequestInit) =>
      new Response(JSON.stringify({ url, authorization: (init?.headers as Record<string, string>)?.Authorization }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ) as unknown as typeof fetch;
    const client = new PaperclipClient({
      baseUrl: "https://paperclip.example.com",
      apiKey: "pc-secret",
      fetchFn,
    });

    await client.listCompanies();
    await client.listAgents("company-1");
    await client.listIssues("company-1");
    await client.dashboard("company-1");
    await client.activity("company-1");

    expect(fetchFn.mock.calls.map(([url]) => url)).toEqual([
      "https://paperclip.example.com/api/companies",
      "https://paperclip.example.com/api/companies/company-1/agents",
      "https://paperclip.example.com/api/companies/company-1/issues",
      "https://paperclip.example.com/api/companies/company-1/dashboard",
      "https://paperclip.example.com/api/companies/company-1/activity",
    ]);
    for (const [, init] of fetchFn.mock.calls) {
      expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer pc-secret");
    }
    expect(client.baseUrl).not.toContain("pc-secret");
  });

  it("fetches heartbeat events/issues for Glass Pane external correlation", async () => {
    const fetchFn = vi.fn(async (url: string) =>
      new Response(JSON.stringify({ url }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ) as unknown as typeof fetch;
    const client = new PaperclipClient({ baseUrl: "http://127.0.0.1:3100", fetchFn });
    await client.heartbeatRunEvents("run-7", 42);
    await client.heartbeatRunIssues("run-7");
    expect(fetchFn.mock.calls.map(([url]) => url)).toEqual([
      "http://127.0.0.1:3100/api/heartbeat-runs/run-7/events?afterSeq=42",
      "http://127.0.0.1:3100/api/heartbeat-runs/run-7/issues",
    ]);
  });
});

describe("Paperclip adapter translation", () => {
  it("uses Paperclip native adapters for Claude, Codex, OpenCode, and Hermes", () => {
    expect(paperclipAdapterForHarness({ harnessId: "claude-code", cwd: "/work" })).toEqual({
      adapterType: "claude_local",
      adapterConfig: { cwd: "/work" },
    });
    expect(paperclipAdapterForHarness({ harnessId: "codex", cwd: "/work" }).adapterType).toBe("codex_local");
    expect(paperclipAdapterForHarness({ harnessId: "opencode", cwd: "/work" }).adapterType).toBe("opencode_local");
    expect(paperclipAdapterForHarness({ harnessId: "hermes", cwd: "/work" }).adapterType).toBe("hermes_local");
    expect(
      paperclipAdapterForHarness({
        harnessId: "hermes-gateway",
        cwd: "/work",
        gatewayUrl: "http://127.0.0.1:8642",
      }),
    ).toEqual({
      adapterType: "hermes_gateway",
      adapterConfig: { url: "http://127.0.0.1:8642" },
    });
  });

  it("uses Paperclip's process adapter for Prime/Kimi/OpenHands/custom harnesses without copying secrets", () => {
    expect(
      paperclipAdapterForHarness({
        harnessId: "prime-agent",
        cwd: "/work",
        command: "prime-agent",
        args: ["--mode", "rpc"],
        timeoutSec: 900,
      }),
    ).toEqual({
      adapterType: "process",
      adapterConfig: {
        command: "prime-agent",
        args: ["--mode", "rpc"],
        cwd: "/work",
        timeoutSec: 900,
        graceSec: 15,
      },
    });
  });

  it("refuses generic process fallback unless an exact command is supplied", () => {
    expect(() => paperclipAdapterForHarness({ harnessId: "unknown", cwd: "/work" })).toThrow(/command/i);
  });
});

describe("Paperclip harness metadata", () => {
  it("is optional, resident, scheduleable, HTTP-observed and verifier-gated", () => {
    const definition = paperclipHarnessDefinition(async () => ({ available: true }));
    expect(definition).toMatchObject({
      id: "paperclip",
      kind: "api",
      resident: true,
      scheduleable: true,
      outerVerificationRequired: true,
    });
    expect(definition.interactions).toContain("http");
  });
});
