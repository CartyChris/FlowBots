import { describe, expect, it } from "vitest";
import { DOCKER_SETUP_STORAGE_KEY, dockerSetupPrompt } from "./docker-setup";

describe("Docker setup handoff", () => {
  it("uses one stable local intent key", () => {
    expect(DOCKER_SETUP_STORAGE_KEY).toBe("flowbots:docker-setup-help");
  });

  it("requires inspection, explicit privilege approval, and verification", () => {
    const prompt = dockerSetupPrompt();
    expect(prompt).toMatch(/inspect.*Docker/i);
    expect(prompt).toMatch(/ask me before.*install/i);
    expect(prompt).toMatch(/administrator|sudo/i);
    expect(prompt).toMatch(/security/i);
    expect(prompt).toMatch(/destructive/i);
    expect(prompt).toMatch(/verify.*works/i);
    expect(prompt).toMatch(/switch.*Docker/i);
  });
});
