import type { Bot } from "@rakazo/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { VirtualOfficeOverlay } from "./VirtualOfficeOverlay.js";

const baseBot = {
  id: "nova",
  name: "Nova",
  title: "Frontend specialist",
  color: "#8EDFF7",
  status: "running",
  preview: "Private chat text must not become office telemetry",
  presence: {
    botId: "nova",
    runId: "run-1",
    taskId: "task-1",
    state: "searching",
    station: "research",
    summary: "Searching public sources",
    updatedAt: "2026-09-05T00:00:00Z",
    startedAt: "2026-09-05T00:00:00Z",
    modelProvider: "ollama",
    modelId: "local-model",
  },
} as unknown as Bot;
function office(bot = baseBot) {
  return renderToStaticMarkup(
    <VirtualOfficeOverlay
      bots={[bot]}
      activeBotId={bot.id}
      onSelect={() => undefined}
      onClose={() => undefined}
      onOpenWorkbench={() => undefined}
      onCustomize={() => undefined}
    />,
  );
}

describe("Virtual Office truthful presence", () => {
  it("places the real bot at its runtime station and renders only its safe activity", () => {
    const html = office();
    expect(html).toContain('data-station="research"');
    expect(html).toContain('data-presence="searching"');
    expect(html).toContain("Searching public sources");
    expect(html).not.toContain("Private chat text");
    expect(html).toContain("Nova");
  });
  it("exposes model, task inspection and an accessible mission view", () => {
    const html = office();
    expect(html).toContain("local-model");
    expect(html).toContain("Inspect Nova task");
    expect(html).toContain("Mission Control");
  });
  it("never invents activity for an unhydrated or legacy idle bot", () => {
    const html = office({ ...baseBot, status: "idle", presence: undefined } as Bot);
    expect(html).toContain('data-presence="idle"');
    expect(html).not.toContain("Private chat text");
    expect(html).not.toContain("Reviewing context and deciding");
  });
});
