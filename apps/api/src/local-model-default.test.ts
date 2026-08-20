import { createRouterClient } from "@orpc/server";
import { describe, expect, it, vi } from "vitest";
import { createRouter, type RouterDeps } from "./router.js";

const actor = {
  userId: "user-1",
  workspaceId: "workspace-1",
  isDeploymentOwner: true,
};

function clientFor(deps: RouterDeps) {
  return createRouterClient(createRouter(deps), {
    context: {
      actor,
      signal: new AbortController().signal,
    } as never,
  });
}

describe("credentialless local model defaults", () => {
  it("persists an Ollama model preference without creating a secret and keeps other workspaces isolated", async () => {
    const rows = [
      {
        id: "w1-openai",
        userId: actor.userId,
        workspaceId: actor.workspaceId,
        provider: "openai",
        label: "OpenAI",
        secretId: "secret-openai" as string | null,
        isDefault: true,
        defaultModel: "gpt-current",
      },
      {
        id: "w2-xai",
        userId: actor.userId,
        workspaceId: "workspace-2",
        provider: "xai",
        label: "xAI",
        secretId: "secret-xai" as string | null,
        isDefault: true,
        defaultModel: "grok-current",
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

    const userModelCredential = {
      findFirst: vi.fn(
        async ({ where }: { where: Record<string, unknown> }) =>
          rows.find((row) => matches(row, where)) ?? null,
      ),
      findMany: vi.fn(
        async ({ where }: { where: Record<string, unknown> }) =>
          rows.filter((row) => matches(row, where)),
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
      update: vi.fn(async () => {
        throw new Error("credentialless Ollama should not update an unrelated credential");
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const created = {
          id: "w1-ollama",
          userId: String(data.userId),
          workspaceId: String(data.workspaceId),
          provider: String(data.provider),
          label: String(data.label),
          secretId: (data.secretId ?? null) as string | null,
          isDefault: Boolean(data.isDefault),
          defaultModel: String(data.defaultModel),
        };
        rows.push(created);
        return created;
      }),
    };
    const tx = { userModelCredential };
    const deps = {
      prisma: {
        userModelCredential,
        $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
      },
    } as unknown as RouterDeps;

    const client = clientFor(deps);
    await client.models.setDefault({ provider: "ollama", modelId: "qwen3.8:9b" });

    expect(userModelCredential.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: actor.userId,
        workspaceId: actor.workspaceId,
        provider: "ollama",
        label: "Ollama",
        secretId: null,
        isDefault: true,
        defaultModel: "qwen3.8:9b",
      }),
    });
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "w1-openai", isDefault: false }),
        expect.objectContaining({
          id: "w1-ollama",
          workspaceId: actor.workspaceId,
          secretId: null,
          isDefault: true,
          defaultModel: "qwen3.8:9b",
        }),
        expect.objectContaining({
          id: "w2-xai",
          workspaceId: "workspace-2",
          isDefault: true,
          defaultModel: "grok-current",
        }),
      ]),
    );

    await expect(client.models.credentials()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "w1-openai",
          provider: "openai",
          hasKey: true,
        }),
        expect.objectContaining({
          id: "w1-ollama",
          provider: "ollama",
          hasKey: false,
          isDefault: true,
        }),
      ]),
    );
  });
});
