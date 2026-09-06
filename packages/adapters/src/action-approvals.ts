import { createHash } from "node:crypto";
import {
  ActionApprovalSchema,
  type ActionPolicy,
  ActionPolicySchema,
  type Actor,
} from "@rakazo/contracts";
import { evaluateActionPolicy, redactSecrets } from "@rakazo/core";
import {
  appendEventInTransaction,
  IsolationError,
  type Prisma,
  type PrismaClient,
} from "@rakazo/db";

type Scope = Pick<Actor, "workspaceId" | "userId">;
type Database = PrismaClient | Prisma.TransactionClient;
export const APPROVAL_CHECKPOINT_PREFIX = "approval:";

export function actionFingerprint(
  tool: string,
  computerKind: string,
  args: Record<string, unknown>,
) {
  const canonical = JSON.stringify({ tool, computerKind, args }, (_key, value: unknown) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)))
      : value,
  );
  if (Buffer.byteLength(canonical) > 32_768)
    throw new Error("Action arguments exceed the 32 KiB review limit");
  return createHash("sha256").update(canonical).digest("hex");
}

function previewAction(args: Record<string, unknown>, secrets: string[]) {
  const preview = JSON.stringify(
    args,
    (key, value: unknown) =>
      /password|secret|token|authorization|credential|api.?key|content|body|text/i.test(key)
        ? "[protected value]"
        : value,
    2,
  );
  return redactSecrets(preview, secrets).slice(0, 1600);
}

async function requireBot(db: Database, scope: Scope, botId: string) {
  const bot = await db.bot.findFirst({ where: { id: botId, ...scope } });
  if (!bot) throw new IsolationError();
  return bot;
}

export async function getActionPolicy(
  db: Database,
  scope: Scope,
  botId: string,
): Promise<ActionPolicy> {
  await requireBot(db, scope, botId);
  const row = await db.botActionPolicy.findFirst({ where: { ...scope, botId } });
  if (!row) return { mode: "legacy", rules: [] };
  const parsed = ActionPolicySchema.safeParse(row.config);
  return parsed.success ? parsed.data : { mode: "read-only", rules: [] };
}

export async function saveActionPolicy(
  prisma: PrismaClient,
  scope: Scope,
  botId: string,
  input: ActionPolicy,
) {
  const policy = ActionPolicySchema.parse(input);
  return prisma.$transaction(async (tx) => {
    await requireBot(tx, scope, botId);
    await tx.$queryRaw`SELECT id FROM bots WHERE id = ${botId} FOR UPDATE`;
    await tx.botActionPolicy.upsert({
      where: { botId },
      create: { ...scope, botId, config: policy },
      update: { config: policy },
    });
    return policy;
  });
}

export async function requestActionApproval(
  prisma: PrismaClient,
  input: Scope & {
    botId: string;
    runId: string;
    threadId: string;
    leaseOwner: string;
    leaseFence: number;
    tool: string;
    executionId: string;
    args: Record<string, unknown>;
    computerKind: string;
    secrets: string[];
  },
) {
  const scope = { workspaceId: input.workspaceId, userId: input.userId };
  if (
    !input.executionId ||
    input.executionId.length > 256 ||
    !input.tool ||
    input.tool.length > 128
  )
    throw new Error("Invalid action execution identity");
  const fingerprint = actionFingerprint(input.tool, input.computerKind, input.args);
  return prisma.$transaction(async (tx) => {
    await requireBot(tx, scope, input.botId);
    await tx.$queryRaw`SELECT id FROM bots WHERE id = ${input.botId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM runs WHERE id = ${input.runId} FOR UPDATE`;
    const run = await tx.run.findFirst({
      where: { ...scope, id: input.runId, botId: input.botId, threadId: input.threadId },
    });
    if (!run) throw new IsolationError();
    if (run.leaseFence !== input.leaseFence)
      throw new Error("Stale worker lease cannot request approval");
    const existing = await tx.actionApproval.findUnique({
      where: { runId_executionId: { runId: input.runId, executionId: input.executionId } },
    });
    if (existing) {
      if (
        existing.fingerprint !== fingerprint ||
        existing.leaseOwner !== input.leaseOwner ||
        existing.leaseFence !== input.leaseFence
      )
        throw new Error("Action execution identity was reused with a different request or lease");
      if (
        existing.status !== "pending" ||
        run.status !== "waiting_input" ||
        run.checkpoint !== `${APPROVAL_CHECKPOINT_PREFIX}${existing.id}`
      )
        throw new Error("The original approval is no longer pending");
      return existing;
    }
    if (run.status !== "running" || run.leaseOwner !== input.leaseOwner)
      throw new Error("Run lease changed before action approval");
    const policy = await getActionPolicy(tx, scope, input.botId);
    const evaluation = evaluateActionPolicy(policy, {
      tool: input.tool,
      computerKind: input.computerKind,
      fingerprint,
    });
    if (evaluation.decision !== "ask")
      throw new Error(
        "Action policy changed before review; retry the task under its current policy",
      );
    const count = await tx.actionApproval.count({ where: { runId: run.id } });
    if (count >= 32) throw new Error("Run reached its 32-action review limit; start a fresh task");
    const approval = await tx.actionApproval.create({
      data: {
        ...scope,
        botId: input.botId,
        runId: run.id,
        threadId: run.threadId,
        executionId: input.executionId,
        leaseOwner: input.leaseOwner,
        leaseFence: input.leaseFence,
        tool: input.tool,
        computerKind: input.computerKind,
        scope: evaluation.scope,
        fingerprint,
        request: input.args as Prisma.InputJsonObject,
        preview: previewAction(input.args, input.secrets),
        expiresAt: new Date(Date.now() + 24 * 60 * 60_000),
      },
    });
    await tx.run.update({
      where: { id: run.id },
      data: {
        status: "waiting_input",
        checkpoint: `${APPROVAL_CHECKPOINT_PREFIX}${approval.id}`,
        leaseOwner: null,
        leaseExpiresAt: null,
      },
    });
    await tx.attempt.updateMany({
      where: { runId: run.id, fence: input.leaseFence, status: "running" },
      data: { status: "waiting_input", finishedAt: new Date() },
    });
    await appendEventInTransaction(tx, {
      workspaceId: run.workspaceId,
      botId: run.botId,
      threadId: run.threadId,
      runId: run.id,
      type: "action.approval.requested",
      payload: { approvalId: approval.id, tool: input.tool, scope: evaluation.scope },
    });
    return approval;
  });
}

export async function resolveActionApproval(
  prisma: PrismaClient,
  scope: Scope,
  approvalId: string,
  decision: "allow-once" | "allow-exact" | "deny",
) {
  return prisma.$transaction(async (tx) => {
    const initial = await tx.actionApproval.findFirst({ where: { ...scope, id: approvalId } });
    if (!initial) throw new IsolationError();
    await requireBot(tx, scope, initial.botId);
    await tx.$queryRaw`SELECT id FROM bots WHERE id = ${initial.botId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM runs WHERE id = ${initial.runId} FOR UPDATE`;
    const approval = await tx.actionApproval.findFirstOrThrow({
      where: { ...scope, id: approvalId },
    });
    const run = await tx.run.findFirst({
      where: { ...scope, id: approval.runId, botId: approval.botId, threadId: approval.threadId },
    });
    if (!run || ["cancelled", "failed", "completed"].includes(run.status))
      throw new Error("This run has stopped; its approval cannot execute");
    if (approval.status !== "pending") {
      if (approval.decision === decision) return { runId: run.id, queued: false };
      throw new Error("Approval already has a different decision");
    }
    if (approval.expiresAt.getTime() <= Date.now())
      throw new Error("Approval expired; stop the old task and request the action again");
    if (
      run.status !== "waiting_input" ||
      run.checkpoint !== `${APPROVAL_CHECKPOINT_PREFIX}${approval.id}`
    )
      throw new Error("Run is no longer waiting for this approval");
    const policy = await getActionPolicy(tx, scope, run.botId);
    if (decision !== "deny") {
      const evaluation = evaluateActionPolicy(policy, {
        tool: approval.tool,
        computerKind: approval.computerKind,
        fingerprint: approval.fingerprint,
      });
      if (evaluation.decision === "deny") throw new Error("Current policy blocks this action");
    }
    if (decision === "allow-exact") {
      const rules = [
        ...policy.rules.filter(
          (rule) => !(rule.tool === approval.tool && rule.fingerprint === approval.fingerprint),
        ),
        { tool: approval.tool, fingerprint: approval.fingerprint, decision: "allow" as const },
      ];
      const config = ActionPolicySchema.parse({ ...policy, rules });
      await tx.botActionPolicy.upsert({
        where: { botId: run.botId },
        create: { ...scope, botId: run.botId, config },
        update: { config },
      });
    }
    await tx.actionApproval.update({
      where: { id: approval.id },
      data: {
        status: decision === "deny" ? "denied" : "approved",
        decision,
        resolvedAt: new Date(),
      },
    });
    await tx.run.update({
      where: { id: run.id },
      data: { status: "queued", leaseOwner: null, leaseExpiresAt: null },
    });
    await appendEventInTransaction(tx, {
      workspaceId: run.workspaceId,
      botId: run.botId,
      threadId: run.threadId,
      runId: run.id,
      type: "action.approval.resolved",
      payload: { approvalId, tool: approval.tool, decision },
    });
    return { runId: run.id, queued: true };
  });
}

export async function listActionApprovals(prisma: PrismaClient, scope: Scope, botId?: string) {
  if (botId) await requireBot(prisma, scope, botId);
  const rows = await prisma.actionApproval.findMany({
    where: { ...scope, ...(botId ? { botId } : {}) },
    include: { bot: { select: { name: true } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 100,
  });
  const runs = await prisma.run.findMany({
    where: { ...scope, id: { in: rows.map((row) => row.runId) } },
    select: { id: true, status: true },
  });
  const states = new Map(runs.map((run) => [run.id, run.status]));
  return rows.map((row) =>
    ActionApprovalSchema.parse({
      id: row.id,
      botId: row.botId,
      botName: row.bot.name,
      runId: row.runId,
      tool: row.tool,
      scope: row.scope,
      preview: row.preview,
      decision: row.decision,
      status:
        row.status === "pending" &&
        ["cancelled", "failed", "completed"].includes(states.get(row.runId) ?? "cancelled")
          ? "cancelled"
          : row.status === "pending" && row.expiresAt.getTime() <= Date.now()
            ? "expired"
            : row.status,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      resolvedAt: row.resolvedAt?.toISOString() ?? null,
    }),
  );
}
