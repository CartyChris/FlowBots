import { describe, expect, it, vi } from "vitest";
import { BUILTIN_CLI_AGENTS } from "./cli-agent.js";
import {
  cliHarnessDefinitions,
  type HarnessDefinition,
  HarnessRegistry,
} from "./harness-registry.js";

function definition(
  id: string,
  probe: HarnessDefinition["probe"],
  overrides: Partial<HarnessDefinition> = {},
): HarnessDefinition {
  return {
    id,
    label: id,
    kind: "cli",
    interactions: ["headless"],
    workspacePolicies: ["read-only", "workspace-write"],
    scheduleable: true,
    resident: false,
    outerVerificationRequired: true,
    probe,
    ...overrides,
  };
}

describe("HarnessRegistry", () => {
  it("isolates probe failures so one missing/broken harness never blocks the rest", async () => {
    const registry = new HarnessRegistry([
      definition("ok", async () => ({ available: true, version: "1.2.3" })),
      definition("missing", async () => {
        throw new Error("ENOENT: missing binary");
      }),
      definition("offline", async () => ({ available: false, detail: "connection refused" })),
    ]);

    await expect(registry.probeAll()).resolves.toEqual([
      { id: "ok", available: true, version: "1.2.3" },
      { id: "missing", available: false, detail: "ENOENT: missing binary" },
      { id: "offline", available: false, detail: "connection refused" },
    ]);
  });

  it("rejects duplicate stable harness ids instead of silently shadowing definitions", () => {
    const registry = new HarnessRegistry([definition("codex", async () => ({ available: true }))]);
    expect(() => registry.register(definition("codex", async () => ({ available: true })))).toThrow(
      /duplicate.*codex/i,
    );
  });

  it("returns defensive snapshots from list()", () => {
    const registry = new HarnessRegistry([definition("one", async () => ({ available: true }))]);
    const listed = registry.list();
    listed[0]!.interactions.push("rpc");
    expect(registry.get("one")?.interactions).toEqual(["headless"]);
  });
});

describe("existing CLI bridge projection", () => {
  it("reuses every existing built-in CLI agent as a harness definition", () => {
    const probe = vi.fn(async () => ({ available: true as const }));
    const harnesses = cliHarnessDefinitions(probe);
    expect(harnesses.map((harness) => harness.id)).toEqual(
      BUILTIN_CLI_AGENTS.map((agent) => agent.id),
    );
    for (const harness of harnesses) {
      expect(harness.kind).toBe("cli");
      expect(harness.outerVerificationRequired).toBe(true);
      expect(harness.workspacePolicies).toContain("read-only");
      expect(harness.workspacePolicies).toContain("workspace-write");
    }
  });

  it("advertises Prime RPC capability without removing its ordinary CLI entry", () => {
    const prime = cliHarnessDefinitions(async () => ({ available: true })).find(
      (harness) => harness.id === "prime-agent",
    );
    expect(prime?.interactions).toContain("headless");
    expect(prime?.interactions).toContain("rpc");
    expect(prime?.resident).toBe(true);
  });
});
