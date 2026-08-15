import { describe, expect, it } from "vitest";
import {
  OLLAMA_DEFAULT_BASE_URL,
  OLLAMA_PROVIDER_ID,
  ollamaBaseUrl,
  ollamaModelIds,
  ollamaProvider,
} from "./ollama-provider.js";

describe("ollamaBaseUrl", () => {
  it("defaults to localhost:11434", () => {
    expect(ollamaBaseUrl({})).toBe(OLLAMA_DEFAULT_BASE_URL);
  });

  it("respects OLLAMA_BASE_URL and strips trailing slashes", () => {
    expect(ollamaBaseUrl({ OLLAMA_BASE_URL: "http://mini.local:11434/" })).toBe(
      "http://mini.local:11434",
    );
  });
});

describe("ollamaProvider", () => {
  it("is a keyless local provider with the OpenAI-completions stream", () => {
    const provider = ollamaProvider("http://127.0.0.1:11434");
    expect(provider.id).toBe(OLLAMA_PROVIDER_ID);
    expect(provider.baseUrl).toBe("http://127.0.0.1:11434/v1");
    expect(provider.auth.apiKey?.name).toContain("No key");
  });

  it("resolves a placeholder key so the completions client is satisfied", async () => {
    const provider = ollamaProvider("http://127.0.0.1:11434");
    const auth = (await provider.auth.apiKey?.resolve({
      ctx: {} as never,
      signal: new AbortController().signal,
    })) as { apiKey?: string } | undefined;
    expect(auth?.apiKey).toBe("ollama");
  });
});

describe("ollamaModelIds", () => {
  it("returns sorted model names from a fake server", async () => {
    const fetchFn = (async () =>
      new Response(
        JSON.stringify({
          models: [{ name: "qwen3:8b" }, { name: "llama3.1:8b" }, { name: "" }],
        }),
        { status: 200 },
      )) as typeof fetch;
    const models = await ollamaModelIds("http://127.0.0.1:11434", { fetchFn });
    expect(models).toEqual(["llama3.1:8b", "qwen3:8b"]);
  });

  it("throws when the server answers with an error", async () => {
    const fetchFn = (async () => new Response("nope", { status: 503 })) as typeof fetch;
    await expect(ollamaModelIds("http://127.0.0.1:11434", { fetchFn })).rejects.toThrow("503");
  });

  it("throws when the server is unreachable", async () => {
    const fetchFn = (async () => {
      throw new Error("fetch failed");
    }) as typeof fetch;
    await expect(ollamaModelIds("http://127.0.0.1:11434", { fetchFn })).rejects.toThrow(
      "fetch failed",
    );
  });
});
