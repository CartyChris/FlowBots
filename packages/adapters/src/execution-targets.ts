import { type CliProcessInput, type CliProcessResult, runCliProcess } from "./cli-agent.js";

export interface ExecutionInvocation {
  command: string;
  args: string[];
  cwd: string;
}

export type ExecutionCommandRunner = (input: CliProcessInput) => Promise<CliProcessResult>;

export interface ExecutionTargetProbe {
  available: boolean;
  detail?: string;
}

export interface ManagedExecutionTarget {
  id: string;
  kind: "docker";
  name: string;
  probe(): Promise<ExecutionTargetProbe>;
  start(input?: { approvalToken?: string }): Promise<void>;
  stop(): Promise<void>;
}

export interface DockerExecutionTargetConfig {
  id: string;
  name: string;
  cwd: string;
  composeFiles?: string[];
  projectName?: string;
  services?: string[];
  timeoutMs?: number;
  approvalToken?: string;
}

export function buildDockerComposeInvocation(
  config: DockerExecutionTargetConfig,
  action: "start" | "stop",
): ExecutionInvocation {
  const args = ["compose"];
  for (const composeFile of config.composeFiles ?? []) {
    args.push("-f", composeFile);
  }
  if (config.projectName) args.push("-p", config.projectName);

  if (action === "start") args.push("up", "-d");
  else args.push("stop");
  args.push(...(config.services ?? []));

  return { command: "docker", args, cwd: requiredCwd(config.cwd) };
}

export function createDockerExecutionTarget(
  config: DockerExecutionTargetConfig,
  runner: ExecutionCommandRunner = runCliProcess,
): ManagedExecutionTarget {
  const cwd = requiredCwd(config.cwd);
  const timeoutMs = Math.max(1_000, config.timeoutMs ?? 60_000);

  return {
    id: config.id,
    kind: "docker",
    name: config.name,
    async probe() {
      return probeDocker(runner, cwd, timeoutMs);
    },
    async start(input) {
      assertStartApproved(config, input?.approvalToken);
      await runDockerAction("start", config, runner, timeoutMs);
      const readiness = await probeDocker(runner, cwd, timeoutMs);
      if (!readiness.available) {
        throw new Error(
          `Docker readiness probe failed after ${config.name} started: ${readiness.detail ?? "Docker is unavailable"}`,
        );
      }
    },
    async stop() {
      await runDockerAction("stop", config, runner, timeoutMs);
    },
  };
}

async function probeDocker(
  runner: ExecutionCommandRunner,
  cwd: string,
  timeoutMs: number,
): Promise<ExecutionTargetProbe> {
  try {
    const result = await runner({
      command: "docker",
      args: ["info", "--format", "{{json .ServerVersion}}"],
      cwd,
      timeoutMs: Math.min(timeoutMs, 10_000),
      maxOutputBytes: 64 * 1024,
    });
    if (result.code === 0 && !result.timedOut && !result.aborted) {
      const detail = result.stdout.trim();
      return detail ? { available: true, detail } : { available: true };
    }
    return { available: false, detail: commandDetail(result, "Docker is unavailable") };
  } catch (error) {
    return {
      available: false,
      detail: error instanceof Error ? error.message : "Docker is unavailable",
    };
  }
}

function assertStartApproved(
  config: DockerExecutionTargetConfig,
  suppliedToken: string | undefined,
) {
  const expectedToken = config.approvalToken?.trim();
  const supplied = suppliedToken?.trim();
  if (!expectedToken || supplied !== expectedToken) {
    throw new Error(`${config.name} start requires explicit user approval.`);
  }
}

async function runDockerAction(
  action: "start" | "stop",
  config: DockerExecutionTargetConfig,
  runner: ExecutionCommandRunner,
  timeoutMs: number,
): Promise<void> {
  const invocation = buildDockerComposeInvocation(config, action);
  const result = await runner({
    ...invocation,
    timeoutMs,
    maxOutputBytes: 2 * 1024 * 1024,
  });
  if (result.code !== 0 || result.timedOut || result.aborted || result.outputTruncated) {
    throw new Error(
      `Docker ${action === "start" ? "start" : "stop"} failed: ${commandDetail(result, "unknown Docker error")}`,
    );
  }
}

function commandDetail(result: CliProcessResult, fallback: string): string {
  if (result.timedOut) return "command timed out";
  if (result.aborted) return "command was aborted";
  if (result.outputTruncated) return "command output exceeded the configured limit";
  return result.stderr.trim() || result.stdout.trim() || fallback;
}

function requiredCwd(value: string): string {
  const cwd = String(value ?? "").trim();
  if (!cwd) throw new Error("Docker execution target requires a working directory");
  return cwd;
}
