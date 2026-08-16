import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AdapterContext, MemorySearchResult } from "@rakazo/adapter-kit";

export type MnemosyneMode = "auto" | "off" | "required";

export interface MnemosyneCommandOptions {
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
  maxOutputBytes: number;
  signal?: AbortSignal;
}

export interface MnemosyneCommandRunner {
  run(
    command: string,
    args: string[],
    options: MnemosyneCommandOptions,
  ): Promise<{ stdout: string; stderr: string }>;
}

export interface CanonicalMemoryDocument {
  id: string;
  path: string;
  content: string;
  revision: number;
}

interface MnemosyneManifest {
  schema: 1;
  fingerprint: string;
}

interface MnemosyneRecallResult {
  source?: unknown;
  score?: unknown;
}

const SOURCE_PREFIX = "rakazo-path:";
const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_OUTPUT_BYTES = 1_000_000;

export function memoryFingerprint(documents: readonly CanonicalMemoryDocument[]): string {
  const canonical = [...documents]
    .sort((a, b) => a.path.localeCompare(b.path) || a.id.localeCompare(b.id))
    .map((document) => ({
      id: document.id,
      path: document.path,
      revision: document.revision,
      content: document.content,
    }));
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

export function memoryIndexKey(
  context: Pick<AdapterContext, "workspaceId" | "userId">,
  scope: "bot" | "user",
  botId?: string,
): string {
  return createHash("sha256")
    .update(JSON.stringify([context.workspaceId, context.userId, scope, botId ?? ""]))
    .digest("hex");
}

export function mnemosyneSourceForPath(memoryPath: string): string {
  return `${SOURCE_PREFIX}${Buffer.from(memoryPath, "utf8").toString("base64url")}`;
}

function pathFromMnemosyneSource(source: unknown): string | undefined {
  if (typeof source !== "string" || !source.startsWith(SOURCE_PREFIX)) return undefined;
  const encoded = source.slice(SOURCE_PREFIX.length);
  if (!encoded) return undefined;
  try {
    return Buffer.from(encoded, "base64url").toString("utf8") || undefined;
  } catch {
    return undefined;
  }
}

export class MnemosyneSemanticIndex {
  private readonly rootDir: string;
  private readonly mode: MnemosyneMode;
  private readonly command: string;
  private readonly timeoutMs: number;
  private readonly maxOutputBytes: number;
  private readonly runner: MnemosyneCommandRunner;
  private readonly rebuilds = new Map<string, Promise<void>>();

  constructor(options: {
    rootDir: string;
    mode?: MnemosyneMode;
    command?: string;
    timeoutMs?: number;
    maxOutputBytes?: number;
    runner?: MnemosyneCommandRunner;
  }) {
    this.rootDir = path.resolve(options.rootDir);
    this.mode = options.mode ?? "auto";
    this.command = options.command?.trim() || "mnemosyne";
    this.timeoutMs = clampInteger(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, 500, 60_000);
    this.maxOutputBytes = clampInteger(
      options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES,
      16_384,
      8_000_000,
    );
    this.runner = options.runner ?? nodeMnemosyneRunner;
  }

  async search(
    request: {
      query: string;
      scope: "bot" | "user";
      botId?: string;
      documents: readonly CanonicalMemoryDocument[];
    },
    context: AdapterContext,
  ): Promise<MemorySearchResult[]> {
    if (this.mode === "off" || !request.query.trim() || request.documents.length === 0) return [];

    try {
      const botId = request.scope === "bot" ? request.botId ?? context.botId : undefined;
      if (request.scope === "bot" && !botId?.trim()) {
        throw new Error("bot scope requires a concrete bot identity");
      }
      const key = memoryIndexKey(context, request.scope, botId);
      const dataDir = path.join(this.rootDir, key);
      await this.ensureIndex(key, dataDir, request.documents, context.signal);

      const response = await this.run(
        ["recall", request.query, "8", "--json"],
        dataDir,
        context.signal,
      );
      const payload = parseRecallPayload(response.stdout);
      const canonicalByPath = new Map(request.documents.map((document) => [document.path, document]));
      const merged = new Map<string, MemorySearchResult>();

      for (const candidate of payload) {
        const memoryPath = pathFromMnemosyneSource(candidate.source);
        if (!memoryPath) continue;
        const canonical = canonicalByPath.get(memoryPath);
        if (!canonical) continue;
        const score = Number(candidate.score);
        if (!Number.isFinite(score) || score < 0) continue;
        const next: MemorySearchResult = {
          path: canonical.path,
          snippet: canonical.content.slice(0, 240),
          score,
        };
        const existing = merged.get(next.path);
        if (!existing || next.score > existing.score) merged.set(next.path, next);
      }

      return [...merged.values()].sort(
        (a, b) => b.score - a.score || a.path.localeCompare(b.path),
      );
    } catch (error) {
      if (this.mode === "required") {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`Mnemosyne memory is required but unavailable: ${detail}`);
      }
      return [];
    }
  }

  private async ensureIndex(
    key: string,
    dataDir: string,
    documents: readonly CanonicalMemoryDocument[],
    signal?: AbortSignal,
  ): Promise<void> {
    const pending = this.rebuilds.get(key);
    if (pending) return pending;

    const work = this.ensureIndexUnlocked(dataDir, documents, signal).finally(() => {
      if (this.rebuilds.get(key) === work) this.rebuilds.delete(key);
    });
    this.rebuilds.set(key, work);
    return work;
  }

  private async ensureIndexUnlocked(
    dataDir: string,
    documents: readonly CanonicalMemoryDocument[],
    signal?: AbortSignal,
  ): Promise<void> {
    await ensurePrivateDirectory(dataDir);
    const fingerprint = memoryFingerprint(documents);
    const manifest = await readManifest(path.join(dataDir, ".rakazo-index.json"));
    if (manifest?.schema === 1 && manifest.fingerprint === fingerprint) return;

    await rm(dataDir, { recursive: true, force: true });
    await ensurePrivateDirectory(dataDir);
    for (const document of [...documents].sort((a, b) => a.path.localeCompare(b.path))) {
      await this.run(
        ["store", document.content, mnemosyneSourceForPath(document.path), "0.8"],
        dataDir,
        signal,
      );
    }

    await writeManifest(path.join(dataDir, ".rakazo-index.json"), {
      schema: 1,
      fingerprint,
    });
  }

  private run(args: string[], dataDir: string, signal?: AbortSignal) {
    return this.runner.run(this.command, args, {
      env: { ...process.env, MNEMOSYNE_DATA_DIR: dataDir },
      timeoutMs: this.timeoutMs,
      maxOutputBytes: this.maxOutputBytes,
      signal,
    });
  }
}

const nodeMnemosyneRunner: MnemosyneCommandRunner = {
  run(command, args, options) {
    return new Promise((resolve, reject) => {
      if (options.signal?.aborted) {
        reject(options.signal.reason ?? new Error("Mnemosyne command aborted"));
        return;
      }

      const child = spawn(command, args, {
        env: options.env,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      let outputBytes = 0;
      let settled = false;

      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        options.signal?.removeEventListener("abort", onAbort);
        if (error) reject(error);
        else resolve({ stdout, stderr });
      };
      const append = (channel: "stdout" | "stderr", value: Buffer) => {
        outputBytes += value.byteLength;
        if (outputBytes > options.maxOutputBytes) {
          child.kill("SIGKILL");
          finish(new Error("Mnemosyne output exceeded the configured limit"));
          return;
        }
        if (channel === "stdout") stdout += value.toString("utf8");
        else stderr += value.toString("utf8");
      };
      const onAbort = () => {
        child.kill("SIGKILL");
        const reason = options.signal?.reason;
        finish(reason instanceof Error ? reason : new Error("Mnemosyne command aborted"));
      };
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        finish(new Error(`Mnemosyne command timed out after ${options.timeoutMs}ms`));
      }, options.timeoutMs);
      timer.unref?.();

      options.signal?.addEventListener("abort", onAbort, { once: true });
      child.stdout.on("data", (value: Buffer) => append("stdout", value));
      child.stderr.on("data", (value: Buffer) => append("stderr", value));
      child.on("error", (error) => finish(error));
      child.on("close", (code, signal) => {
        if (settled) return;
        if (code === 0) finish();
        else {
          const detail = stderr.trim() || `exit ${code ?? "unknown"}${signal ? ` (${signal})` : ""}`;
          finish(new Error(`Mnemosyne command failed: ${detail}`));
        }
      });
    });
  },
};

function parseRecallPayload(raw: string): MnemosyneRecallResult[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Mnemosyne recall returned invalid JSON");
  }
  if (!parsed || typeof parsed !== "object") return [];
  const results = (parsed as { results?: unknown }).results;
  if (!Array.isArray(results)) return [];
  return results.filter((item): item is MnemosyneRecallResult => Boolean(item && typeof item === "object"));
}

async function readManifest(file: string): Promise<MnemosyneManifest | undefined> {
  try {
    const parsed = JSON.parse(await readFile(file, "utf8")) as Partial<MnemosyneManifest>;
    if (parsed.schema !== 1 || typeof parsed.fingerprint !== "string") return undefined;
    return parsed as MnemosyneManifest;
  } catch {
    return undefined;
  }
}

async function writeManifest(file: string, manifest: MnemosyneManifest): Promise<void> {
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temp, `${JSON.stringify(manifest)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temp, file);
}

async function ensurePrivateDirectory(directory: string): Promise<void> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  if (process.platform !== "win32") await chmod(directory, 0o700);
}

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}