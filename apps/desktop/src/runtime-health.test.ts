import { describe, expect, test, vi } from "vitest";
import { probeRuntimeOrigin } from "./runtime-health.js";

describe("desktop runtime health", () => {
  test("Lite requires FlowBots health and verifies the zero-setup topology", async () => {
    const fetcher = vi.fn(async (_url: string) => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, jobs: "memory", sandbox: "desktop" }),
    }));

    await expect(
      probeRuntimeOrigin({ mode: "lite", origin: "http://127.0.0.1:43117" }, fetcher, 100),
    ).resolves.toEqual({ ok: true });
    expect(fetcher).toHaveBeenCalledWith(
      "http://127.0.0.1:43117/health",
      expect.objectContaining({ redirect: "manual" }),
    );
  });

  test("Lite rejects a reachable server that is not the Lite topology", async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, jobs: "graphile", sandbox: "docker" }),
    }));

    await expect(
      probeRuntimeOrigin({ mode: "lite", origin: "http://127.0.0.1:43117" }, fetcher, 100),
    ).resolves.toMatchObject({ ok: false, error: expect.stringMatching(/Lite runtime/i) });
  });

  test("Full Local and Remote probe the selected web origin without starting Lite", async () => {
    const fetcher = vi.fn(async () => ({ ok: true, status: 302, json: async () => ({}) }));

    await expect(
      probeRuntimeOrigin({ mode: "full-local", origin: "http://127.0.0.1:5173" }, fetcher, 100),
    ).resolves.toEqual({ ok: true });
    await expect(
      probeRuntimeOrigin({ mode: "remote", origin: "https://example.com/app" }, fetcher, 100),
    ).resolves.toEqual({ ok: true });
    expect(fetcher.mock.calls.map((call) => call[0])).toEqual([
      "http://127.0.0.1:5173",
      "https://example.com/app",
    ]);
  });

  test("network failure produces an actionable health failure", async () => {
    const fetcher = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });

    await expect(
      probeRuntimeOrigin({ mode: "remote", origin: "https://example.com" }, fetcher, 100),
    ).resolves.toMatchObject({ ok: false, error: expect.stringMatching(/reach|connect/i) });
  });
});
