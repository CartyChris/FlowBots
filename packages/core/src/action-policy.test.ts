import { describe, expect, it } from "vitest";
import { classifyAction, evaluateActionPolicy } from "./action-policy.js";

describe("executor action policies", () => {
  it.each([
    ["read_file", "workspace", true],
    ["write_file", "workspace", false],
    ["shell", "host", false],
    ["computer_observe", "host", true],
    ["computer_act", "host", false],
    ["web_search", "external", true],
    ["remember", "internal", false],
    ["delegate_to_bot", "internal", false],
    ["gmail_send", "external", false],
    ["constructor", "external", false],
  ] as const)(
    "classifies %s without trusting tool-provided descriptions",
    (tool, scope, readOnly) => {
      expect(classifyAction(tool, "desktop")).toMatchObject({ scope, readOnly });
    },
  );

  it("never treats shell syntax as a read-only grant", () => {
    const policy = { mode: "review-risky" as const, rules: [] };
    expect(evaluateActionPolicy(policy, { tool: "shell", computerKind: "docker" }).decision).toBe(
      "ask",
    );
  });

  it.each([
    ["legacy", "shell", "allow"],
    ["review-risky", "read_file", "allow"],
    ["review-risky", "write_file", "ask"],
    ["review-all", "read_file", "ask"],
    ["read-only", "read_file", "allow"],
    ["read-only", "remember", "deny"],
    ["read-only", "run_subagent", "deny"],
  ] as const)("%s governs %s as %s", (mode, tool, decision) => {
    expect(
      evaluateActionPolicy({ mode, rules: [] }, { tool, computerKind: "docker" }).decision,
    ).toBe(decision);
  });

  it("a deny rule wins over broad and exact allow rules", () => {
    expect(
      evaluateActionPolicy(
        {
          mode: "legacy",
          rules: [
            { tool: "shell", decision: "allow" },
            { tool: "shell", decision: "deny" },
            { tool: "shell", decision: "allow", fingerprint: "a".repeat(64) },
          ],
        },
        { tool: "shell", computerKind: "desktop", fingerprint: "a".repeat(64) },
      ).decision,
    ).toBe("deny");
  });

  it("an exact-action allow never authorizes changed arguments", () => {
    const policy = {
      mode: "review-risky" as const,
      rules: [{ tool: "shell", decision: "allow" as const, fingerprint: "a".repeat(64) }],
    };
    expect(
      evaluateActionPolicy(policy, {
        tool: "shell",
        computerKind: "desktop",
        fingerprint: "a".repeat(64),
      }).decision,
    ).toBe("allow");
    expect(
      evaluateActionPolicy(policy, {
        tool: "shell",
        computerKind: "desktop",
        fingerprint: "b".repeat(64),
      }).decision,
    ).toBe("ask");
  });

  it("read-only mode cannot be weakened by an allow rule", () => {
    expect(
      evaluateActionPolicy(
        { mode: "read-only", rules: [{ tool: "shell", decision: "allow" }] },
        { tool: "shell", computerKind: "desktop" },
      ).decision,
    ).toBe("deny");
  });

  it("a specific ask rule wins over an allow rule", () => {
    expect(
      evaluateActionPolicy(
        {
          mode: "legacy",
          rules: [
            { tool: "shell", decision: "allow" },
            { tool: "shell", decision: "ask" },
          ],
        },
        { tool: "shell", computerKind: "docker" },
      ).decision,
    ).toBe("ask");
  });
});
