import type { GroupChatActiveRun } from "@rakazo/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GroupRunPresence } from "./GroupRunPresence.js";

const run: GroupChatActiveRun = {
  runId: "run",
  botId: "nova",
  botName: "Nova",
  botColor: "#8EDFF7",
  status: "queued",
  lastTool: null,
  startedAt: null,
};
describe("group run presence", () => {
  it("does not claim queued bots are already collaborating", () => {
    const html = renderToStaticMarkup(<GroupRunPresence run={run} />);
    expect(html).toContain("queued");
    expect(html).not.toContain('data-bot-state="collaborating"');
  });
  it("uses canonical safe activity rather than stale last-tool names", () => {
    const html = renderToStaticMarkup(
      <GroupRunPresence
        run={{
          ...run,
          lastTool: "delegate_to_bot",
          presence: {
            botId: "nova",
            runId: "run",
            taskId: "task",
            state: "searching",
            station: "research",
            summary: "Searching public sources",
            updatedAt: "2026-09-05T00:00:00Z",
            startedAt: null,
            modelId: null,
            modelProvider: null,
          },
        }}
      />,
    );
    expect(html).toContain("Searching public sources");
    expect(html).toContain('data-bot-state="researching"');
    expect(html).not.toContain("delegate_to_bot");
  });
});
