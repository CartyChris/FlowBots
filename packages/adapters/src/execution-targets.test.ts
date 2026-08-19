import { describe, expect, it, vi } from "vitest";
import {
  buildDockerComposeInvocation,
  createDockerExecutionTarget,
  type DockerExecutionTargetConfig,
  type ExecutionCommandRunner,
  type ManagedExecutionTarget,
} from "./execution-targets.js";

const APPROVAL = "user-approved-docker-start";

const ok = (stdout = "") => ({
  code: 0,
  stdout,
  stderr: "",
  timedOut: false,
  aborted: false,
  outputTruncated: false,
});

function approvedConfig(config: DockerExecutionTargetConfig): DockerExecutionTargetConfig {
  return { ...config, approvalToken: APPROVAL } as DockerExecutionTargetConfig;
}

function startApproved(target: ManagedExecutionTarget) {
  return (
    target.start as unknown as (input: { approvalToken: string }) => Promise<void>
  )({ approvalToken: APPROVAL });
}

describe("Docker execution target", () => {
  it("builds direct argv for selected compose files/services without shell interpolation", () => {
    expect(
      buildDockerComposeInvocation(
        {
          id: "agents",
          name: "Agent services",
          cwd: "/work/rakazo",
          projectName: "rakazo-agents; touch /tmp/nope",
          composeFiles: ["compose.yml", "compose.agents.yml"],
          services: ["openhands", "paperclip"],
        },
        "start",
      ),
    ).toEqual({
      command: "docker",
      args: [
        "compose",
        "-f",
        "compose.yml",
        "-f",
        "compose.agents.yml",
        "-p",
        "rakazo-agents; touch /tmp/nope",
        "up",
        "-d",
        "openhands",
        "paperclip",
      ],
      cwd: "/work/rakazo",
    });
  });

  it("uses compose stop for scheduled shutdown so persistent volumes are not destroyed", () => {
    const invocation = buildDockerComposeInvocation(
      { id: "agents", name: "Agents", cwd: "/work", services: ["openhands"] },
      "stop",
    );
    expect(invocation.args).toEqual(["compose", "stop", "openhands"]);
    expect(invocation.args).not.toContain("down");
    expect(invocation.args).not.toContain("-v");
  });

  it("probes Docker independently and reports missing/unavailable Docker without throwing", async () => {
    const runner: ExecutionCommandRunner = vi.fn(async (input) =>
      input.args[0] === "info" ? { ...ok(), code: 127, stderr: "docker: command not found" } : ok(),
    );
    const target = createDockerExecutionTarget(
      approvedConfig({ id: "docker", name: "Docker", cwd: "/work" }),
      runner,
    );
    await expect(target.probe()).resolves.toEqual({
      available: false,
      detail: "docker: command not found",
    });
  });

  it("refuses to start before the exact user approval token is supplied", async () => {
    const runner: ExecutionCommandRunner = vi.fn(async () => ok());
    const target = createDockerExecutionTarget(
      approvedConfig({ id: "agents", name: "Agent services", cwd: "/work" }),
      runner,
    );

    await expect(target.start()).rejects.toThrow(/approval/i);
    expect(runner).not.toHaveBeenCalled();
  });

  it("starts, verifies readiness, and stops only the user-selected workload", async () => {
    const runner: ExecutionCommandRunner = vi.fn(async (input) =>
      input.args[0] === "info" ? ok('"27.5.1"') : ok(),
    );
    const target = createDockerExecutionTarget(
      approvedConfig({
        id: "agents",
        name: "Agent services",
        cwd: "/work",
        projectName: "rakazo-agents",
        services: ["openhands", "paperclip"],
      }),
      runner,
    );

    await startApproved(target);
    await target.stop();
    const calls = vi.mocked(runner).mock.calls.map(([input]) => [input.command, input.args]);
    expect(calls).toEqual([
      ["docker", ["compose", "-p", "rakazo-agents", "up", "-d", "openhands", "paperclip"]],
      ["docker", ["info", "--format", "{{json .ServerVersion}}"]],
      ["docker", ["compose", "-p", "rakazo-agents", "stop", "openhands", "paperclip"]],
    ]);
  });

  it("fails start when compose succeeds but the post-start readiness probe fails", async () => {
    const runner: ExecutionCommandRunner = vi.fn(async (input) =>
      input.args[0] === "info"
        ? { ...ok(), code: 1, stderr: "Cannot connect to the Docker daemon" }
        : ok(),
    );
    const target = createDockerExecutionTarget(
      approvedConfig({ id: "docker", name: "Docker", cwd: "/work" }),
      runner,
    );

    await expect(startApproved(target)).rejects.toThrow(/readiness|Docker.*unavailable|daemon/i);
  });

  it("returns actionable command failures instead of pretending a target started", async () => {
    const runner: ExecutionCommandRunner = vi.fn(async (input) =>
      input.args[0] === "compose"
        ? { ...ok(), code: 1, stderr: "Cannot connect to the Docker daemon" }
        : ok(),
    );
    const target = createDockerExecutionTarget(
      approvedConfig({ id: "docker", name: "Docker", cwd: "/work" }),
      runner,
    );
    await expect(startApproved(target)).rejects.toThrow(/Docker.*Cannot connect/i);
  });
});
