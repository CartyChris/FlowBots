import { describe, expect, it } from "vitest";
import {
  createRuntimeFabric,
  desiredRuntimeTargetState,
  enabledRuntimeTargets,
  type RuntimeTargetDefinition,
} from "./runtime-fabric.js";

const docker: RuntimeTargetDefinition = {
  id: "docker-main",
  kind: "docker",
  name: "Docker",
  enabled: true,
  closePolicy: "drain",
  windows: [{ days: [1, 2, 3, 4, 5], startMinute: 8 * 60, endMinute: 20 * 60 }],
};

const host: RuntimeTargetDefinition = {
  id: "host",
  kind: "host",
  name: "This Mac",
  enabled: true,
  windows: [],
};

describe("runtime fabric", () => {
  it("keeps the primary Lite control plane independent from concurrent Docker and host targets", () => {
    const fabric = createRuntimeFabric({ mode: "lite" }, [docker, host]);
    expect(fabric.controlPlane).toEqual({ mode: "lite" });
    expect(enabledRuntimeTargets(fabric).map((target) => target.id)).toEqual([
      "docker-main",
      "host",
    ]);
  });

  it("supports Full Local and Remote without changing execution-target semantics", () => {
    const full = createRuntimeFabric({ mode: "full-local" }, [docker]);
    const remote = createRuntimeFabric(
      { mode: "remote", serverUrl: "https://rakazo.example.com" },
      [docker],
    );
    expect(full.targets[0]?.kind).toBe("docker");
    expect(remote.targets[0]?.kind).toBe("docker");
    expect(remote.controlPlane).toEqual({
      mode: "remote",
      serverUrl: "https://rakazo.example.com",
    });
  });

  it("does not mutate the caller's control-plane profile or target definitions", () => {
    const controlPlane = { mode: "lite" as const };
    const target = { ...docker, windows: [...docker.windows] };
    const fabric = createRuntimeFabric(controlPlane, [target]);
    fabric.targets[0]!.enabled = false;
    expect(controlPlane).toEqual({ mode: "lite" });
    expect(target.enabled).toBe(true);
  });

  it("computes each target independently so scheduled Docker can sleep while host remains available", () => {
    const fabric = createRuntimeFabric({ mode: "lite" }, [docker, host]);
    const lateMonday = { weekday: 1, minuteOfDay: 22 * 60 };
    expect(desiredRuntimeTargetState(fabric.targets[0]!, lateMonday, 0)).toBe("stopped");
    expect(desiredRuntimeTargetState(fabric.targets[1]!, lateMonday, 0)).toBe("running");
  });

  it("accepts all planned harness execution-target kinds without making any one mandatory", () => {
    const kinds: RuntimeTargetDefinition["kind"][] = [
      "host",
      "docker",
      "openhands-local",
      "openhands-agent-server",
      "prime-agent",
      "hermes",
      "paperclip",
      "grok-build",
      "custom-cli",
      "custom-http",
      "mcp",
    ];
    const fabric = createRuntimeFabric(
      { mode: "lite" },
      kinds.map((kind) => ({ id: kind, kind, name: kind, enabled: false, windows: [] })),
    );
    expect(enabledRuntimeTargets(fabric)).toEqual([]);
    expect(fabric.targets.map((target) => target.kind)).toEqual(kinds);
  });
});
