import { createRepos, type ThreadEvents } from "@rakazo/db";
import { describe, expect, it, vi } from "vitest";
import type { JobPublisher } from "../../../packages/adapter-kit/src/index.js";
import { createJobReconciler } from "../../../packages/adapters/src/job-reconciler.js";
import { PeerConnector } from "../../../packages/adapters/src/peer-connector.js";
import { createTestDatabase } from "./test-db.js";

function context(runId = "run-source") {
  return {
    operationId: runId,
    traceId: runId,
    workspaceId: "workspace-1",
    userId: "user-1",
    botId: "bot-source",
    runId,
    signal: new AbortController().signal,
  };
}

describe("Peer dispatch recovery", () => {
  it("returns committed child IDs when dispatch fails and safely retries the same request", async () => {
    const database = await createTestDatabase();
    try {
      const prisma = database.prisma;
      const actor = {
        workspaceId: "workspace-1",
        userId: "user-1",
        email: "worker@example.test",
        isDeploymentOwner: false,
      };
      await prisma.organization.create({
        data: {
          id: actor.workspaceId,
          name: "Dispatch recovery",
          slug: "dispatch-recovery",
          createdAt: new Date(),
        },
      });
      const repos = createRepos(prisma);
      const source = await repos.createBot(actor, {
        name: "Lead",
        title: "",
        description: "",
        instructions: "",
        notifyOnFinish: false,
      });
      const target = await repos.createBot(actor, {
        name: "Specialist",
        title: "",
        description: "",
        instructions: "",
        notifyOnFinish: false,
      });
      const task = await prisma.task.create({
        data: {
          workspaceId: actor.workspaceId,
          userId: actor.userId,
          botId: source.id,
          threadId: source.threadId,
          status: "running",
          prompt: "Research with a teammate",
        },
      });
      const run = await prisma.run.create({
        data: {
          workspaceId: actor.workspaceId,
          userId: actor.userId,
          botId: source.id,
          threadId: source.threadId,
          taskId: task.id,
          status: "running",
          trigger: "user",
        },
      });
      const jobs = {
        enqueue: vi
          .fn()
          .mockRejectedValueOnce(new Error("dispatch unavailable"))
          .mockResolvedValue(undefined),
        cancel: vi.fn(),
        close: vi.fn(),
      } as unknown as JobPublisher;
      const connector = new PeerConnector({
        prisma,
        jobs,
        events: { append: vi.fn() } as unknown as ThreadEvents,
      });
      const dispatch = async () => {
        const output = [];
        for await (const event of connector.execute(
          {
            tool: "delegate_to_bot",
            args: { bot_id: target.id, task: "Find supporting sources" },
            executionId: "dispatch-recovery",
          },
          { ...context(run.id), botId: source.id },
        ))
          output.push(event);
        return output;
      };
      const first = await dispatch();
      const committed = await prisma.task.findFirstOrThrow({
        where: { parentTaskId: task.id },
        include: { runs: true },
      });
      const childRunId = committed.runs[0]!.id;
      expect(first).toEqual([
        expect.objectContaining({
          type: "result",
          data: expect.objectContaining({
            ok: true,
            taskId: committed.id,
            runId: childRunId,
            dispatchPendingRunIds: [childRunId],
          }),
        }),
      ]);
      await createJobReconciler({ prisma, jobs }).reconcileOnce();
      expect(jobs.enqueue).toHaveBeenLastCalledWith({
        name: "run.continue",
        payload: { runId: childRunId },
        replaceKey: `run:${childRunId}`,
      });
      const retried = await dispatch();
      expect(retried).toEqual([
        expect.objectContaining({
          type: "result",
          data: expect.objectContaining({
            taskId: committed.id,
            runId: childRunId,
            duplicate: true,
            dispatchPendingRunIds: [],
          }),
        }),
      ]);
      expect(await prisma.task.count({ where: { parentTaskId: task.id } })).toBe(1);
      expect(await prisma.run.count({ where: { taskId: committed.id } })).toBe(1);
    } finally {
      await database.close();
    }
  });
});
