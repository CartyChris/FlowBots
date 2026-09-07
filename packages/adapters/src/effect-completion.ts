import type { Prisma, PrismaClient } from "@rakazo/db";

interface EffectCompletionProof {
  workspaceId: string;
  runId: string;
  effectId: string;
  leaseOwner: string;
  leaseFence: number;
}

/** Serialize with lease transfer/cancellation so stale callbacks cannot poison replay receipts. */
export async function completeFencedEffect(
  prisma: PrismaClient,
  proof: EffectCompletionProof,
  result: unknown,
): Promise<boolean> {
  const storedResult =
    result &&
    typeof result === "object" &&
    (result as { kind?: unknown }).kind === "agent_tool_result" &&
    "details" in result
      ? (result as { details: unknown }).details
      : result;
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM runs WHERE id = ${proof.runId} AND "workspaceId" = ${proof.workspaceId} FOR UPDATE`;
    const owner = await tx.run.findFirst({
      where: {
        id: proof.runId,
        workspaceId: proof.workspaceId,
        status: "running",
        leaseOwner: proof.leaseOwner,
        leaseFence: proof.leaseFence,
        leaseExpiresAt: { gt: new Date() },
      },
      select: { id: true },
    });
    if (!owner) return false;
    const completed = await tx.externalEffect.updateMany({
      where: {
        id: proof.effectId,
        runId: proof.runId,
        workspaceId: proof.workspaceId,
        status: "intended",
      },
      data: { status: "completed", result: storedResult as Prisma.InputJsonValue },
    });
    if (completed.count !== 1) throw new Error("Tool effect is missing or already finalized");
    return true;
  });
}
