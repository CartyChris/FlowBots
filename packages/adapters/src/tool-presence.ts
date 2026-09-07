/** Records only action identity, never arguments, results or private reasoning. */
export async function withToolPresence<T>(
  input: {
    name: string;
    executionId: string;
    emit: (
      type: "agent.tool.started" | "agent.tool.finished",
      payload: { name: string; executionId: string },
    ) => Promise<unknown>;
  },
  execute: () => Promise<T>,
): Promise<T> {
  const payload = { name: input.name, executionId: input.executionId };
  await input.emit("agent.tool.started", payload);
  try {
    return await execute();
  } finally {
    await input.emit("agent.tool.finished", payload);
  }
}
