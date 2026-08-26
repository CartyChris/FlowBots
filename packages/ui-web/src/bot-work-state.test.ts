import { describe, expect, it } from "vitest";
import { botWorkStateForTool } from "./bot-work-state.js";

describe("semantic bot work states", () => {
  it("maps web retrieval to researching", () => {
    expect(botWorkStateForTool("web_search")).toBe("researching");
    expect(botWorkStateForTool("web_fetch")).toBe("researching");
  });

  it("maps current-claim verification to verifying", () => {
    expect(botWorkStateForTool("verify_current_claim")).toBe("verifying");
  });

  it("maps peer coordination to collaborating", () => {
    expect(botWorkStateForTool("read_bot_updates")).toBe("collaborating");
    expect(botWorkStateForTool("delegate_to_bot")).toBe("collaborating");
    expect(botWorkStateForTool("delegate_team")).toBe("collaborating");
    expect(botWorkStateForTool("message_bot")).toBe("collaborating");
  });

  it("maps workspace/computer execution to building and leaves unknown tools alone", () => {
    expect(botWorkStateForTool("write_file")).toBe("building");
    expect(botWorkStateForTool("shell")).toBe("building");
    expect(botWorkStateForTool("computer_act")).toBe("building");
    expect(botWorkStateForTool("totally_unknown")).toBeUndefined();
  });
});
