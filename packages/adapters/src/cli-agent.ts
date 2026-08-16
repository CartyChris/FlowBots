import { spawn } from "node:child_process";

export type CliAgentMode = "analyze" | "write";

export interface CliAgentDefinition {
  id: string;
  label: string;
  executable: string;
  authOwner: "cli" | "external";
  structuredOutput: boolean;
  supportsModel: boolean;
  supportsAdditionalDirs: boolean;
  writePolicy: "native-sandbox" | "permission-mode" | "cli-policy" | "external-verification";
  outerVerificationRequired: boolean;
}

export const BUILTIN_CLI_AGENTS: CliAgentDefinition[] = [
  {
    id: "claude-code",
    label: "Claude Code",
    executable: "claude",
    authOwner: "cli",
    structuredOutput: true,
    supportsModel: true,
    supportsAdditionalDirs: true,
    writePolicy: "permission-mode",
    outerVerificationRequired: true,
  },
  {
    id: "codex",
    label: "Codex",
    executable: "codex",
    authOwner: "cli",
    structuredOutput: true,
    supportsModel: true,
    supportsAdditionalDirs: false,
    writePolicy: "native-sandbox",
    outerVerificationRequired: true,
  },
  {
    id: "kimi-code",
    label: "Kimi Code",
    executable: "kimi",
    authOwner: "cli",
    structuredOutput: true,
    supportsModel: true,
    supportsAdditionalDirs: true,
    writePolicy: "external-verification",
    outerVerificationRequired: true,
  },
  {
    id: "opencode",
    label: "OpenCode",
    executable: "opencode",
    authOwner: "cli",
    structuredOutput: true,
    supportsModel: true,
    supportsAdditionalDirs: false,
    writePolicy: "cli-policy",
    outerVerificationRequired: true,
  },
  {
    id: "prime-agent",
    label: "Prime Agent",
    executable: "prime-agent",
    authOwner: "external",
    structuredOutput: false,
    supportsModel: false,
    supportsAdditionalDirs: false,
    writePolicy: "external-verification",
    outerVerificationRequired: true,
  },
];

export interface CliInvocationInput {
  agentId: string;
  prompt: string;
  cwd: string;
  mode: CliAgentMode;
  model?: string;
  maxTurns?: number;
  additionalDirs?: string[];
  custom?: { executable: string; args: string[] };
}

export interface CliInvocation {
  command: string;
  args: string[];
  cwd: string;
  outerVerificationRequired: boolean;
}

export function buildCliInvocation(input: CliInvocationInput): CliInvocation {
  const prompt = String(input.prompt ?? "");
  const cwd = String(input.cwd ?? "");
  if (!cwd) throw new Error("CLI agent requires a working directory");

  if (input.agentId === "custom") {
    if (!input.custom?.executable) throw new Error("Custom CLI requires an executable");
    return {
      command: input.custom.executable,
      args: input.custom.args.map((arg) =>
        replaceCliPlaceholders(arg, {
          prompt,
          cwd,
          mode: input.mode,
          model: input.model ?? "",
        }),
      ),
      cwd,
      outerVerificationRequired: true,
    };
  }

  const definition = BUILTIN_CLI_AGENTS.find((agent) => agent.id === input.agentId);
  if (!definition) throw new Error(`Unknown CLI agent "${input.agentId}"`);

  if (definition.id === "claude-code") {
    const args = ["-p", prompt, "--output-format", "stream-json", "--permission-mode"];
    // Plan is genuinely read-only. acceptEdits permits workspace editing while leaving
    // Claude Code's own permission system in place; Rakazo never uses bypassPermissions.
    args.push(input.mode === "analyze" ? "plan" : "acceptEdits");
    if (input.maxTurns && input.maxTurns > 0)
      args.push("--max-turns", String(Math.floor(input.maxTurns)));
    if (input.model) args.push("--model", input.model);
    for (const dir of input.additionalDirs ?? []) args.push("--add-dir", dir);
    return { command: definition.executable, args, cwd, outerVerificationRequired: true };
  }

  if (definition.id === "codex") {
    const args = [
      "exec",
      "--json",
      "--sandbox",
      input.mode === "analyze" ? "read-only" : "workspace-write",
    ];
    if (input.model) args.push("--model", input.model);
    args.push(prompt);
    return { command: definition.executable, args, cwd, outerVerificationRequired: true };
  }

  if (definition.id === "kimi-code") {
    // Kimi print mode owns its permission policy and does not accept --plan alongside -p.
    // Rakazo therefore treats every Kimi mutation as an untrusted candidate that must pass
    // the outer verifier before promotion.
    const args = ["-p", prompt, "--output-format", "stream-json"];
    if (input.model) args.push("--model", input.model);
    for (const dir of input.additionalDirs ?? []) args.push("--add-dir", dir);
    return { command: definition.executable, args, cwd, outerVerificationRequired: true };
  }

  if (definition.id === "opencode") {
    const args = ["run", "--format", "json"];
    if (input.model) args.push("--model", input.model);
    args.push("--dir", cwd, prompt);
    return { command: definition.executable, args, cwd, outerVerificationRequired: true };
  }

  // Prime Agent is intentionally a thin external-workflow boundary. Its concrete command
  // line can evolve independently; users can override it with the custom CLI definition.
  return {
    command: definition.executable,
    args: [prompt],
    cwd,
    outerVerificationRequired: true,
  };
}

function replaceCliPlaceholders(
  value: string,
  replacements: { prompt: string; cwd: string; mode: string; model: string },
): string {
  return value.replace(
    /\{(prompt|cwd|mode|model)\}/g,
    (_, key: keyof typeof replacements) => replacements[key],
  );
}

export interface CliProcessInput {
  command: string;
  args: string[];
  cwd: string;
  timeoutMs: number;
  maxOutputBytes?: number;
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
}

export interface CliProcessResult {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  aborted: boolean;
  outputTruncated: boolean;
}

export function runCliProcess(input: CliProcessInput): Promise<CliProcessResult> {
  return new Promise((resolve) => {
    const maxOutputBytes = Math.max(1_024, input.maxOutputBytes ?? 4 * 1024 * 1024);
    const timeoutMs = Math.max(1, input.timeoutMs);
    let stdout = "";
    let stderr = "";
    let bytes = 0;
    let timedOut = false;
    let aborted = false;
    let outputTruncated = false;
    let finished = false;

    const child = spawn(input.command, input.args, {
      cwd: input.cwd,
      env: input.env ?? process.env,
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const append = (kind: "stdout" | "stderr", chunk: Buffer) => {
      if (finished) return;
      const remaining = Math.max(0, maxOutputBytes - bytes);
      if (!remaining) {
        outputTruncated = true;
        child.kill("SIGTERM");
        return;
      }
      const slice = chunk.subarray(0, remaining);
      bytes += slice.length;
      if (kind === "stdout") stdout += slice.toString("utf8");
      else stderr += slice.toString("utf8");
      if (slice.length < chunk.length || bytes >= maxOutputBytes) {
        outputTruncated = true;
        child.kill("SIGTERM");
      }
    };

    child.stdout?.on("data", (chunk: Buffer) => append("stdout", chunk));
    child.stderr?.on("data", (chunk: Buffer) => append("stderr", chunk));

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      const force = setTimeout(() => child.kill("SIGKILL"), 250);
      force.unref?.();
    }, timeoutMs);
    timer.unref?.();

    const onAbort = () => {
      aborted = true;
      child.kill("SIGTERM");
    };
    if (input.signal) {
      if (input.signal.aborted) onAbort();
      else input.signal.addEventListener("abort", onAbort, { once: true });
    }

    const finish = (code: number | null, spawnError?: Error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      input.signal?.removeEventListener("abort", onAbort);
      if (spawnError) stderr += `${stderr ? "\n" : ""}${spawnError.message}`;
      if (outputTruncated) stderr += `${stderr ? "\n" : ""}output limit reached`;
      resolve({ code, stdout, stderr, timedOut, aborted, outputTruncated });
    };

    child.on("error", (error) => finish(null, error));
    child.on("close", (code) => finish(code));
  });
}
