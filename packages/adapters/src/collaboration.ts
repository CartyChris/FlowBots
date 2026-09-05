import { createHash } from "node:crypto";
import type { Actor, MessageBlock } from "@rakazo/contracts";
import {
  ACTIVE_RUN_STATUSES,
  assertCollaborationAllowed,
  botParticipatesInFlow,
  type ContextPacket,
  createContextPacket,
  MAX_COLLABORATION_TASKS,
} from "@rakazo/core";
import {
  appendEventInTransaction,
  IsolationError,
  type Prisma,
  type PrismaClient,
  type Task,
} from "@rakazo/db";

type Scope = Pick<Actor, "workspaceId" | "userId">;
type Tx = Prisma.TransactionClient;
type Assignment = { botId: string; packet: ContextPacket };
export interface CollaborativeTasksInput extends Scope {
  sourceBotId: string;
  sourceRunId: string;
  requestId: string;
  sourceLeaseOwner?: string;
  sourceLeaseFence?: number;
  assignments: Assignment[];
}

/** Existing Task/Run execution, with atomic ownership, compact context and bounded lineage. */
export async function createCollaborativeTasks(
  prisma: PrismaClient,
  input: CollaborativeTasksInput,
) {
  if (!input.requestId.trim() || input.requestId.length > 256)
    throw new Error("Invalid collaboration request ID");
  const assignments = input.assignments.map(({ botId, packet }) => ({
    botId,
    packet: createContextPacket({ ...packet }),
  }));
  return prisma.$transaction(
    async (tx) => {
      const initial = await tx.run.findFirst({
        where: {
          id: input.sourceRunId,
          workspaceId: input.workspaceId,
          userId: input.userId,
          botId: input.sourceBotId,
        },
      });
      if (!initial) throw new IsolationError();
      const lineage = await taskLineage(tx, input, initial.taskId);
      const root = lineage.at(-1)!;
      // All delegation and cancellation in a tree share this lock. A cancelled tree cannot grow.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${root.id}, 0))::text`;
      await tx.$queryRaw`SELECT id FROM runs WHERE id = ${initial.id} FOR UPDATE`;
      const sourceRun = await tx.run.findFirst({
        where: {
          id: initial.id,
          workspaceId: input.workspaceId,
          userId: input.userId,
          botId: input.sourceBotId,
          status: "running",
        },
        include: { bot: true, task: true },
      });
      if (!sourceRun) throw new Error("Source run is no longer active; collaboration stopped");
      if (
        sourceRun.leaseOwner !== (input.sourceLeaseOwner ?? null) ||
        sourceRun.leaseFence !== (input.sourceLeaseFence ?? 0)
      )
        throw new Error("Source run lease changed; stale collaboration attempt rejected");
      if (!botParticipatesInFlow(sourceRun.bot.instructions))
        throw new Error("Source bot is separated from the Flow");
      if (sourceRun.groupChatId !== sourceRun.task.groupChatId) throw new IsolationError();
      const requestHash = createHash("sha256").update(JSON.stringify(assignments)).digest("hex");
      const receipt = await tx.collaborationRequest.findUnique({
        where: {
          parentTaskId_requestId: { parentTaskId: sourceRun.taskId, requestId: input.requestId },
        },
      });
      if (receipt && receipt.requestHash !== requestHash)
        throw new Error("Collaboration request ID was reused with different work");
      await requireRoomMembers(tx, input, sourceRun.groupChatId, [
        input.sourceBotId,
        ...assignments.map((a) => a.botId),
      ]);
      const children = await tx.task.findMany({
        where: {
          parentTaskId: sourceRun.taskId,
          workspaceId: input.workspaceId,
          userId: input.userId,
        },
        include: { runs: { orderBy: { createdAt: "desc" }, take: 1 } },
      });
      const targets = new Map<string, Awaited<ReturnType<typeof requireTarget>>>();
      for (const botId of [...new Set(assignments.map((a) => a.botId))].sort()) {
        // Serialize scheduling of the same target from distinct parent trees.
        await tx.$queryRaw`SELECT id FROM bots WHERE id = ${botId} AND "workspaceId" = ${input.workspaceId} AND "userId" = ${input.userId} FOR UPDATE`;
        targets.set(botId, await requireTarget(tx, input, botId));
      }
      const resolved = assignments.map((assignment) => {
        const key = createHash("sha256")
          .update(`${input.requestId}:${assignment.botId}`)
          .digest("hex");
        const exact = children.find((c) => c.collaborationKey === key);
        if (
          exact &&
          (exact.botId !== assignment.botId ||
            JSON.stringify(exact.contextPacket) !== JSON.stringify(assignment.packet))
        ) {
          // PostgreSQL JSONB reorders keys; compare canonical packets instead of serialized stored JSON below.
          if (
            exact.botId !== assignment.botId ||
            JSON.stringify(createContextPacket(exact.contextPacket as Record<string, unknown>)) !==
              JSON.stringify(assignment.packet)
          )
            throw new Error("Collaboration request ID was reused with different work");
        }
        const duplicate =
          exact ??
          children.find(
            (c) =>
              c.botId === assignment.botId &&
              c.contextPacket &&
              JSON.stringify(createContextPacket(c.contextPacket as Record<string, unknown>)) ===
                JSON.stringify(assignment.packet),
          );
        return { ...assignment, key, duplicate };
      });
      assertCollaborationAllowed({
        ancestorBotIds: lineage.map((t) => t.botId),
        targetBotIds: assignments.map((a) => a.botId),
        existingChildren: children.length - resolved.filter((a) => a.duplicate).length,
      });
      const newWork = resolved.filter((a) => !a.duplicate);
      const total = await tx.task.count({
        where: { rootTaskId: root.id, workspaceId: input.workspaceId, userId: input.userId },
      });
      if (total + newWork.length > MAX_COLLABORATION_TASKS)
        throw new Error(`Team task budget exhausted (${MAX_COLLABORATION_TASKS} descendants)`);
      const received = sourceRun.task.contextPacket
        ? createContextPacket(sourceRun.task.contextPacket as Record<string, unknown>).artifactIds
        : [];
      for (const item of resolved) {
        if (item.packet.artifactIds.length) {
          const allowed = await tx.artifact.count({
            where: {
              id: { in: item.packet.artifactIds },
              workspaceId: input.workspaceId,
              userId: input.userId,
              OR: [{ botId: input.sourceBotId }, { id: { in: received } }],
            },
          });
          if (allowed !== item.packet.artifactIds.length)
            throw new IsolationError("Artifact reference is not available to this task");
        }
        if (
          !item.duplicate &&
          (await tx.run.count({
            where: { botId: item.botId, status: { in: [...ACTIVE_RUN_STATUSES] } },
          }))
        )
          throw new Error("Teammate is busy; wait for its current work to finish");
      }
      const results: Array<{ taskId: string; runId: string; botId: string; duplicate: boolean }> =
        [];
      for (const item of resolved) {
        if (item.duplicate) {
          const priorRun = item.duplicate.runs[0];
          if (!priorRun) throw new Error("Prior collaboration task has no run; recovery required");
          results.push({
            taskId: item.duplicate.id,
            runId: priorRun.id,
            botId: item.botId,
            duplicate: true,
          });
          continue;
        }
        const target = targets.get(item.botId)!;
        const fields = {
          workspaceId: input.workspaceId,
          userId: input.userId,
          botId: target.id,
          threadId: target.thread!.id,
          groupChatId: sourceRun.groupChatId,
          groupPromptSeq: sourceRun.groupPromptSeq,
        };
        const task = await tx.task.create({
          data: {
            ...fields,
            prompt: item.packet.objective,
            status: "queued",
            parentTaskId: sourceRun.taskId,
            rootTaskId: root.id,
            collaborationKey: item.key,
            contextPacket: item.packet as unknown as Prisma.InputJsonValue,
          },
        });
        const run = await tx.run.create({
          data: { ...fields, taskId: task.id, status: "queued", trigger: "collaboration" },
        });
        const payload = {
          parentTaskId: sourceRun.taskId,
          taskId: task.id,
          sourceBotId: input.sourceBotId,
          targetBotId: target.id,
          childRunId: run.id,
          artifactIds: item.packet.artifactIds,
        };
        await appendEventInTransaction(tx, {
          workspaceId: input.workspaceId,
          botId: input.sourceBotId,
          threadId: sourceRun.threadId,
          runId: sourceRun.id,
          type: "collaboration.handoff.started",
          payload,
        });
        await appendEventInTransaction(tx, {
          workspaceId: input.workspaceId,
          botId: target.id,
          threadId: target.thread!.id,
          runId: run.id,
          type: "collaboration.handoff.accepted",
          payload,
        });
        results.push({ taskId: task.id, runId: run.id, botId: target.id, duplicate: false });
      }
      if (!receipt)
        await tx.collaborationRequest.create({
          data: { parentTaskId: sourceRun.taskId, requestId: input.requestId, requestHash },
        });
      return results;
    },
    { timeout: 15_000 },
  );
}

async function requireTarget(tx: Tx, scope: Scope, botId: string) {
  const bot = await tx.bot.findFirst({
    where: { id: botId, workspaceId: scope.workspaceId, userId: scope.userId },
    include: { thread: true },
  });
  if (!bot?.thread) throw new IsolationError();
  if (!botParticipatesInFlow(bot.instructions))
    throw new Error("Teammate is separated from the Flow");
  return bot;
}
async function requireRoomMembers(
  tx: Tx,
  scope: Scope,
  groupChatId: string | null,
  botIds: string[],
) {
  if (!groupChatId) return;
  const room = await tx.groupChat.findFirst({
    where: { id: groupChatId, workspaceId: scope.workspaceId, userId: scope.userId },
    include: { members: { select: { botId: true } } },
  });
  if (!room || botIds.some((id) => !room.members.some((m) => m.botId === id)))
    throw new IsolationError("Collaboration requires current room membership");
}
async function taskLineage(tx: Tx, scope: Scope, taskId: string) {
  const lineage: Task[] = [];
  let current: string | null = taskId;
  const seen = new Set<string>();
  while (current) {
    if (seen.has(current) || seen.size > 12) throw new Error("Invalid task lineage cycle");
    seen.add(current);
    const task: Task | null = await tx.task.findFirst({
      where: { id: current, workspaceId: scope.workspaceId, userId: scope.userId },
    });
    if (!task) throw new IsolationError();
    lineage.push(task);
    current = task.parentTaskId;
  }
  return lineage;
}

export async function readCollaborativeResult(
  prisma: PrismaClient,
  input: Scope & { sourceRunId: string; taskId: string },
) {
  return prisma.$transaction(async (tx) => {
    const source = await tx.run.findFirst({
      where: { id: input.sourceRunId, workspaceId: input.workspaceId, userId: input.userId },
      include: { bot: true },
    });
    if (!source || !botParticipatesInFlow(source.bot.instructions)) throw new IsolationError();
    const task = await tx.task.findFirst({
      where: {
        id: input.taskId,
        parentTaskId: source.taskId,
        workspaceId: input.workspaceId,
        userId: input.userId,
      },
      include: { bot: true, runs: { orderBy: { createdAt: "desc" }, take: 1 } },
    });
    if (!task || !botParticipatesInFlow(task.bot.instructions)) throw new IsolationError();
    await requireRoomMembers(tx, input, task.groupChatId, [source.botId, task.botId]);
    const run = task.runs[0];
    const rows =
      run?.status !== "completed"
        ? []
        : task.groupChatId
          ? await tx.groupMessage.findMany({
              where: { runId: run.id, groupChatId: task.groupChatId, authorKind: "bot" },
              orderBy: { seq: "desc" },
              take: 8,
              select: { blocks: true },
            })
          : await tx.message.findMany({
              where: { runId: run.id, threadId: task.threadId, role: "bot" },
              orderBy: { seq: "desc" },
              take: 8,
              select: { blocks: true },
            });
    const text = rows
      .reverse()
      .flatMap((row) =>
        (row.blocks as MessageBlock[]).flatMap((b) => (b.kind === "text" ? [b.text] : [])),
      )
      .join("\n");
    const artifacts = run
      ? await tx.artifact.findMany({
          where: {
            runId: run.id,
            botId: task.botId,
            workspaceId: input.workspaceId,
            userId: input.userId,
          },
          take: 20,
          orderBy: { createdAt: "desc" },
          select: { id: true, name: true, mimeType: true, size: true },
        })
      : [];
    return {
      taskId: task.id,
      status: run?.status ?? task.status,
      result: text.slice(0, 6000),
      artifacts,
      truncated: text.length > 6000 || rows.length === 8 || artifacts.length === 20,
    };
  });
}

export async function cancelTaskTree(prisma: PrismaClient, input: Scope & { taskId: string }) {
  return prisma.$transaction(
    async (tx) => {
      const lineage = await taskLineage(tx, input, input.taskId);
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lineage.at(-1)!.id}, 0))::text`;
      const tasks = [lineage[0]!];
      // Breadth-first, bounded by the enforced collaboration depth/fanout. Existing roots work too.
      for (let cursor = 0; cursor < tasks.length; cursor++) {
        if (tasks.length > 64) throw new Error("Task tree exceeds recovery limit");
        const children = await tx.task.findMany({
          where: {
            parentTaskId: tasks[cursor]!.id,
            workspaceId: input.workspaceId,
            userId: input.userId,
          },
        });
        tasks.push(...children);
      }
      // Finalizers lock runs before updating tasks. Match that order and re-read status
      // after acquiring the locks so completed work never receives a cancellation event.
      for (const task of [...tasks].sort((a, b) => a.id.localeCompare(b.id)))
        await tx.$queryRaw`SELECT id FROM runs WHERE "taskId" = ${task.id} FOR UPDATE`;
      const active = await tx.run.findMany({
        where: {
          taskId: { in: tasks.map((t) => t.id) },
          workspaceId: input.workspaceId,
          userId: input.userId,
          status: { in: [...ACTIVE_RUN_STATUSES] },
        },
      });
      const now = new Date();
      const cancelledRunIds = active.map((r) => r.id);
      await tx.run.updateMany({
        where: { id: { in: cancelledRunIds }, status: { in: [...ACTIVE_RUN_STATUSES] } },
        data: {
          status: "cancelled",
          completedAt: now,
          leaseOwner: null,
          leaseExpiresAt: null,
          leaseFence: { increment: 1 },
        },
      });
      await tx.task.updateMany({
        where: { id: { in: tasks.map((t) => t.id) }, status: { in: [...ACTIVE_RUN_STATUSES] } },
        data: { status: "cancelled" },
      });
      await tx.attempt.updateMany({
        where: { runId: { in: cancelledRunIds }, status: "running" },
        data: { status: "cancelled", finishedAt: now },
      });
      await tx.event.deleteMany({
        where: { runId: { in: cancelledRunIds }, type: "thread.progress" },
      });
      for (const run of active)
        await appendEventInTransaction(tx, {
          workspaceId: input.workspaceId,
          botId: run.botId,
          threadId: run.threadId,
          runId: run.id,
          type: "run.cancelled",
          payload: {
            taskId: run.taskId,
            rootTaskId: lineage.at(-1)!.id,
            reason: "User stopped task and descendants",
          },
        });
      return { ok: true as const, cancelledRunIds };
    },
    { timeout: 15_000 },
  );
}
