import { describe, expect, it } from "vitest";
import { builtinAgentTools } from "./builtin-tools.js";

describe("always-on web research tools", () => {
  it("exposes web search and fetch as built-ins independent of optional connectors", () => {
    const tools = new Map(builtinAgentTools.map((tool) => [tool.name, tool]));
    expect(tools.has("web_search")).toBe(true);
    expect(tools.has("web_fetch")).toBe(true);
    expect(tools.get("web_search")?.description).toMatch(/latest|current|web|search/i);
    expect(tools.get("web_fetch")?.description).toMatch(/public|url|web/i);
  });
});
