import { describe, expect, it } from "vitest";
import {
  defaultModelForProvider,
  detectEnvCredentials,
  detectLocalModelServers,
  ENV_CREDENTIAL_SOURCES,
} from "./sync.js";

describe("detectEnvCredentials", () => {
  it("finds well-known env keys with provider metadata", () => {
    const hints = detectEnvCredentials({
      ANTHROPIC_API_KEY: "sk-ant-abcdefghij",
      XAI_API_KEY: "xai-abcdefghijk",
      OPENAI_API_KEY: "tiny",
    });
    expect(hints.map((hint) => hint.provider)).toEqual(["anthropic", "xai"]);
    expect(hints[0]).toMatchObject({ envVar: "ANTHROPIC_API_KEY", apiKey: "sk-ant-abcdefghij" });
    expect(hints[0]?.modelId).toBeTruthy();
  });

  it("prefers GEMINI_API_KEY over GOOGLE_API_KEY for the same provider", () => {
    const hints = detectEnvCredentials({
      GEMINI_API_KEY: "gemini-key-123456",
      GOOGLE_API_KEY: "google-key-123456",
    });
    expect(hints.filter((hint) => hint.provider === "google")).toHaveLength(1);
    expect(hints[0]?.envVar).toBe("GEMINI_API_KEY");
  });

  it("returns nothing when the environment is empty", () => {
    expect(detectEnvCredentials({})).toEqual([]);
  });

  it("every source maps to a real provider in the catalog", () => {
    for (const source of ENV_CREDENTIAL_SOURCES) {
      expect(defaultModelForProvider(source.provider), source.provider).toBeTruthy();
    }
  });
});

describe("detectLocalModelServers", () => {
  it("reports a running Ollama with its models", async () => {
    const fetchFn = (async () =>
      new Response(JSON.stringify({ models: [{ name: "llama3.1:8b" }] }), {
        status: 200,
      })) as typeof fetch;
    const [server] = await detectLocalModelServers({ fetchFn });
    expect(server?.provider).toBe("ollama");
    expect(server?.running).toBe(true);
    expect(server?.models).toEqual(["llama3.1:8b"]);
  });

  it("reports a stopped Ollama without throwing", async () => {
    const fetchFn = (async () => {
      throw new Error("fetch failed");
    }) as typeof fetch;
    const [server] = await detectLocalModelServers({ fetchFn });
    expect(server?.running).toBe(false);
    expect(server?.error).toBe("fetch failed");
  });
});
