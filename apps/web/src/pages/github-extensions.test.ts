import { describe, expect, it } from "vitest";
import {
  extensionAppliesToBot,
  normalizeGitHubRepoUrl,
  sanitizeExtensionInstructions,
} from "./github-extensions.js";

describe("GitHub extension helpers", () => {
  it("normalizes canonical public GitHub repository URLs", () => {
    expect(normalizeGitHubRepoUrl("https://github.com/OpenAI/example/")) .toBe(
      "https://github.com/OpenAI/example",
    );
    expect(normalizeGitHubRepoUrl("github.com/OpenAI/example.git")).toBe(
      "https://github.com/OpenAI/example",
    );
  });

  it("rejects non-GitHub hosts and non-repository GitHub paths", () => {
    expect(() => normalizeGitHubRepoUrl("https://example.com/acme/repo")).toThrow(/GitHub/);
    expect(() => normalizeGitHubRepoUrl("https://github.com/acme/repo/issues/2")).toThrow(
      /repository URL/,
    );
    expect(() => normalizeGitHubRepoUrl("https://github.com/acme")).toThrow(/repository URL/);
  });

  it("targets either all bots or an explicit bot list", () => {
    expect(extensionAppliesToBot({ botIds: [] }, "bot-a")).toBe(true);
    expect(extensionAppliesToBot({ botIds: ["bot-a", "bot-b"] }, "bot-b")).toBe(true);
    expect(extensionAppliesToBot({ botIds: ["bot-a"] }, "bot-c")).toBe(false);
  });

  it("bounds declarative instructions before they are persisted or injected", () => {
    expect(sanitizeExtensionInstructions("  ship carefully  ")).toBe("ship carefully");
    expect(sanitizeExtensionInstructions("x".repeat(20_000)).length).toBe(4_000);
  });
});
