import { describe, expect, it } from "vitest";
import { listPiCatalog, type PiCatalogEntry } from "./pi-models.js";

type RefreshableCatalog = (options?: {
  refresh?: boolean;
  staticCatalog?: PiCatalogEntry[];
  ollamaBaseUrl?: string | null;
  xaiApiKey?: string;
  fetchFn?: typeof fetch;
}) => PiCatalogEntry[] | Promise<PiCatalogEntry[]>;

const listModelCatalog = listPiCatalog as RefreshableCatalog;

const staticCatalog: PiCatalogEntry[] = [
  {
    provider: "xai",
    providerName: "xAI",
    id: "grok-static",
    label: "Grok Static",
    billing: "Uses your xAI credential.",
    auth: "api-key",
    subscription: false,
  },
];

describe("refreshable model catalog", () => {
  it("adds every currently installed Ollama tag and reflects a later refresh", async () => {
    let tags = ["qwen3:8b", "llama3.1:8b"];
    const fetchFn = (async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/api/tags")) {
        return new Response(JSON.stringify({ models: tags.map((name) => ({ name })) }));
      }
      throw new Error(`unexpected request ${url}`);
    }) as typeof fetch;

    const first = await listModelCatalog({
      refresh: true,
      staticCatalog,
      ollamaBaseUrl: "http://127.0.0.1:11434",
      fetchFn,
    });
    expect(first.filter((entry) => entry.provider === "ollama").map((entry) => entry.id)).toEqual([
      "llama3.1:8b",
      "qwen3:8b",
    ]);

    tags = ["qwen3:8b", "qwen3.8:9b", "devstral:latest"];
    const refreshed = await listModelCatalog({
      refresh: true,
      staticCatalog,
      ollamaBaseUrl: "http://127.0.0.1:11434",
      fetchFn,
    });
    expect(
      refreshed.filter((entry) => entry.provider === "ollama").map((entry) => entry.id),
    ).toEqual(["devstral:latest", "qwen3.8:9b", "qwen3:8b"]);
  });

  it("merges language models returned by the authenticated xAI model endpoint", async () => {
    const calls: Array<{ url: string; authorization: string | null }> = [];
    const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const headers = new Headers(init?.headers);
      calls.push({ url, authorization: headers.get("authorization") });
      if (url === "https://api.x.ai/v1/language-models") {
        return new Response(
          JSON.stringify({
            models: [
              { id: "grok-new-account-model", aliases: ["grok-latest"] },
              { id: "grok-static", aliases: [] },
            ],
          }),
        );
      }
      throw new Error(`unexpected request ${url}`);
    }) as typeof fetch;

    const catalog = await listModelCatalog({
      refresh: true,
      staticCatalog,
      xaiApiKey: "xai-test-secret",
      ollamaBaseUrl: null,
      fetchFn,
    });

    expect(calls).toEqual([
      {
        url: "https://api.x.ai/v1/language-models",
        authorization: "Bearer xai-test-secret",
      },
    ]);
    expect(
      catalog.some((entry) => entry.provider === "xai" && entry.id === "grok-new-account-model"),
    ).toBe(true);
    expect(
      catalog.filter((entry) => entry.provider === "xai" && entry.id === "grok-static"),
    ).toHaveLength(1);
  });

  it("degrades to the static catalog when optional local or provider discovery is unavailable", async () => {
    const fetchFn = (async () => {
      throw new Error("offline");
    }) as typeof fetch;
    await expect(
      listModelCatalog({
        refresh: true,
        staticCatalog,
        ollamaBaseUrl: "http://127.0.0.1:11434",
        xaiApiKey: "xai-test-secret",
        fetchFn,
      }),
    ).resolves.toEqual(staticCatalog);
  });
});
