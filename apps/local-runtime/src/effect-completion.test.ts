import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { completeFencedEffect } from "../../../packages/adapters/src/effect-completion.js";
import { createTestDatabase } from "./test-db.js";

let database: Awaited<ReturnType<typeof createTestDatabase>>;
let prisma: Awaited<ReturnType<typeof createTestDatabase>>["prisma"];
const scope = { workspaceId: "effect-workspace", userId: "effect-user" };
const proof = {
  workspaceId: scope.workspaceId,
  runId: "effect-run",
  effectId: "effect",
  leaseOwner: "worker-new",
  leaseFence: 2,
};
beforeAll(async () => {
  database = await createTestDatabase();
  prisma = database.prisma;
});
afterAll(async () => {
  await database?.close();
});
beforeEach(async () => {
  await prisma.organization.deleteMany();
  await prisma.organization.create({
    data: {
      id: scope.workspaceId,
      name: "Effects",
      slug: scope.workspaceId,
      createdAt: new Date(),
    },
  });
  await prisma.bot.create({
    data: {
      ...scope,
      id: "effect-bot",
      name: "Worker",
      color: "blue",
      thread: { create: { ...scope, id: "effect-thread" } },
    },
  });
  const taskScope = { ...scope, botId: "effect-bot", threadId: "effect-thread" };
  await prisma.task.create({
    data: { ...taskScope, id: "effect-task", prompt: "Send scoped work", status: "running" },
  });
  await prisma.run.create({
    data: {
      ...taskScope,
      id: "effect-run",
      taskId: "effect-task",
      status: "running",
      trigger: "user",
      leaseOwner: "worker-new",
      leaseFence: 2,
      leaseExpiresAt: new Date(Date.now() + 60_000),
    },
  });
  await prisma.externalEffect.create({
    data: {
      id: "effect",
      workspaceId: scope.workspaceId,
      runId: "effect-run",
      kind: "message_bot",
      idempotencyKey: "handoff",
      status: "intended",
      request: { bot_id: "target", message: "Review" },
    },
  });
});

it("leaves an intended effect replayable when an older worker returns an error after lease transfer", async () => {
  expect(
    await completeFencedEffect(
      prisma,
      { ...proof, leaseOwner: "worker-old", leaseFence: 1 },
      { error: "Old worker lost the lease" },
    ),
  ).toBe(false);
  expect(await prisma.externalEffect.findUnique({ where: { id: "effect" } })).toMatchObject({
    status: "intended",
    result: null,
  });
});

it("commits the current worker's result and prevents an older completion overwriting it", async () => {
  const currentResult = { ok: true, taskId: "actual-child", runId: "actual-child-run" };
  expect(
    await completeFencedEffect(prisma, proof, {
      kind: "agent_tool_result",
      details: currentResult,
    }),
  ).toBe(true);
  expect(
    await completeFencedEffect(
      prisma,
      { ...proof, leaseOwner: "worker-old", leaseFence: 1 },
      { error: "Stale failure" },
    ),
  ).toBe(false);
  expect(await prisma.externalEffect.findUnique({ where: { id: "effect" } })).toMatchObject({
    status: "completed",
    result: currentResult,
  });
});

it("rejects a cancelled run and cross-workspace proof before changing effect state", async () => {
  expect(
    await completeFencedEffect(prisma, { ...proof, workspaceId: "other-workspace" }, { ok: true }),
  ).toBe(false);
  await prisma.run.update({ where: { id: "effect-run" }, data: { status: "cancelled" } });
  expect(await completeFencedEffect(prisma, proof, { ok: true })).toBe(false);
  expect(await prisma.externalEffect.findUnique({ where: { id: "effect" } })).toMatchObject({
    status: "intended",
    result: null,
  });
});
