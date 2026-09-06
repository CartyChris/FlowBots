import type { Actor } from "@rakazo/contracts";
import { IsolationError, type PrismaClient } from "@rakazo/db";

/** User text answers are not permission decisions and cannot release action checkpoints. */
export async function queueThreadAnswer(
  prisma: PrismaClient,
  scope: Pick<Actor, "workspaceId" | "userId">,
  input: { botId: string; runId: string; answer: string },
) {
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM runs WHERE id = ${input.runId} FOR UPDATE`;
    const run = await tx.run.findFirst({
      where: { ...scope, id: input.runId, botId: input.botId, groupChatId: null },
      include: { bot: { select: { userId: true, workspaceId: true } } },
    });
    if (!run || run.bot.userId !== scope.userId || run.bot.workspaceId !== scope.workspaceId)
      throw new IsolationError();
    if (run.checkpoint?.startsWith("approval:"))
      throw new Error("Use Action approvals to resolve this pending action");
    if (run.status !== "waiting_input") throw new Error("This run is not waiting for an answer");
    await tx.run.update({
      where: { id: run.id },
      data: { status: "queued", leaseOwner: null, leaseExpiresAt: null },
    });
    await tx.task.update({
      where: { id: run.taskId, ...scope, botId: run.botId, threadId: run.threadId },
      data: { prompt: input.answer },
    });
  });
}
