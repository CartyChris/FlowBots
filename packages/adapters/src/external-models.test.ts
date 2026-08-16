import { describe, expect, test, vi } from "vitest";
import {
  externalCatalogEntries,
  externalRuntimeModel,
  g0dm0d3BaseUrl,
  g0dm0d3HealthUrl,
  isG0dm0d3Reachable,
  providerEnvironmentApiKey,
} from "./external-models.js";

describe("FlowBots external model providers", () => {
  test("catalog exposes current Venice and G0DM0D3 research models without secrets", () => {
    const entries = externalCatalogEntries();
    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ provider: "venice", id: "venice-uncensored" }),
        expect.objectContaining({ provider: "g0dm0d3", id: "ultraplinian/fast" }),
        expect.objectContaining({ provider: "g0dm0d3", id: "consortium/fast" }),
      ]),
    );
    expect(JSON.stringify(entries)).not.toMatch(/api[_ -]?key|Bearer\s+sk-/i);
  });

  test("Venice runtime model uses the official OpenAI-compatible API", () => {
    expect(externalRuntimeModel("venice", "venice-uncensored")).toMatchObject({
      provider: "venice",
      id: "venice-uncensored",
      api: "openai-completions",
      baseUrl: "https://api.venice.ai/api/v1",
    });
  });

  test("G0DM0D3 defaults to the local research-preview API and supports a clean override", () => {
    expect(g0dm0d3BaseUrl({} as NodeJS.ProcessEnv)).toBe("http://127.0.0.1:7860/v1");
    expect(g0dm0d3HealthUrl({} as NodeJS.ProcessEnv)).toBe("http://127.0.0.1:7860/v1/health");
    expect(
      g0dm0d3BaseUrl({ GODMODE_BASE_URL: "https://research.example/v1/" } as NodeJS.ProcessEnv),
    ).toBe("https://research.example/v1");
    expect(() =>
      g0dm0d3BaseUrl({ GODMODE_BASE_URL: "file:///tmp/godmode" } as NodeJS.ProcessEnv),
    ).toThrow(/http/i);
    expect(() =>
      g0dm0d3BaseUrl({ GODMODE_BASE_URL: "https://user:pass@example.com/v1" } as NodeJS.ProcessEnv),
    ).toThrow(/credentials/i);
  });

  test("G0DM0D3 reachability uses only its unauthenticated health endpoint and fails closed", async () => {
    const okFetch = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}", { status: 200 }));
    await expect(isG0dm0d3Reachable({ fetchFn: okFetch })).resolves.toBe(true);
    expect(okFetch).toHaveBeenCalledWith(
      "http://127.0.0.1:7860/v1/health",
      expect.objectContaining({ method: "GET", headers: { accept: "application/json" } }),
    );
    const failingFetch = vi.fn<typeof fetch>().mockRejectedValue(new Error("offline"));
    await expect(isG0dm0d3Reachable({ fetchFn: failingFetch })).resolves.toBe(false);
  });

  test("provider environment keys are provider-specific", () => {
    const env = {
      VENICE_API_KEY: "venice-secret",
      GODMODE_API_KEY: "godmode-secret",
      OPENROUTER_API_KEY: "openrouter-secret",
    } as NodeJS.ProcessEnv;
    expect(providerEnvironmentApiKey("venice", env)).toBe("venice-secret");
    expect(providerEnvironmentApiKey("g0dm0d3", env)).toBe("godmode-secret");
    expect(providerEnvironmentApiKey("openrouter", env)).toBe("openrouter-secret");
  });
});
