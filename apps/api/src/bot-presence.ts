import type { Actor, BotPresenceSnapshot } from "@rakazo/contracts";
import { projectBotPresence } from "@rakazo/core";
import { IsolationError, Prisma, type PrismaClient } from "@rakazo/db";

type PresenceRow = {
  botId: string;
  botUpdatedAt: Date;
  runId: string | null;
  taskId: string | null;
  status: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  updatedAt: Date | null;
  modelProvider: string | null;
  modelId: string | null;
  eventType: string | null;
  eventCreatedAt: Date | null;
  toolName: string | null;
};

/**
 * One scoped query returns at most one run and one safe activity per requested bot.
 * LATERAL limits execute in SQL: long event histories never enter application memory.
 * Unfinished executions outrank finished parallel tools and delayed model call notifications.
 * A new run.started event supersedes tool activity from an earlier lease attempt.
 */
export async function hydrateBotPresence<T extends { id: string }>(
  prisma: PrismaClient,
  actor: Actor,
  bots: T[],
  now = Date.now(),
): Promise<Array<T & { presence: BotPresenceSnapshot }>> {
  if (bots.length === 0) return [];
  const rows = await prisma.$queryRaw<PresenceRow[]>(Prisma.sql`
    SELECT b.id AS "botId", b."updatedAt" AS "botUpdatedAt",
      r.id AS "runId", r."taskId", r.status, r."startedAt", r."completedAt", r."updatedAt",
      r."modelProvider", r."modelId", COALESCE(active.type, e.type) AS "eventType",
      COALESCE(active."createdAt", e."createdAt") AS "eventCreatedAt",
      CASE WHEN active.type IS NOT NULL THEN active.payload->>'name' ELSE e.payload->>'name' END AS "toolName"
    FROM bots b
    LEFT JOIN LATERAL (
      SELECT id, "taskId", status, "startedAt", "completedAt", "updatedAt", "modelProvider", "modelId"
      FROM runs
      WHERE "botId" = b.id AND "workspaceId" = ${actor.workspaceId} AND "userId" = ${actor.userId}
      ORDER BY CASE
        WHEN status IN ('running', 'leased', 'waiting_input', 'waiting_takeover') THEN 0
        WHEN status = 'queued' THEN 1 ELSE 2 END,
        "updatedAt" DESC, "createdAt" DESC, id DESC
      LIMIT 1
    ) r ON TRUE
    LEFT JOIN LATERAL (
      SELECT seq FROM events
      WHERE "runId" = r.id AND "botId" = b.id AND "workspaceId" = ${actor.workspaceId}
        AND type = 'run.started'
      ORDER BY seq DESC LIMIT 1
    ) attempt ON TRUE
    LEFT JOIN LATERAL (
      SELECT started.type, started."createdAt", started.payload
      FROM events started
      WHERE started."runId" = r.id AND started."botId" = b.id
        AND started."workspaceId" = ${actor.workspaceId} AND started.type = 'agent.tool.started'
        AND started.seq > COALESCE(attempt.seq, -1)
        AND started.payload->>'executionId' IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM events finished
          WHERE finished."runId" = r.id AND finished."botId" = b.id
            AND finished."workspaceId" = ${actor.workspaceId} AND finished.type = 'agent.tool.finished'
            AND finished.seq > started.seq
            AND finished.payload->>'executionId' = started.payload->>'executionId'
        )
      ORDER BY started.seq DESC LIMIT 1
    ) active ON TRUE
    LEFT JOIN LATERAL (
      SELECT type, "createdAt", payload
      FROM events
      WHERE "runId" = r.id AND "botId" = b.id AND "workspaceId" = ${actor.workspaceId}
        AND type IN ('run.started', 'agent.tool.started', 'agent.tool.finished')
      ORDER BY seq DESC
      LIMIT 1
    ) e ON TRUE
    WHERE b."workspaceId" = ${actor.workspaceId} AND b."userId" = ${actor.userId}
      AND b.id IN (${Prisma.join(bots.map((bot) => bot.id))})
  `);
  const byBot = new Map(rows.map((row) => [row.botId, row]));
  return bots.map((bot) => {
    const row = byBot.get(bot.id);
    if (!row) throw new IsolationError();
    return {
      ...bot,
      presence: projectBotPresence({
        botId: bot.id,
        updatedAt: row.botUpdatedAt.toISOString(),
        run:
          row.runId && row.taskId && row.status && row.updatedAt
            ? {
                id: row.runId,
                taskId: row.taskId,
                status: row.status,
                startedAt: row.startedAt?.toISOString() ?? null,
                completedAt: row.completedAt?.toISOString() ?? null,
                updatedAt: row.updatedAt.toISOString(),
                modelProvider: row.modelProvider,
                modelId: row.modelId,
              }
            : null,
        event:
          row.eventType && row.eventCreatedAt
            ? {
                runId: row.runId,
                type: row.eventType,
                createdAt: row.eventCreatedAt.toISOString(),
                payload: { name: row.toolName },
              }
            : null,
        now,
      }),
    };
  });
}
