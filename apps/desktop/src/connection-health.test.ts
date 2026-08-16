import { describe, expect, it, vi } from "vitest";
import { probeConnectionHealth } from "./connection-health.js";

describe("desktop connection health", () => {
  it("treats any HTTP response from the web origin as reachable", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });

    await expect(probeConnectionHealth("http://127.0.0.1:5173", fetcher)).resolves.toEqual({
      webStatus: "online",
      apiStatus: "online",
    });
    expect(fetcher).toHaveBeenNthCalledWith(1, "http://127.0.0.1:5173", expect.any(Object));
    expect(fetcher).toHaveBeenNthCalledWith(2, "http://127.0.0.1:3100/health", expect.any(Object));
  });

  it("does not guess an API port for remote deployments", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });

    await expect(probeConnectionHealth("https://rakazo.example", fetcher)).resolves.toEqual({
      webStatus: "online",
      apiStatus: "not-applicable",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("reports independent local web and API failures without throwing", async () => {
    const bothOffline = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(probeConnectionHealth("http://localhost:5173", bothOffline)).resolves.toEqual({
      webStatus: "offline",
      apiStatus: "offline",
    });

    const apiOffline = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: false }) });
    await expect(probeConnectionHealth("http://localhost:5173", apiOffline)).resolves.toEqual({
      webStatus: "online",
      apiStatus: "offline",
    });
  });
});
