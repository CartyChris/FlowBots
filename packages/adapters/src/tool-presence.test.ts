import { expect, it } from "vitest";
import { withToolPresence } from "./tool-presence.js";

it("persists start before execution and finish afterwards without tool arguments or results", async () => {
  const order: unknown[] = [];
  const result = await withToolPresence(
    {
      name: "web_search",
      executionId: "call-1",
      emit: async (type, payload) => {
        order.push({ type, payload });
      },
    },
    async () => {
      order.push("execute");
      return { secret: "private" };
    },
  );
  expect(result).toEqual({ secret: "private" });
  expect(order).toEqual([
    { type: "agent.tool.started", payload: { name: "web_search", executionId: "call-1" } },
    "execute",
    { type: "agent.tool.finished", payload: { name: "web_search", executionId: "call-1" } },
  ]);
});

it("finishes tool presence on errors and preserves the underlying failure", async () => {
  const events: string[] = [];
  await expect(
    withToolPresence(
      {
        name: "shell",
        executionId: "call-2",
        emit: async (type) => {
          events.push(type);
        },
      },
      async () => {
        throw new Error("command failed");
      },
    ),
  ).rejects.toThrow("command failed");
  expect(events).toEqual(["agent.tool.started", "agent.tool.finished"]);
});
