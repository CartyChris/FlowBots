import { describe, expect, it } from "vitest";
import { BUILTIN_CLI_AGENTS, buildCliInvocation } from "./cli-agent.js";
import { cliHarnessDefinitions } from "./harness-registry.js";

describe("Gemini CLI harness", () => {
  it("is a first-class built-in that keeps authentication owned by the installed CLI", () => {
    const gemini = BUILTIN_CLI_AGENTS.find((agent) => agent.id === "gemini-cli");
    expect(gemini).toMatchObject({
      id: "gemini-cli",
      label: "Gemini CLI",
      executable: "gemini",
      authOwner: "cli",
      structuredOutput: true,
      supportsModel: true,
      supportsAdditionalDirs: true,
      writePolicy: "cli-policy",
      outerVerificationRequired: true,
    });
  });

  it("uses read-only Plan Mode for analysis with streaming structured output", () => {
    expect(
      buildCliInvocation({
        agentId: "gemini-cli",
        prompt: "inspect this repository and explain the failure",
        cwd: "/work/repo",
        mode: "analyze",
        model: "gemini-example-model",
        additionalDirs: ["/work/docs", "/work/shared"],
      }),
    ).toEqual({
      command: "gemini",
      args: [
        "-p",
        "inspect this repository and explain the failure",
        "--output-format",
        "stream-json",
        "--approval-mode",
        "plan",
        "--model",
        "gemini-example-model",
        "--include-directories",
        "/work/docs",
        "--include-directories",
        "/work/shared",
      ],
      cwd: "/work/repo",
      outerVerificationRequired: true,
    });
  });

  it("uses Auto Edit rather than YOLO for write mode", () => {
    const invocation = buildCliInvocation({
      agentId: "gemini-cli",
      prompt: "fix the tests",
      cwd: "/work/repo",
      mode: "write",
    });
    expect(invocation).toEqual({
      command: "gemini",
      args: [
        "-p",
        "fix the tests",
        "--output-format",
        "stream-json",
        "--approval-mode",
        "auto_edit",
      ],
      cwd: "/work/repo",
      outerVerificationRequired: true,
    });
    expect(invocation.args).not.toContain("yolo");
    expect(invocation.args).not.toContain("--yolo");
  });

  it("keeps prompts and paths as argv data and is projected automatically into the harness registry", () => {
    const invocation = buildCliInvocation({
      agentId: "gemini-cli",
      prompt: "summarize; touch /tmp/should-not-exist",
      cwd: "/work/repo; echo nope",
      mode: "analyze",
      additionalDirs: ["/work/shared && echo nope"],
    });
    expect(invocation.command).toBe("gemini");
    expect(invocation.cwd).toBe("/work/repo; echo nope");
    expect(invocation.args).toContain("summarize; touch /tmp/should-not-exist");
    expect(invocation.args).toContain("/work/shared && echo nope");

    const harness = cliHarnessDefinitions(async () => ({ available: true })).find(
      (entry) => entry.id === "gemini-cli",
    );
    expect(harness).toMatchObject({
      id: "gemini-cli",
      kind: "cli",
      interactions: ["headless"],
      workspacePolicies: ["read-only", "workspace-write"],
      outerVerificationRequired: true,
    });
  });
});
