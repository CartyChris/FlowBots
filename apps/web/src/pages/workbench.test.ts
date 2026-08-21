import { describe, expect, it } from "vitest";
import { buildArtifactTask, buildSandboxTask } from "./workbench.js";

describe("Workbench task builders", () => {
  it("builds a sandbox task that states the real isolation boundary and verifies outputs", () => {
    const prompt = buildSandboxTask({
      botName: "Byte",
      template: "test-fix",
      task: "Fix the failing parser tests",
      isolation: "container",
      workingDirectory: "projects/parser",
      extensionInstructions: ["Follow the repo's CONTRIBUTING.md before editing."],
    });

    expect(prompt).toContain("Sandbox Lab");
    expect(prompt).toContain("container");
    expect(prompt).toContain("projects/parser");
    expect(prompt).toContain("Fix the failing parser tests");
    expect(prompt).toContain(
      "Do not claim the task is complete until verification has actually run",
    );
    expect(prompt).toContain("Follow the repo's CONTRIBUTING.md before editing.");
  });

  it("builds a multi-format artifact task that requires real exported files", () => {
    const prompt = buildArtifactTask({
      botName: "Pixel",
      brief: "Create a launch deck and companion microsite",
      formats: ["pptx", "pdf", "html"],
      extensionInstructions: [],
    });

    expect(prompt).toContain("Artifact Studio");
    expect(prompt).toContain("flowbots-exports/");
    expect(prompt).toContain(".pptx");
    expect(prompt).toContain(".pdf");
    expect(prompt).toContain(".html");
    expect(prompt).toContain("verify that each reported file exists");
    expect(prompt).toContain("Never fabricate a generated file");
  });

  it("deduplicates formats and bounds extension instructions", () => {
    const prompt = buildArtifactTask({
      botName: "Nova",
      brief: "Write a concise project brief",
      formats: ["md", "md"],
      extensionInstructions: ["x".repeat(12_000)],
    });

    expect(prompt.match(/\.md/g)?.length).toBe(1);
    expect(prompt.length).toBeLessThan(9_000);
  });
});
