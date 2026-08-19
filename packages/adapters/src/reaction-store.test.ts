import type { PrismaClient } from "@rakazo/db";
import { describe, expect, it, vi } from "vitest";
import { listMessageReactions, setMessageReaction } from "./reaction-store.js";

function prismaHarness() {
  const rows: Array<{ kind: string; actorKey: string }> = [];
  const prisma = {
    $queryRawUnsafe: vi.fn(async (sql: string, ...params: unknown[]) => {
      if (sql.includes("FROM \"messages\" m")) {
        return [{ messageId: params[0], workspaceId: "workspace-1", userId: "user-1" }];
      }
      if (sql.includes("FROM \"message_reactions\"")) return [...rows];
      return [];
    }),
    $executeRawUnsafe: vi.fn(async (sql: string, ...params: unknown[]) => {
      if (sql.startsWith("INSERT")) {
        const actorKey = String(params[3]);
        const kind = String(params[4]);
        if (!rows.some((row) => row.actorKey === actorKey && row.kind === kind)) {
          rows.push({ actorKey, kind });
          return 1;
        }
        return 0;
      }
      if (sql.startsWith("DELETE")) {
        const actorKey = String(params[1]);
        const kind = String(params[2]);
        const index = rows.findIndex((row) => row.actorKey === actorKey && row.kind === kind);
        if (index >= 0) {
          rows.splice(index, 1);
          return 1;
        }
        return 0;
      }
      return 0;
    }),
  } as unknown as PrismaClient;
  return { prisma, rows };
}

describe("message reactions", () => {
  it("sets the same actor+emoji idempotently and summarizes counts", async () => {
    const { prisma, rows } = prismaHarness();
    const actor = { workspaceId: "workspace-1", userId: "user-1" };

    await setMessageReaction(prisma, actor, {
      messageId: "message-1",
      kind: "fire",
      active: true,
    });
    await setMessageReaction(prisma, actor, {
      messageId: "message-1",
      kind: "fire",
      active: true,
    });

    expect(rows).toEqual([{ actorKey: "user:user-1", kind: "fire" }]);
    await expect(listMessageReactions(prisma, actor, "message-1")).resolves.toEqual([
      { kind: "fire", count: 1, reactedByMe: true },
    ]);
  });

  it("removes a reaction idempotently", async () => {
    const { prisma, rows } = prismaHarness();
    rows.push({ actorKey: "user:user-1", kind: "eyes" });
    const actor = { workspaceId: "workspace-1", userId: "user-1" };

    await setMessageReaction(prisma, actor, {
      messageId: "message-1",
      kind: "eyes",
      active: false,
    });
    await setMessageReaction(prisma, actor, {
      messageId: "message-1",
      kind: "eyes",
      active: false,
    });

    expect(rows).toEqual([]);
  });

  it("rejects unknown reactions before touching persistence", async () => {
    const { prisma } = prismaHarness();
    await expect(
      setMessageReaction(
        prisma,
        { workspaceId: "workspace-1", userId: "user-1" },
        { messageId: "message-1", kind: "nope", active: true },
      ),
    ).rejects.toThrow(/reaction/i);
    expect(prisma.$executeRawUnsafe).not.toHaveBeenCalled();
  });

  it("rejects a message outside the actor workspace", async () => {
    const { prisma } = prismaHarness();
    vi.mocked(prisma.$queryRawUnsafe).mockResolvedValueOnce([]);
    await expect(
      setMessageReaction(
        prisma,
        { workspaceId: "workspace-2", userId: "user-1" },
        { messageId: "message-1", kind: "joy", active: true },
      ),
    ).rejects.toThrow(/message/i);
  });
});
