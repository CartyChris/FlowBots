import type { MessageBlock } from "@rakazo/contracts";
import type { PrismaClient } from "./client.js";
import { createGroupMessageInTransaction } from "./group-messages.js";

interface GroupFinalizeBase {
  workspaceId: string;
  threadId: string;
  botId: string;
  groupChatId: string;
  runId: string;
  taskId: string;
  attemptId: string;
  leaseOwner: string;
  leaseFence: number;
  authorName: string;
  authorColor: string;
}

export type FinalizeGroupRunInput = GroupFinalizeBase &
  ({ outcome: "completed"; blocks: MessageBlock[] } | { outcome: "failed"; error: string });

export async function finalizeGroupRun(
  prisma: PrismaClient,
  input: FinalizeGroupRunInput,
): Promise<boolean> {
  const committed = await prisma.$transaction(async (tx) => {
    const now = new Date();
    const terminal = await tx.run.updateMany({
      where: {
        id: input.runId,
        workspaceId: input.workspaceId,
        threadId: input.threadId,
        botId: input.botId,
        taskId: input.taskId,
        groupChatId: input.groupChatId,
        status: "running",
        leaseOwner: input.leaseOwner,
        leaseFence: input.leaseFence,
      },
      data: {
        status: input.outcome,
        error: input.outcome === "failed" ? input.error : null,
        completedAt: now,
        leaseOwner: null,
        leaseExpiresAt: null,
      },
    });
    if (terminal.count !== 1) return false;

    const attempt = await tx.attempt.updateMany({
      where: {
        id: input.attemptId,
        runId: input.runId,
        fence: input.leaseFence,
        status: "running",
      },
      data: {
        status: input.outcome,
        error: input.outcome === "failed" ? input.error : null,
        finishedAt: now,
      },
    });
    if (attempt.count !== 1) throw new Error("Active group run attempt was not available to finalize");

    const task = await tx.task.updateMany({
      where: {
        id: input.taskId,
        workspaceId: input.workspaceId,
        threadId: input.threadId,
        botId: input.botId,
        groupChatId: input.groupChatId,
      },
      data: { status: input.outcome },
    });
    if (task.count !== 1) throw new Error("Group run task was not available to finalize");

    if (input.outcome === "completed") {
      await createGroupMessageInTransaction(tx, {
        groupChatId: input.groupChatId,
        authorKind: "bot",
        botId: input.botId,
        authorName: input.authorName,
        authorColor: input.authorColor,
        blocks: input.blocks,
        runId: input.runId,
      });
    }
    await tx.event.deleteMany({ where: { runId: input.runId, type: "thread.progress" } });
    await tx.bot.update({ where: { id: input.botId }, data: { updatedAt: now } });
    return true;
  });
  return committed;
}
