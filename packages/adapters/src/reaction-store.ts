import { randomUUID } from "node:crypto";
import { isReactionKind, type ReactionKind } from "@rakazo/core";
import type { PrismaClient } from "@rakazo/db";

export interface ReactionActor {
  workspaceId: string;
  userId: string;
  actorKey?: string;
}

export interface ReactionSummary {
  kind: ReactionKind;
  count: number;
  reactedByMe: boolean;
}

export async function setMessageReaction(
  prisma: PrismaClient,
  actor: ReactionActor,
  input: { messageId: string; kind: string; active: boolean },
): Promise<ReactionSummary[]> {
  const messageId = input.messageId.trim();
  if (!messageId) throw new Error("Reaction message id is required.");
  if (!isReactionKind(input.kind)) throw new Error(`Unsupported reaction: ${input.kind}`);
  await assertMessageAccess(prisma, actor, messageId);
  const actorKey = actor.actorKey ?? `user:${actor.userId}`;

  if (input.active) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "message_reactions" ("id", "messageId", "workspaceId", "actorKey", "kind")
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT ("messageId", "actorKey", "kind") DO NOTHING`,
      randomUUID(),
      messageId,
      actor.workspaceId,
      actorKey,
      input.kind,
    );
  } else {
    await prisma.$executeRawUnsafe(
      `DELETE FROM "message_reactions"
       WHERE "messageId" = $1 AND "actorKey" = $2 AND "kind" = $3`,
      messageId,
      actorKey,
      input.kind,
    );
  }
  return reactionSummary(prisma, actor, messageId);
}

export async function listMessageReactions(
  prisma: PrismaClient,
  actor: ReactionActor,
  messageId: string,
): Promise<ReactionSummary[]> {
  const normalized = messageId.trim();
  if (!normalized) throw new Error("Reaction message id is required.");
  await assertMessageAccess(prisma, actor, normalized);
  return reactionSummary(prisma, actor, normalized);
}

async function assertMessageAccess(
  prisma: PrismaClient,
  actor: ReactionActor,
  messageId: string,
): Promise<void> {
  const rows = await prisma.$queryRawUnsafe<Array<{ messageId: string }>>(
    `SELECT m."id" AS "messageId"
     FROM "messages" m
     INNER JOIN "threads" t ON t."id" = m."threadId"
     WHERE m."id" = $1 AND t."workspaceId" = $2 AND t."userId" = $3
     LIMIT 1`,
    messageId,
    actor.workspaceId,
    actor.userId,
  );
  if (rows.length !== 1) throw new Error("Message is not available in this workspace.");
}

async function reactionSummary(
  prisma: PrismaClient,
  actor: ReactionActor,
  messageId: string,
): Promise<ReactionSummary[]> {
  const rows = await prisma.$queryRawUnsafe<Array<{ kind: string; actorKey: string }>>(
    `SELECT "kind", "actorKey"
     FROM "message_reactions"
     WHERE "messageId" = $1 AND "workspaceId" = $2
     ORDER BY "createdAt" ASC, "id" ASC`,
    messageId,
    actor.workspaceId,
  );
  const mine = actor.actorKey ?? `user:${actor.userId}`;
  const grouped = new Map<ReactionKind, ReactionSummary>();
  for (const row of rows) {
    if (!isReactionKind(row.kind)) continue;
    const current = grouped.get(row.kind) ?? {
      kind: row.kind,
      count: 0,
      reactedByMe: false,
    };
    current.count += 1;
    current.reactedByMe ||= row.actorKey === mine;
    grouped.set(row.kind, current);
  }
  return [...grouped.values()];
}
