import { describe, expect, it } from "vitest";
import { BUILTIN_CLI_AGENTS, buildCliInvocation } from "./cli-agent.js";

describe("Gemini CLI bridge", () => {
  it("is a first-class built-in harness that keeps authentication owned by the CLI", () => {
    const gemini = BUILTIN_CLI_AGENTS.find((agent) => agent.id === "gemini-cli");
    expect(gemini).toMatchObject({
      id: "gemini-cli",
      label: "Gemini CLI",
      executable: "gemini",
      authOwner: "cli",
      structuredOutput: true,
      supportsModel: true,
      supportsAdditionalDirs: true,
      outerVerificationRequired: true,
    });
  });

  it("uses bounded headless stream-json mode without a shell and preserves Gemini approval boundaries", () => {
    expect(
      buildCliInvocation({
        agentId: "gemini-cli",
        prompt: "Review this repository",
        cwd: "/tmp/project",
        mode: "analyze",
        model: "gemini-test-model",
        additionalDirs: ["../shared"],
      }),
    ).toEqual({
      command: "gemini",
      args: [
        "-p",
        "Review this repository",
        "--output-format",
        "stream-json",
        "--approval-mode",
        "plan",
        "--model",
        "gemini-test-model",
        "--include-directories",
        "../shared",
      ],
      cwd: "/tmp/project",
      outerVerificationRequired: true,
    });

    const write = buildCliInvocation({
      agentId: "gemini-cli",
      prompt: "Implement the tested fix",
      cwd: "/tmp/project",
      mode: "write",
    });
    expect(write.args).toContain("auto_edit");
    expect(write.args).not.toContain("yolo");
  });
});
