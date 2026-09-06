import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getActionPolicy,
  listActionApprovals,
  requestActionApproval,
  resolveActionApproval,
  saveActionPolicy,
} from "../../../packages/adapters/src/action-approvals.js";
import { createTestDatabase } from "./test-db.js";

describe("durable action approvals", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  const scope = { workspaceId: "approval-workspace", userId: "approval-user" };
  const request = {
    ...scope,
    botId: "approval-bot",
    runId: "approval-run",
    threadId: "approval-thread",
    leaseOwner: "worker",
    leaseFence: 1,
    computerKind: "desktop",
    tool: "shell",
    executionId: "approval-tool-call",
    args: { command: "echo approved" },
    secrets: [],
  };
  beforeEach(async () => {
    database = await createTestDatabase();
    await database.prisma.organization.create({
      data: {
        id: scope.workspaceId,
        name: "Approval workspace",
        slug: scope.workspaceId,
        createdAt: new Date(),
      },
    });
    await database.prisma.bot.create({
      data: {
        ...scope,
        id: request.botId,
        name: "Alex",
        color: "blue",
        thread: { create: { ...scope, id: request.threadId } },
      },
    });
    await database.prisma.task.create({
      data: {
        ...scope,
        id: "approval-task",
        botId: request.botId,
        threadId: request.threadId,
        prompt: "Do the approved work",
        status: "running",
      },
    });
    await database.prisma.run.create({
      data: {
        ...scope,
        id: request.runId,
        botId: request.botId,
        threadId: request.threadId,
        taskId: "approval-task",
        status: "running",
        trigger: "user",
        leaseOwner: request.leaseOwner,
        leaseFence: 1,
      },
    });
    await database.prisma.attempt.create({
      data: { runId: request.runId, fence: 1, status: "running" },
    });
    await saveActionPolicy(database.prisma, scope, request.botId, {
      mode: "review-risky",
      rules: [],
    });
  });
  afterEach(async () => {
    await database?.close();
  });

  it("pauses before recording or executing an external effect and persists safe audit events", async () => {
    const approval = await requestActionApproval(database.prisma, request);
    expect(approval.tool).toBe("shell");
    expect(await database.prisma.run.findUnique({ where: { id: request.runId } })).toMatchObject({
      status: "waiting_input",
      leaseOwner: null,
      checkpoint: `approval:${approval.id}`,
    });
    expect(await database.prisma.externalEffect.count()).toBe(0);
    expect(
      await database.prisma.event.findFirst({ where: { type: "action.approval.requested" } }),
    ).toMatchObject({ payload: { approvalId: approval.id, tool: "shell", scope: "host" } });
  });

  it("returns the original pending receipt for an identical retry", async () => {
    const first = await requestActionApproval(database.prisma, request);
    expect((await requestActionApproval(database.prisma, request)).id).toBe(first.id);
    expect(await database.prisma.actionApproval.count()).toBe(1);
    await expect(
      requestActionApproval(database.prisma, { ...request, args: { command: "echo changed" } }),
    ).rejects.toThrow(/identity|different/i);
  });

  it("allow once queues only the owning run with the durable action still identified", async () => {
    const approval = await requestActionApproval(database.prisma, request);
    expect(
      await resolveActionApproval(database.prisma, scope, approval.id, "allow-once"),
    ).toMatchObject({ runId: request.runId });
    expect(
      await database.prisma.actionApproval.findUnique({ where: { id: approval.id } }),
    ).toMatchObject({ status: "approved", decision: "allow-once" });
    expect(await database.prisma.run.findUnique({ where: { id: request.runId } })).toMatchObject({
      status: "queued",
      checkpoint: `approval:${approval.id}`,
    });
    expect((await getActionPolicy(database.prisma, scope, request.botId)).rules).toEqual([]);
  });

  it("allow exact saves a fingerprint rule for this bot only", async () => {
    const approval = await requestActionApproval(database.prisma, request);
    await resolveActionApproval(database.prisma, scope, approval.id, "allow-exact");
    expect((await getActionPolicy(database.prisma, scope, request.botId)).rules).toEqual([
      { tool: "shell", decision: "allow", fingerprint: approval.fingerprint },
    ]);
  });

  it("conflicting concurrent decisions cannot override the first decision", async () => {
    const approval = await requestActionApproval(database.prisma, request);
    const results = await Promise.allSettled([
      resolveActionApproval(database.prisma, scope, approval.id, "allow-once"),
      resolveActionApproval(database.prisma, scope, approval.id, "deny"),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
  });

  it("another user in the same workspace cannot inspect, set, or resolve this bot's authority", async () => {
    const other = { ...scope, userId: "other-user" };
    const approval = await requestActionApproval(database.prisma, request);
    await expect(getActionPolicy(database.prisma, other, request.botId)).rejects.toThrow();
    await expect(
      saveActionPolicy(database.prisma, other, request.botId, { mode: "legacy", rules: [] }),
    ).rejects.toThrow();
    await expect(
      resolveActionApproval(database.prisma, other, approval.id, "allow-once"),
    ).rejects.toThrow();
    expect(await listActionApprovals(database.prisma, other)).toEqual([]);
  });

  it("cancellation and expiry make an approval unusable", async () => {
    const approval = await requestActionApproval(database.prisma, request);
    await database.prisma.actionApproval.update({
      where: { id: approval.id },
      data: { expiresAt: new Date(0) },
    });
    await expect(
      resolveActionApproval(database.prisma, scope, approval.id, "allow-once"),
    ).rejects.toThrow(/expired/i);
    await database.prisma.run.update({
      where: { id: request.runId },
      data: { status: "cancelled" },
    });
    expect((await listActionApprovals(database.prisma, scope))[0]?.status).toBe("cancelled");
  });

  it("a stale worker cannot create or return a newer worker's pending request", async () => {
    await expect(
      requestActionApproval(database.prisma, { ...request, leaseFence: 0 }),
    ).rejects.toThrow(/lease|stale/i);
    const approval = await requestActionApproval(database.prisma, request);
    await expect(
      requestActionApproval(database.prisma, { ...request, leaseFence: 0 }),
    ).rejects.toThrow(/lease|stale/i);
    expect(approval.id).toBeTruthy();
  });

  it("tightening policy to read-only invalidates an outstanding allow decision", async () => {
    const approval = await requestActionApproval(database.prisma, request);
    await saveActionPolicy(database.prisma, scope, request.botId, { mode: "read-only", rules: [] });
    await expect(
      resolveActionApproval(database.prisma, scope, approval.id, "allow-exact"),
    ).rejects.toThrow(/policy|blocked/i);
    expect((await getActionPolicy(database.prisma, scope, request.botId)).rules).toEqual([]);
  });

  it("never returns raw protected arguments in approval listings or safe events", async () => {
    await requestActionApproval(database.prisma, {
      ...request,
      args: {
        command: "echo live-test-key",
        password: "private-value",
        content: "sensitive document body",
      },
      secrets: ["live-test-key"],
    });
    const listed = JSON.stringify(await listActionApprovals(database.prisma, scope));
    expect(listed).not.toContain("live-test-key");
    expect(listed).not.toContain("private-value");
    expect(listed).not.toContain("sensitive document body");
    expect(listed).not.toContain('"request"');
  });
});
