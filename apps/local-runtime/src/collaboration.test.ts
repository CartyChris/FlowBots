import { createThreadEvents, finalizeRun } from "@rakazo/db";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  cancelTaskTree,
  createCollaborativeTasks,
  readCollaborativeResult,
} from "../../../packages/adapters/src/collaboration.js";
import { PeerConnector } from "../../../packages/adapters/src/peer-connector.js";
import { InMemoryJobQueue } from "../../../packages/adapters/src/wakeup.js";
import { applyFlowMembership } from "../../../packages/core/src/flow-awareness.js";
import { getMission, listMissions } from "../../api/src/missions.js";
import { createTestDatabase } from "./test-db.js";

let database: Awaited<ReturnType<typeof createTestDatabase>>;
let prisma: Awaited<ReturnType<typeof createTestDatabase>>["prisma"];
const scope = { workspaceId: "workspace", userId: "user" };
const packet = (objective = "Verify the frontend", artifactIds: string[] = []) => ({
  version: 1 as const,
  objective,
  summary: "Check keyboard and small-window behavior.",
  constraints: ["Do not add permissions"],
  artifactIds,
  requestedOutput: "Findings and test evidence",
});
const request = (botId = "nova", requestId = "request-1") => ({
  ...scope,
  sourceBotId: "alex",
  sourceRunId: "run-alex",
  requestId,
  assignments: [{ botId, packet: packet() }],
});

async function addBot(id: string, userId = "user", workspaceId = "workspace") {
  return prisma.bot.create({
    data: {
      id,
      userId,
      workspaceId,
      name: id,
      color: "blue",
      thread: { create: { id: `thread-${id}`, userId, workspaceId } },
    },
  });
}
async function addRun(botId: string, id: string, status = "running") {
  const bot = await prisma.bot.findUniqueOrThrow({ where: { id: botId } });
  const fields = {
    workspaceId: bot.workspaceId,
    userId: bot.userId,
    botId,
    threadId: `thread-${botId}`,
  };
  await prisma.task.create({
    data: { ...fields, id: `task-${id}`, prompt: "Original user objective", status },
  });
  return prisma.run.create({
    data: { ...fields, id, taskId: `task-${id}`, status, trigger: "user" },
  });
}
async function startChild(child: { taskId: string; runId: string; botId: string }) {
  await prisma.task.update({ where: { id: child.taskId }, data: { status: "running" } });
  await prisma.run.update({ where: { id: child.runId }, data: { status: "running" } });
  return { ...scope, sourceBotId: child.botId, sourceRunId: child.runId };
}
async function artifact(id: string, botId = "alex", runId: string | null = "run-alex") {
  const bot = await prisma.bot.findUniqueOrThrow({ where: { id: botId } });
  return prisma.artifact.create({
    data: {
      id,
      botId,
      workspaceId: bot.workspaceId,
      userId: bot.userId,
      runId,
      name: `${id}.txt`,
      mimeType: "text/plain",
      size: 12,
      hash: "test-hash",
      storageKey: `private/${id}`,
    },
  });
}
async function unchangedAfterReject(input: Parameters<typeof createCollaborativeTasks>[1]) {
  const counts = await Promise.all([
    prisma.task.count(),
    prisma.run.count(),
    prisma.event.count(),
    prisma.message.count(),
  ]);
  await expect(createCollaborativeTasks(prisma, input)).rejects.toThrow();
  expect(
    await Promise.all([
      prisma.task.count(),
      prisma.run.count(),
      prisma.event.count(),
      prisma.message.count(),
    ]),
  ).toEqual(counts);
}

beforeAll(async () => {
  database = await createTestDatabase();
  prisma = database.prisma;
});
afterAll(async () => {
  await database?.close();
});
beforeEach(async () => {
  await prisma.organization.deleteMany();
  await prisma.user.deleteMany();
  await prisma.user.create({ data: { id: "user", name: "User", email: "user@example.invalid" } });
  await prisma.organization.create({
    data: { id: "workspace", name: "Workspace", slug: "workspace", createdAt: new Date() },
  });
  await prisma.member.create({
    data: {
      id: "member",
      organizationId: "workspace",
      userId: "user",
      role: "owner",
      createdAt: new Date(),
    },
  });
  for (const id of ["alex", "nova", "atlas", "sage", "ember", "quinn"]) await addBot(id);
  await addRun("alex", "run-alex");
});

describe("persistent collaboration ledger (real embedded PostgreSQL)", () => {
  it("persists compact ownership, artifact references, and handoff events without private messages", async () => {
    await artifact("spec");
    await prisma.message.create({
      data: {
        threadId: "thread-alex",
        seq: 1,
        role: "user",
        blocks: [{ kind: "text", text: "PRIVATE CHAT SECRET" }],
      },
    });
    const input = request();
    input.assignments[0]!.packet = packet("Review frontend", ["spec"]);
    const [child] = await createCollaborativeTasks(prisma, input);
    expect(child).toMatchObject({ botId: "nova", duplicate: false });
    const task = await prisma.task.findUniqueOrThrow({ where: { id: child!.taskId } });
    expect(task).toMatchObject({
      ...scope,
      botId: "nova",
      threadId: "thread-nova",
      parentTaskId: "task-run-alex",
      rootTaskId: "task-run-alex",
      contextPacket: input.assignments[0]!.packet,
    });
    expect(JSON.stringify(task)).not.toContain("PRIVATE CHAT SECRET");
    expect(JSON.stringify(task.contextPacket).length).toBeLessThanOrEqual(10_000);
    expect(await prisma.run.findUnique({ where: { id: child!.runId } })).toMatchObject({
      ...scope,
      taskId: child!.taskId,
      botId: "nova",
      status: "queued",
    });
    expect(await prisma.message.count()).toBe(1);
    const events = await prisma.event.findMany();
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "collaboration.handoff.started",
          botId: "alex",
          runId: "run-alex",
          payload: expect.objectContaining({
            parentTaskId: "task-run-alex",
            taskId: child!.taskId,
            sourceBotId: "alex",
            targetBotId: "nova",
            artifactIds: ["spec"],
          }),
        }),
        expect.objectContaining({
          type: "collaboration.handoff.accepted",
          botId: "nova",
          runId: child!.runId,
          payload: expect.objectContaining({ taskId: child!.taskId }),
        }),
      ]),
    );
    expect(JSON.stringify(events)).not.toContain("PRIVATE CHAT SECRET");
  });

  it("replays simultaneous identical requests without duplicating child task/run/events", async () => {
    const [first, replay] = await Promise.all([
      createCollaborativeTasks(prisma, request()),
      createCollaborativeTasks(prisma, request()),
    ]);
    expect(first[0]!.taskId).toBe(replay[0]!.taskId);
    expect(first[0]!.runId).toBe(replay[0]!.runId);
    expect([first[0]!.duplicate, replay[0]!.duplicate].sort()).toEqual([false, true]);
    expect(await prisma.task.count()).toBe(2);
    const eventCount = await prisma.event.count();
    await createCollaborativeTasks(prisma, request());
    expect(await prisma.event.count()).toBe(eventCount);
  });

  it("deduplicates the same target and packet even with a fresh request ID", async () => {
    const [first] = await createCollaborativeTasks(prisma, request());
    const [second] = await createCollaborativeTasks(prisma, request("nova", "different-call"));
    expect(second).toMatchObject({ taskId: first!.taskId, runId: first!.runId, duplicate: true });
    expect(await prisma.task.count()).toBe(2);
  });

  it.each(["changed-target", "appended-assignment"])(
    "rejects reused request IDs with %s atomically",
    async (change) => {
      await createCollaborativeTasks(prisma, request());
      const modified = request("atlas");
      if (change === "appended-assignment") modified.assignments.unshift(request().assignments[0]!);
      await unchangedAfterReject(modified);
    },
  );

  it("requires the current source lease proof before new work or replay", async () => {
    await prisma.run.update({
      where: { id: "run-alex" },
      data: { leaseOwner: "old-worker", leaseFence: 4 },
    });
    const first = { ...request(), sourceLeaseOwner: "old-worker", sourceLeaseFence: 4 };
    await createCollaborativeTasks(prisma, first);
    await prisma.run.update({
      where: { id: "run-alex" },
      data: { leaseOwner: "new-worker", leaseFence: 5 },
    });
    await unchangedAfterReject(first);
    await unchangedAfterReject({
      ...request("atlas", "stale-new-work"),
      sourceLeaseOwner: "old-worker",
      sourceLeaseFence: 4,
    });
    await unchangedAfterReject(request("atlas", "missing-proof"));
    expect(
      await createCollaborativeTasks(prisma, {
        ...request("atlas", "current-worker"),
        sourceLeaseOwner: "new-worker",
        sourceLeaseFence: 5,
      }),
    ).toHaveLength(1);
  });

  it("rejects a forged source scope and a source run that is already terminal", async () => {
    await unchangedAfterReject({ ...request(), sourceBotId: "atlas" });
    await unchangedAfterReject({ ...request(), userId: "stranger" });
    await unchangedAfterReject({ ...request(), workspaceId: "elsewhere" });
    await prisma.run.update({ where: { id: "run-alex" }, data: { status: "completed" } });
    await unchangedAfterReject(request());
  });

  it("rejects a different owner's bot atomically even after a valid assignment", async () => {
    await addBot("other", "other-user");
    await unchangedAfterReject({
      ...request(),
      assignments: [
        { botId: "nova", packet: packet() },
        { botId: "other", packet: packet() },
      ],
    });
  });

  it("rejects a bot and artifacts from another workspace owned by the same user", async () => {
    await prisma.organization.create({
      data: {
        id: "other-workspace",
        name: "Other workspace",
        slug: "other-workspace",
        createdAt: new Date(),
      },
    });
    await addBot("outside", "user", "other-workspace");
    await artifact("outside-artifact", "outside", null);
    await unchangedAfterReject(request("outside"));
    const input = request();
    input.assignments[0]!.packet = packet("Review", ["outside-artifact"]);
    await unchangedAfterReject(input);
  });

  it.each(["alex", "nova"])("preserves Flow separation for %s", async (id) => {
    await prisma.bot.update({
      where: { id },
      data: { instructions: applyFlowMembership("", "isolated") },
    });
    await unchangedAfterReject(request());
  });

  it("checks both room memberships and preserves room scope without writing private history", async () => {
    await prisma.groupChat.create({
      data: {
        ...scope,
        id: "room",
        name: "Team",
        members: { create: [{ botId: "alex" }, { botId: "nova" }] },
      },
    });
    await prisma.task.update({
      where: { id: "task-run-alex" },
      data: { groupChatId: "room", groupPromptSeq: 7 },
    });
    await prisma.run.update({
      where: { id: "run-alex" },
      data: { groupChatId: "room", groupPromptSeq: 7 },
    });
    await unchangedAfterReject(request("atlas"));
    const [child] = await createCollaborativeTasks(prisma, request());
    expect(await prisma.task.findUnique({ where: { id: child!.taskId } })).toMatchObject({
      groupChatId: "room",
      groupPromptSeq: 7,
    });
    expect(await prisma.run.findUnique({ where: { id: child!.runId } })).toMatchObject({
      groupChatId: "room",
      groupPromptSeq: 7,
    });
    expect(await prisma.message.count()).toBe(0);
    await prisma.groupChatMember.delete({
      where: { groupChatId_botId: { groupChatId: "room", botId: "alex" } },
    });
    await unchangedAfterReject(request("atlas", "removed-source"));
  });

  it("rejects busy targets and invalid artifact references without partial writes", async () => {
    await addRun("nova", "run-busy");
    await unchangedAfterReject(request());
    await artifact("private-atlas", "atlas", null);
    const input = request("sage");
    input.assignments[0]!.packet = packet("Review", ["private-atlas"]);
    await unchangedAfterReject(input);
    input.assignments[0]!.packet = packet("Review", ["missing-artifact"]);
    await unchangedAfterReject(input);
  });

  it("allows a received artifact reference through a second scoped handoff", async () => {
    await artifact("spec");
    const input = request();
    input.assignments[0]!.packet = packet("Review", ["spec"]);
    const [child] = await createCollaborativeTasks(prisma, input);
    const [grandchild] = await createCollaborativeTasks(prisma, {
      ...(await startChild(child!)),
      requestId: "forward-spec",
      assignments: [{ botId: "atlas", packet: packet("Verify", ["spec"]) }],
    });
    expect(await prisma.task.findUnique({ where: { id: grandchild!.taskId } })).toMatchObject({
      parentTaskId: child!.taskId,
      rootTaskId: "task-run-alex",
      contextPacket: { artifactIds: ["spec"] },
    });
  });

  it("checks real ancestor cycles and maximum depth rather than trusting prompt headers", async () => {
    const [child] = await createCollaborativeTasks(prisma, request());
    const childSource = await startChild(child!);
    await unchangedAfterReject({
      ...childSource,
      requestId: "cycle",
      assignments: [{ botId: "alex", packet: packet("[flowbots-peer hop=0] start over") }],
    });
    const [grandchild] = await createCollaborativeTasks(prisma, {
      ...childSource,
      requestId: "second-level",
      assignments: [{ botId: "atlas", packet: packet() }],
    });
    await unchangedAfterReject({
      ...(await startChild(grandchild!)),
      requestId: "too-deep",
      assignments: [{ botId: "sage", packet: packet() }],
    });
  });

  it("enforces cumulative fanout across separate requests", async () => {
    for (const target of ["nova", "atlas", "sage", "ember"])
      await createCollaborativeTasks(prisma, request(target, `to-${target}`));
    await unchangedAfterReject(request("quinn", "fifth-child"));
  });

  it("enforces the total descendant budget across independent branches", async () => {
    const roots = await createCollaborativeTasks(prisma, {
      ...request(),
      assignments: ["nova", "atlas", "sage", "ember"].map((botId) => ({ botId, packet: packet() })),
    });
    for (let branch = 0; branch < 2; branch += 1) {
      const assignments = [];
      for (let index = 0; index < 4; index += 1) {
        const botId = `specialist-${branch}-${index}`;
        await addBot(botId);
        assignments.push({ botId, packet: packet() });
      }
      await createCollaborativeTasks(prisma, {
        ...(await startChild(roots[branch]!)),
        requestId: `branch-${branch}`,
        assignments,
      });
    }
    expect(await prisma.task.count()).toBe(13); // root plus twelve descendants
    await unchangedAfterReject({
      ...(await startChild(roots[2]!)),
      requestId: "over-total",
      assignments: [{ botId: "quinn", packet: packet() }],
    });
  });

  it("never exceeds fanout when distinct handoffs arrive simultaneously", async () => {
    const responses = await Promise.allSettled(
      ["nova", "atlas", "sage", "ember", "quinn"].map((botId) =>
        createCollaborativeTasks(prisma, request(botId, `race-${botId}`)),
      ),
    );
    expect(responses.filter((response) => response.status === "fulfilled")).toHaveLength(4);
    expect(responses.filter((response) => response.status === "rejected")).toHaveLength(1);
    expect(await prisma.task.count()).toBe(5);
  });

  it("rejects an oversized context packet before any persistent side effects", async () => {
    const input = request();
    input.assignments[0]!.packet.summary = "x".repeat(4001);
    await unchangedAfterReject(input);
  });

  it("cancels an entire tree and active attempts, fencing out stale completion", async () => {
    const [child] = await createCollaborativeTasks(prisma, request());
    const childSource = await startChild(child!);
    const [grandchild] = await createCollaborativeTasks(prisma, {
      ...childSource,
      requestId: "grandchild",
      assignments: [{ botId: "atlas", packet: packet() }],
    });
    await prisma.run.update({
      where: { id: child!.runId },
      data: {
        leaseOwner: "old-worker",
        leaseFence: 3,
        leaseExpiresAt: new Date(Date.now() + 60_000),
      },
    });
    await prisma.attempt.create({
      data: { id: "attempt", runId: child!.runId, fence: 3, status: "running" },
    });
    const result = await cancelTaskTree(prisma, { ...scope, taskId: "task-run-alex" });
    expect(result.ok).toBe(true);
    expect(new Set(result.cancelledRunIds)).toEqual(
      new Set(["run-alex", child!.runId, grandchild!.runId]),
    );
    expect(await prisma.run.count({ where: { status: "cancelled" } })).toBe(3);
    expect(await prisma.task.count({ where: { status: "cancelled" } })).toBe(3);
    expect(await prisma.attempt.findUnique({ where: { id: "attempt" } })).toMatchObject({
      status: "cancelled",
      finishedAt: expect.any(Date),
    });
    expect(
      await finalizeRun(prisma, {
        ...scope,
        threadId: "thread-nova",
        botId: "nova",
        runId: child!.runId,
        taskId: child!.taskId,
        attemptId: "attempt",
        leaseOwner: "old-worker",
        leaseFence: 3,
        outcome: "completed",
        blocks: [{ kind: "text", text: "Late result" }],
      }),
    ).toBe(false);
    expect(await prisma.message.count()).toBe(0);
    await unchangedAfterReject({
      ...childSource,
      requestId: "after-cancel",
      assignments: [{ botId: "sage", packet: packet() }],
    });
    expect(
      (await cancelTaskTree(prisma, { ...scope, taskId: "task-run-alex" })).cancelledRunIds,
    ).toEqual([]);
  });

  it("rejects cancellation from another user without changing any run", async () => {
    await expect(
      cancelTaskTree(prisma, { ...scope, userId: "stranger", taskId: "task-run-alex" }),
    ).rejects.toThrow();
    expect(await prisma.run.findUnique({ where: { id: "run-alex" } })).toMatchObject({
      status: "running",
    });
  });

  it.each(["leased", "waiting_input", "waiting_takeover"])(
    "cancels %s descendants while preserving completed work",
    async (status) => {
      const children = await createCollaborativeTasks(prisma, {
        ...request(),
        assignments: ["nova", "atlas"].map((botId) => ({ botId, packet: packet() })),
      });
      const active = children[0]!;
      const complete = children[1]!;
      await prisma.run.update({ where: { id: active.runId }, data: { status } });
      await prisma.run.update({ where: { id: complete.runId }, data: { status: "completed" } });
      await prisma.task.update({ where: { id: complete.taskId }, data: { status: "completed" } });
      const result = await cancelTaskTree(prisma, { ...scope, taskId: "task-run-alex" });
      expect(new Set(result.cancelledRunIds)).toEqual(new Set(["run-alex", active.runId]));
      expect(await prisma.run.findUnique({ where: { id: complete.runId } })).toMatchObject({
        status: "completed",
      });
      expect(await prisma.task.findUnique({ where: { id: complete.taskId } })).toMatchObject({
        status: "completed",
      });
    },
  );

  it("bounds long returned output and truthfully marks truncation", async () => {
    const [child] = await createCollaborativeTasks(prisma, request());
    await prisma.run.update({ where: { id: child!.runId }, data: { status: "completed" } });
    await prisma.task.update({ where: { id: child!.taskId }, data: { status: "completed" } });
    await prisma.message.create({
      data: {
        threadId: "thread-nova",
        seq: 1,
        role: "bot",
        runId: child!.runId,
        blocks: [{ kind: "text", text: "x".repeat(30_000) }],
      },
    });
    const result = await readCollaborativeResult(prisma, {
      ...scope,
      sourceRunId: "run-alex",
      taskId: child!.taskId,
    });
    expect(result.truncated).toBe(true);
    expect(result.result.length).toBeGreaterThan(0);
    expect(result.result.length).toBeLessThan(20_000);
  });

  it("reads a room child from room output while retaining private-thread isolation", async () => {
    await prisma.groupChat.create({
      data: {
        ...scope,
        id: "room",
        name: "Team",
        members: { create: [{ botId: "alex" }, { botId: "nova" }] },
      },
    });
    await prisma.task.update({
      where: { id: "task-run-alex" },
      data: { groupChatId: "room", groupPromptSeq: 2 },
    });
    await prisma.run.update({
      where: { id: "run-alex" },
      data: { groupChatId: "room", groupPromptSeq: 2 },
    });
    const [child] = await createCollaborativeTasks(prisma, request());
    await prisma.run.update({ where: { id: child!.runId }, data: { status: "completed" } });
    await prisma.task.update({ where: { id: child!.taskId }, data: { status: "completed" } });
    await prisma.groupMessage.create({
      data: {
        groupChatId: "room",
        botId: "nova",
        seq: 1,
        authorKind: "bot",
        runId: child!.runId,
        blocks: [{ kind: "text", text: "Room verification passed" }],
      },
    });
    await prisma.message.create({
      data: {
        threadId: "thread-nova",
        seq: 1,
        role: "bot",
        runId: "private-run",
        blocks: [{ kind: "text", text: "PRIVATE HISTORY SECRET" }],
      },
    });
    expect(
      await readCollaborativeResult(prisma, {
        ...scope,
        sourceRunId: "run-alex",
        taskId: child!.taskId,
      }),
    ).toMatchObject({ result: "Room verification passed" });
    await prisma.groupChatMember.delete({
      where: { groupChatId_botId: { groupChatId: "room", botId: "alex" } },
    });
    await expect(
      readCollaborativeResult(prisma, { ...scope, sourceRunId: "run-alex", taskId: child!.taskId }),
    ).rejects.toThrow();
  });

  it("returns only the requested child's result and artifacts, never unrelated private history", async () => {
    const [child] = await createCollaborativeTasks(prisma, request());
    await prisma.run.update({ where: { id: child!.runId }, data: { status: "completed" } });
    await prisma.task.update({ where: { id: child!.taskId }, data: { status: "completed" } });
    await prisma.message.createMany({
      data: [
        {
          threadId: "thread-nova",
          seq: 1,
          role: "bot",
          runId: "unrelated-private-run",
          blocks: [{ kind: "text", text: "PRIVATE HISTORY SECRET" }],
        },
        {
          threadId: "thread-nova",
          seq: 2,
          role: "bot",
          runId: child!.runId,
          blocks: [{ kind: "text", text: "Keyboard tests passed" }],
        },
      ],
    });
    await artifact("child-output", "nova", child!.runId);
    await artifact("private-output", "nova", "unrelated-private-run");
    const result = await readCollaborativeResult(prisma, {
      ...scope,
      sourceRunId: "run-alex",
      taskId: child!.taskId,
    });
    expect(result).toMatchObject({
      taskId: child!.taskId,
      status: "completed",
      result: "Keyboard tests passed",
      truncated: false,
      artifacts: [
        { id: "child-output", name: "child-output.txt", mimeType: "text/plain", size: 12 },
      ],
    });
    expect(JSON.stringify(result)).not.toContain("PRIVATE HISTORY SECRET");
    expect(JSON.stringify(result)).not.toContain("storageKey");
    await addRun("atlas", "unrelated-run");
    await expect(
      readCollaborativeResult(prisma, {
        ...scope,
        sourceRunId: "unrelated-run",
        taskId: child!.taskId,
      }),
    ).rejects.toThrow();
    await expect(
      readCollaborativeResult(prisma, {
        ...scope,
        userId: "stranger",
        sourceRunId: "run-alex",
        taskId: child!.taskId,
      }),
    ).rejects.toThrow();
  });
});

describe("persisted Mission Control views (real embedded PostgreSQL)", () => {
  const actor = { ...scope, email: "user@example.invalid", isDeploymentOwner: false };

  it("hydrates owned parent/child lineage and safe artifact metadata after reload", async () => {
    await artifact("spec");
    const input = request();
    input.assignments[0]!.packet = packet("Review frontend", ["spec"]);
    const [child] = await createCollaborativeTasks(prisma, input);
    await artifact("review", "nova", child!.runId);
    const first = await listMissions(prisma, actor);
    expect(first.truncated).toBe(false);
    expect(first.tasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "task-run-alex",
          parentTaskId: null,
          botId: "alex",
          status: "running",
          artifactCount: 1,
        }),
        expect.objectContaining({
          id: child!.taskId,
          parentTaskId: "task-run-alex",
          botId: "nova",
          botName: "nova",
          status: "queued",
          kind: "delegate",
          artifactCount: 1,
        }),
      ]),
    );
    const detail = await getMission(prisma, actor, child!.taskId);
    expect(detail.task).toMatchObject({
      id: child!.taskId,
      parentTaskId: "task-run-alex",
      runId: child!.runId,
    });
    expect(detail.contextPacket).toEqual(input.assignments[0]!.packet);
    expect(detail.artifacts).toEqual([
      expect.objectContaining({
        id: "review",
        name: "review.txt",
        mimeType: "text/plain",
        size: 12,
      }),
    ]);
    expect(detail.events).toEqual([
      expect.objectContaining({ type: "collaboration.handoff.accepted" }),
    ]);
    expect(JSON.stringify(detail)).not.toContain("storageKey");
    expect(JSON.stringify(detail)).not.toContain("test-hash");
    expect(await getMission(prisma, actor, child!.taskId)).toEqual(detail);
    await cancelTaskTree(prisma, { ...scope, taskId: "task-run-alex" });
    expect((await getMission(prisma, actor, child!.taskId)).task.status).toBe("cancelled");
  });

  it("rejects foreign detail access and scopes the listing by both workspace and user", async () => {
    await addBot("foreign-user", "stranger");
    await addRun("foreign-user", "foreign-user-run");
    await prisma.organization.create({
      data: { id: "outside", name: "Outside", slug: "outside", createdAt: new Date() },
    });
    await addBot("foreign-workspace", "user", "outside");
    await addRun("foreign-workspace", "foreign-workspace-run");
    expect((await listMissions(prisma, actor)).tasks.map((task) => task.id)).toEqual([
      "task-run-alex",
    ]);
    for (const taskId of ["task-foreign-user-run", "task-foreign-workspace-run", "missing"]) {
      await expect(getMission(prisma, actor, taskId)).rejects.toThrow();
    }
    await expect(
      getMission(prisma, { ...actor, userId: "stranger" }, "task-run-alex"),
    ).rejects.toThrow();
  });

  it("excludes private progress, raw tool arguments, and unrelated task events", async () => {
    await prisma.event.createMany({
      data: [
        {
          workspaceId: scope.workspaceId,
          botId: "alex",
          threadId: "thread-alex",
          seq: 1,
          runId: "run-alex",
          type: "thread.progress",
          payload: { reasoning: "PRIVATE_REASONING" },
        },
        {
          workspaceId: scope.workspaceId,
          botId: "alex",
          threadId: "thread-alex",
          seq: 2,
          runId: "run-alex",
          type: "agent.tool.started",
          payload: {
            name: "web_search",
            executionId: "tool-1",
            args: { apiKey: "PRIVATE_TOOL_ARGUMENTS" },
            reasoning: "PRIVATE_REASONING",
          },
        },
        {
          workspaceId: scope.workspaceId,
          botId: "alex",
          threadId: "thread-alex",
          seq: 3,
          runId: "other-run",
          type: "run.started",
          payload: { name: "UNRELATED_EVENT" },
        },
      ],
    });
    await prisma.message.create({
      data: {
        threadId: "thread-alex",
        seq: 1,
        role: "bot",
        blocks: [{ kind: "text", text: "PRIVATE_CHAT_HISTORY" }],
      },
    });
    const detail = await getMission(prisma, actor, "task-run-alex");
    expect(detail.events).toEqual([
      expect.objectContaining({
        type: "agent.tool.started",
        payload: { name: "web_search", executionId: "tool-1" },
      }),
    ]);
    const json = JSON.stringify(detail);
    for (const secret of [
      "PRIVATE_REASONING",
      "PRIVATE_TOOL_ARGUMENTS",
      "UNRELATED_EVENT",
      "PRIVATE_CHAT_HISTORY",
    ])
      expect(json).not.toContain(secret);
  });

  it("caps mission hydration and signals that older tasks were omitted", async () => {
    await prisma.task.createMany({
      data: Array.from({ length: 200 }, (_, index) => ({
        ...scope,
        id: `older-${index}`,
        botId: "alex",
        threadId: "thread-alex",
        prompt: "x".repeat(700),
        status: "completed",
      })),
    });
    const result = await listMissions(prisma, actor);
    expect(result.tasks).toHaveLength(200);
    expect(result.truncated).toBe(true);
    expect(result.tasks.every((task) => task.prompt.length <= 500)).toBe(true);
  });
});

describe("scoped collaboration connector history", () => {
  it("allows the fourth recorded peer send and blocks the fifth without creating private messages", async () => {
    const jobs = new InMemoryJobQueue();
    const connector = new PeerConnector({ prisma, jobs, events: createThreadEvents(prisma) });
    const context = {
      ...scope,
      operationId: "run-alex",
      traceId: "run-alex",
      botId: "alex",
      runId: "run-alex",
      signal: new AbortController().signal,
    };
    try {
      for (const [index, botId] of ["nova", "atlas", "sage", "ember", "quinn"].entries()) {
        const executionId = `recorded-send-${index}`;
        const args = { bot_id: botId, message: `Check independent requirement ${index}` };
        // The real executor records the effect before calling the connector.
        await prisma.externalEffect.create({
          data: {
            workspaceId: scope.workspaceId,
            runId: "run-alex",
            kind: "message_bot",
            idempotencyKey: executionId,
            status: "intended",
            request: args,
          },
        });
        const output = [];
        for await (const event of connector.execute(
          { tool: "message_bot", args, executionId },
          context,
        ))
          output.push(event);
        if (index < 4)
          expect(output).toEqual([
            expect.objectContaining({
              type: "result",
              data: expect.objectContaining({ ok: true, botId }),
            }),
          ]);
        else
          expect(output).toEqual([
            expect.objectContaining({ type: "error", message: expect.stringMatching(/budget/i) }),
          ]);
      }
      expect(await prisma.task.count({ where: { parentTaskId: "task-run-alex" } })).toBe(4);
      expect(await prisma.run.count()).toBe(5);
      expect(await prisma.message.count()).toBe(0);
    } finally {
      await jobs.close();
    }
  });

  it.each(["room", "child"])("rejects legacy private-history reads from a %s run", async (kind) => {
    let sourceBotId = "alex";
    let sourceRunId = "run-alex";
    if (kind === "room") {
      await prisma.groupChat.create({
        data: {
          ...scope,
          id: "room",
          name: "Team",
          members: { create: [{ botId: "alex" }, { botId: "atlas" }] },
        },
      });
      await prisma.task.update({ where: { id: "task-run-alex" }, data: { groupChatId: "room" } });
      await prisma.run.update({ where: { id: "run-alex" }, data: { groupChatId: "room" } });
    } else {
      const [child] = await createCollaborativeTasks(prisma, request());
      await startChild(child!);
      sourceBotId = child!.botId;
      sourceRunId = child!.runId;
    }
    await prisma.message.create({
      data: {
        threadId: "thread-atlas",
        seq: 1,
        role: "bot",
        blocks: [{ kind: "text", text: "PRIVATE_HISTORY_MUST_NOT_CROSS" }],
      },
    });
    const jobs = new InMemoryJobQueue();
    const connector = new PeerConnector({ prisma, jobs, events: createThreadEvents(prisma) });
    const context = {
      ...scope,
      operationId: sourceRunId,
      traceId: sourceRunId,
      botId: sourceBotId,
      runId: sourceRunId,
      signal: new AbortController().signal,
    };
    try {
      for (const tool of ["consult_teammate", "read_bot_updates"]) {
        const output = [];
        for await (const event of connector.execute(
          { tool, args: { bot_id: "atlas" }, executionId: `${tool}-read` },
          context,
        ))
          output.push(event);
        expect(output).toEqual([
          expect.objectContaining({
            type: "error",
            message: expect.stringMatching(/read_task_result|scoped/i),
          }),
        ]);
        expect(JSON.stringify(output)).not.toContain("PRIVATE_HISTORY_MUST_NOT_CROSS");
      }
    } finally {
      await jobs.close();
    }
  });
});
