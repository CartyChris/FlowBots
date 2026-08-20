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

    const secretLookup = vi.fn(async () => ({ id: "secret-1", ciphertext: "encrypted" }));
    const deps = {
      prisma: {
        userModelCredential: {
          findFirst: vi.fn(async () => ({
            secretId: "secret-1",
            provider: "xai",
          })),
        },
        secret: {
          findFirst: secretLookup,
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

    expect(secretLookup).toHaveBeenCalledWith({
      where: {
        id: "secret-1",
        userId: actor.userId,
        workspaceId: actor.workspaceId,
      },
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(
      models.some((entry) => entry.provider === "xai" && entry.id === "grok-account-latest"),
    ).toBe(true);
  });
});

describe("models.setDefault isolation", () => {
  it("changes exactly one default inside the active workspace and never mutates another workspace", async () => {
    const rows = [
      {
        id: "w1-openai",
        userId: actor.userId,
        workspaceId: actor.workspaceId,
        provider: "openai",
        isDefault: false,
        defaultModel: "old-openai",
      },
      {
        id: "w1-xai",
        userId: actor.userId,
        workspaceId: actor.workspaceId,
        provider: "xai",
        isDefault: true,
        defaultModel: "grok-current",
      },
      {
        id: "w2-openai",
        userId: actor.userId,
        workspaceId: "workspace-2",
        provider: "openai",
        isDefault: true,
        defaultModel: "keep-other-workspace",
      },
    ];

    function matches(row: (typeof rows)[number], where: Record<string, unknown>) {
      return Object.entries(where).every(([key, value]) => {
        if (key === "id") return row.id === value;
        if (key === "userId") return row.userId === value;
        if (key === "workspaceId") return row.workspaceId === value;
        if (key === "provider") return row.provider === value;
        return true;
      });
    }

    const prisma = {
      userModelCredential: {
        findFirst: vi.fn(
          async ({ where }: { where: Record<string, unknown> }) =>
            rows.find((row) => matches(row, where)) ?? null,
        ),
        updateMany: vi.fn(
          async ({
            where,
            data,
          }: {
            where: Record<string, unknown>;
            data: Record<string, unknown>;
          }) => {
            let count = 0;
            for (const row of rows) {
              if (!matches(row, where)) continue;
              Object.assign(row, data);
              count += 1;
            }
            return { count };
          },
        ),
        update: vi.fn(
          async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
            const row = rows.find((candidate) => candidate.id === where.id);
            if (!row) throw new Error("missing credential");
            Object.assign(row, data);
            return row;
          },
        ),
      },
    };
    const deps = {
      prisma: {
        ...prisma,
        $transaction: vi.fn(async (callback: (tx: typeof prisma) => unknown) => callback(prisma)),
      },
    } as unknown as RouterDeps;

    await clientFor(deps).models.setDefault({ provider: "openai", modelId: "gpt-active" });

    expect(rows).toEqual([
      expect.objectContaining({
        id: "w1-openai",
        isDefault: true,
        defaultModel: "gpt-active",
      }),
      expect.objectContaining({
        id: "w1-xai",
        isDefault: false,
        defaultModel: "grok-current",
      }),
      expect.objectContaining({
        id: "w2-openai",
        isDefault: true,
        defaultModel: "keep-other-workspace",
      }),
    ]);
  });
});
