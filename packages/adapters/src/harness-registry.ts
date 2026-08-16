import { BUILTIN_CLI_AGENTS, type CliAgentDefinition, runCliProcess } from "./cli-agent.js";

export type HarnessKind = "cli" | "rpc" | "acp" | "agent-server" | "api" | "mcp";
export type HarnessInteractionMode = "chat" | "headless" | "rpc" | "acp" | "http" | "mcp";
export type HarnessWorkspacePolicy = "read-only" | "workspace-write" | "full-host" | "container";

export interface HarnessProbe {
  available: boolean;
  version?: string;
  detail?: string;
  capabilities?: Record<string, unknown>;
}

export interface HarnessDefinition {
  id: string;
  label: string;
  kind: HarnessKind;
  interactions: HarnessInteractionMode[];
  workspacePolicies: HarnessWorkspacePolicy[];
  scheduleable: boolean;
  resident: boolean;
  outerVerificationRequired: boolean;
  probe(): Promise<HarnessProbe>;
}

export interface HarnessProbeSnapshot extends HarnessProbe {
  id: string;
}

export class HarnessRegistry {
  private readonly definitions = new Map<string, HarnessDefinition>();

  constructor(definitions: readonly HarnessDefinition[] = []) {
    for (const definition of definitions) this.register(definition);
  }

  register(definition: HarnessDefinition): void {
    const id = definition.id.trim();
    if (!id) throw new Error("Harness id is required");
    if (this.definitions.has(id)) throw new Error(`Duplicate harness id "${id}"`);
    this.definitions.set(id, cloneHarnessDefinition({ ...definition, id }));
  }

  get(id: string): HarnessDefinition | undefined {
    const definition = this.definitions.get(id);
    return definition ? cloneHarnessDefinition(definition) : undefined;
  }

  list(): HarnessDefinition[] {
    return Array.from(this.definitions.values(), cloneHarnessDefinition);
  }

  async probeAll(): Promise<HarnessProbeSnapshot[]> {
    return Promise.all(
      Array.from(this.definitions.values(), async (definition): Promise<HarnessProbeSnapshot> => {
        try {
          return { id: definition.id, ...(await definition.probe()) };
        } catch (error) {
          return {
            id: definition.id,
            available: false,
            detail: error instanceof Error ? error.message : String(error),
          };
        }
      }),
    );
  }
}

export type CliHarnessProbe = (agent?: CliAgentDefinition) => Promise<HarnessProbe>;

export function cliHarnessDefinitions(
  probe: CliHarnessProbe = defaultCliHarnessProbe,
): HarnessDefinition[] {
  return BUILTIN_CLI_AGENTS.map((agent) => ({
    id: agent.id,
    label: agent.label,
    kind: "cli" as const,
    interactions:
      agent.id === "prime-agent"
        ? (["headless", "rpc"] as HarnessInteractionMode[])
        : (["headless"] as HarnessInteractionMode[]),
    workspacePolicies: ["read-only", "workspace-write"],
    scheduleable: true,
    resident: agent.id === "prime-agent",
    outerVerificationRequired: agent.outerVerificationRequired,
    probe: () => probe(agent),
  }));
}

export async function defaultCliHarnessProbe(agent?: CliAgentDefinition): Promise<HarnessProbe> {
  if (!agent) return { available: false, detail: "CLI harness definition is required" };
  const result = await runCliProcess({
    command: agent.executable,
    args: ["--version"],
    cwd: process.cwd(),
    timeoutMs: 5_000,
    maxOutputBytes: 64 * 1024,
  });
  if (result.code !== 0 || result.timedOut || result.aborted) {
    return {
      available: false,
      detail:
        result.stderr.trim() ||
        result.stdout.trim() ||
        (result.timedOut ? "version probe timed out" : "CLI is unavailable"),
    };
  }
  const version = firstNonEmptyLine(result.stdout) || firstNonEmptyLine(result.stderr);
  return { available: true, ...(version ? { version } : {}) };
}

function cloneHarnessDefinition(definition: HarnessDefinition): HarnessDefinition {
  return {
    ...definition,
    interactions: [...definition.interactions],
    workspacePolicies: [...definition.workspacePolicies],
  };
}

function firstNonEmptyLine(value: string): string | undefined {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
}
