import { expect, it } from "vitest";
import { queueThreadAnswer } from "../../../apps/api/src/thread-answer.js";
import { createTestDatabase } from "./test-db.js";

it("private answers cannot bypass approval, revive terminal runs, or mutate a different bot's task", async () => {
  const database = await createTestDatabase();
  const { prisma } = database;
  const scope = { workspaceId: "answer-ws", userId: "answer-user" };
  try {
    await prisma.organization.create({
      data: {
        id: scope.workspaceId,
        name: "Answer",
        slug: scope.workspaceId,
        createdAt: new Date(),
      },
    });
    for (const botId of ["answer-a", "answer-b"]) {
      await prisma.bot.create({
        data: {
          ...scope,
          id: botId,
          name: botId,
          color: "blue",
          thread: { create: { ...scope, id: `${botId}-thread` } },
        },
      });
    }
    await prisma.task.create({
      data: {
        ...scope,
        id: "answer-task",
        botId: "answer-a",
        threadId: "answer-a-thread",
        prompt: "Original objective",
        status: "running",
      },
    });
    await prisma.run.create({
      data: {
        ...scope,
        id: "answer-run",
        botId: "answer-a",
        threadId: "answer-a-thread",
        taskId: "answer-task",
        status: "waiting_input",
        checkpoint: "approval:review",
        trigger: "user",
      },
    });
    const input = { botId: "answer-a", runId: "answer-run", answer: "User answer" };
    await expect(queueThreadAnswer(prisma, scope, input)).rejects.toThrow(/approval/i);
    await prisma.run.update({ where: { id: "answer-run" }, data: { checkpoint: null } });
    await expect(
      queueThreadAnswer(prisma, scope, { ...input, botId: "answer-b" }),
    ).rejects.toThrow();
    await expect(
      queueThreadAnswer(prisma, { ...scope, userId: "other-user" }, input),
    ).rejects.toThrow();
    await prisma.run.update({ where: { id: "answer-run" }, data: { status: "cancelled" } });
    await expect(queueThreadAnswer(prisma, scope, input)).rejects.toThrow();
    expect((await prisma.task.findUniqueOrThrow({ where: { id: "answer-task" } })).prompt).toBe(
      "Original objective",
    );
    await prisma.run.update({ where: { id: "answer-run" }, data: { status: "waiting_input" } });
    await queueThreadAnswer(prisma, scope, input);
    expect(await prisma.run.findUnique({ where: { id: "answer-run" } })).toMatchObject({
      status: "queued",
    });
    expect((await prisma.task.findUniqueOrThrow({ where: { id: "answer-task" } })).prompt).toBe(
      "User answer",
    );
  } finally {
    await database.close();
  }
});
