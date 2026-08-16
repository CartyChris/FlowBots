import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ollamaRuntimeModel } from "./ollama-runtime.js";

describe("Pi runtime Ollama routing", () => {
  it("builds runtime models against the configured OpenAI-compatible endpoint", () => {
    const model = ollamaRuntimeModel("qwen3:8b", {
      OLLAMA_BASE_URL: "http://mini.local:11434/",
    });
    expect(model).toMatchObject({
      id: "qwen3:8b",
      provider: "ollama",
      baseUrl: "http://mini.local:11434/v1",
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    });
  });

  it("the live Pi runtime registers Ollama and selects the configured runtime model", async () => {
    const source = await readFile(path.join(import.meta.dirname, "pi-runtime.ts"), "utf8");
    expect(source).toContain("ollamaProvider(ollamaBaseUrl())");
    expect(source).toContain("ollamaRuntimeModel(modelId)");
    expect(source).toMatch(/provider === OLLAMA_PROVIDER_ID/);
    expect(source).toMatch(/provider === OLLAMA_PROVIDER_ID\s*\?\s*"ollama"/s);
  });
});
