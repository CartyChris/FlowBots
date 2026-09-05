import type { Actor, MissionTask } from "@rakazo/contracts";
import { IsolationError, type PrismaClient } from "@rakazo/db";

const LIMIT = 200;
const SAFE_EVENTS = [
  "run.started",
  "run.completed",
  "run.failed",
  "run.cancelled",
  "collaboration.handoff.started",
  "collaboration.handoff.accepted",
  "agent.tool.started",
  "agent.tool.finished",
];
const SAFE_FIELDS = [
  "name",
  "executionId",
  "taskId",
  "parentTaskId",
  "rootTaskId",
  "sourceBotId",
  "targetBotId",
  "childRunId",
  "artifactIds",
];

export async function listMissions(prisma: PrismaClient, actor: Actor) {
  const rows = await prisma.task.findMany({
    where: { workspaceId: actor.workspaceId, userId: actor.userId },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: LIMIT + 1,
    include: { bot: { select: { name: true } }, runs: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  const selected = rows.slice(0, LIMIT);
  const runIds = selected.flatMap((t) => t.runs.map((r) => r.id));
  const counts = await prisma.artifact.groupBy({
    by: ["runId"],
    where: { workspaceId: actor.workspaceId, userId: actor.userId, runId: { in: runIds } },
    _count: true,
  });
  const artifacts = new Map(counts.map((row) => [row.runId, row._count]));
  const tasks: MissionTask[] = selected.map((row) => ({
    id: row.id,
    parentTaskId: row.parentTaskId,
    botId: row.botId,
    botName: row.bot.name,
    prompt: row.prompt.slice(0, 500),
    status: row.runs[0]?.status ?? row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    runId: row.runs[0]?.id ?? null,
    groupChatId: row.groupChatId,
    kind: row.parentTaskId ? "delegate" : row.groupChatId ? "group" : null,
    artifactCount: row.runs[0] ? (artifacts.get(row.runs[0].id) ?? 0) : 0,
  }));
  return { tasks, truncated: rows.length > LIMIT };
}

export async function getMission(prisma: PrismaClient, actor: Actor, taskId: string) {
  const row = await prisma.task.findFirst({
    where: { id: taskId, workspaceId: actor.workspaceId, userId: actor.userId },
    include: {
      bot: { select: { name: true } },
      runs: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });
  if (!row) throw new IsolationError();
  const runIds = row.runs.map((r) => r.id);
  const [artifacts, events] = await Promise.all([
    prisma.artifact.findMany({
      where: {
        workspaceId: actor.workspaceId,
        userId: actor.userId,
        botId: row.botId,
        runId: { in: runIds },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        botId: true,
        runId: true,
        name: true,
        mimeType: true,
        size: true,
        createdAt: true,
      },
    }),
    prisma.event.findMany({
      where: {
        workspaceId: actor.workspaceId,
        botId: row.botId,
        runId: { in: runIds },
        type: { in: SAFE_EVENTS },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, type: true, createdAt: true, botId: true, payload: true },
    }),
  ]);
  return {
    task: {
      id: row.id,
      parentTaskId: row.parentTaskId,
      botId: row.botId,
      botName: row.bot.name,
      prompt: row.prompt,
      status: row.runs[0]?.status ?? row.status,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      runId: row.runs[0]?.id ?? null,
      groupChatId: row.groupChatId,
      kind: row.parentTaskId ? "delegate" : row.groupChatId ? "group" : null,
      artifactCount: artifacts.length,
    },
    contextPacket: row.contextPacket as Record<string, unknown> | null,
    artifacts: artifacts.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() })),
    events: events.reverse().map((e) => ({
      ...e,
      createdAt: e.createdAt.toISOString(),
      payload: Object.fromEntries(
        Object.entries((e.payload ?? {}) as Record<string, unknown>).filter(([key]) =>
          SAFE_FIELDS.includes(key),
        ),
      ),
    })),
  };
}
