import { describe, expect, it } from "vitest";
import { DestinationEmulator } from "./destination-emulator.js";

const context = {
  operationId: "web-tool-test",
  traceId: "web-tool-test",
  workspaceId: "workspace",
  userId: "user",
  botId: "bot",
  runId: "run",
  signal: new AbortController().signal,
};

describe("local utility connector", () => {
  it("always exposes provider-independent web_fetch alongside destination.write", async () => {
    const connector = new DestinationEmulator();
    const tools = await connector.discoverTools(context);
    expect(tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining(["destination.write", "web_fetch"]),
    );
    const web = tools.find((tool) => tool.name === "web_fetch");
    expect(web?.description).toMatch(/public web/i);
  });
});
