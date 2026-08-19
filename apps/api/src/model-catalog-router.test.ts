import { createRouterClient } from "@orpc/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRouter, type RouterDeps } from "./router.js";

const actor = {
  userId: "user-1",
  workspaceId: "workspace-1",
  isDeploymentOwner: true,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

function clientFor(deps: RouterDeps) {
  return createRouterClient(createRouter(deps), {
    context: {
      actor,
      signal: new AbortController().signal,
    } as never,
  });
}

describe("models.list refresh", () => {
  it("discovers currently installed Ollama models through the API boundary", async () => {
    const fetchFn = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === "http://127.0.0.1:11434/api/tags") {
        return new Response(
          JSON.stringify({
            models: [{ name: "qwen3.8:9b" }, { name: "devstral:latest" }],
          }),
        );
      }
      throw new Error(`unexpected request ${url}`);
    });
    vi.stubGlobal("fetch", fetchFn);

    const deps = {
      prisma: {
        userModelCredential: {
          findFirst: vi.fn(async () => null),
        },
      },
      env: {
        defaultProvider: "scripted",
        defaultModel: "scripted",
        ollamaBaseUrl: "http://127.0.0.1:11434",
        webOrigin: "http://127.0.0.1:5173",
        screenProxySecret: "test-secret",
        sandboxProvider: "desktop",
      },
    } as unknown as RouterDeps;

    const models = await clientFor(deps).models.list({ refresh: true });

    expect(fetchFn).toHaveBeenCalledWith(
      "http://127.0.0.1:11434/api/tags",
      expect.objectContaining({ method: "GET" }),
    );
    expect(models.filter((entry) => entry.provider === "ollama").map((entry) => entry.id)).toEqual(
      expect.arrayContaining(["qwen3.8:9b", "devstral:latest"]),
    );
  });

  it("uses the encrypted xAI credential on the server when refreshing account models", async () => {
    const fetchFn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url === "https://api.x.ai/v1/language-models") {
        expect(new Headers(init?.headers).get("authorization")).toBe("Bearer xai-private-key");
        return new Response(
          JSON.stringify({
            models: [{ id: "grok-account-latest", aliases: ["grok-latest"] }],
          }),
        );
      }
      throw new Error(`unexpected request ${url}`);
    });
    vi.stubGlobal("fetch", fetchFn);

    const deps = {
      prisma: {
        userModelCredential: {
          findFirst: vi.fn(async () => ({
            secretId: "secret-1",
            provider: "xai",
          })),
        },
        secret: {
          findUnique: vi.fn(async () => ({ id: "secret-1", ciphertext: "encrypted" })),
        },
      },
      secrets: {
        load: vi.fn(() => "xai-private-key"),
      },
      env: {
        defaultProvider: "scripted",
        defaultModel: "scripted",
        ollamaBaseUrl: "",
        webOrigin: "http://127.0.0.1:5173",
        screenProxySecret: "test-secret",
        sandboxProvider: "desktop",
      },
    } as unknown as RouterDeps;

    const models = await clientFor(deps).models.list({ refresh: true });

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(models.some((entry) => entry.provider === "xai" && entry.id === "grok-account-latest")).toBe(
      true,
    );
  });
});
