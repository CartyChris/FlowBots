import { createHash } from "node:crypto";
import path from "node:path";
import type {
  AdapterContext,
  ArtifactStore,
  ComputerRef,
  SandboxProvider,
} from "@rakazo/adapter-kit";
import type { MessageBlock } from "@rakazo/contracts";
import type { PrismaClient } from "@rakazo/db";
import {
  MAX_ARTIFACT_BYTES,
  isRelevantDeliverable,
  mimeTypeForArtifact,
  selectChangedRunArtifacts,
} from "./run-artifacts.js";

type FileBlock = Extract<MessageBlock, { kind: "file" }>;

type PersistenceInput = {
  artifacts: ArtifactStore;
  prisma: PrismaClient;
  context: AdapterContext;
  workspaceId: string;
  userId: string;
  botId: string;
  runId?: string;
};

export async function persistWorkspaceArtifact(
  input: PersistenceInput & {
    sandbox: SandboxProvider;
    computer: ComputerRef;
    filePath: string;
  },
): Promise<FileBlock> {
  const bytes = await input.sandbox.readFile(input.computer, input.filePath, input.context, {
    maxBytes: MAX_ARTIFACT_BYTES + 1,
  });
  if (bytes.byteLength > MAX_ARTIFACT_BYTES) {
    throw new Error(`Artifact exceeds the ${MAX_ARTIFACT_BYTES}-byte delivery limit.`);
  }

  return persistArtifactBytes(input, input.filePath, bytes);
}

export async function snapshotWorkspaceArtifacts(
  sandbox: SandboxProvider,
  computer: ComputerRef,
  context: AdapterContext,
): Promise<Map<string, string>> {
  const baseline = new Map<string, string>();
  for await (const file of sandbox.exportWorkspace(computer, context)) {
    const normalized = normalizePath(file.path);
    if (!isRelevantDeliverable(normalized) || file.content.byteLength > MAX_ARTIFACT_BYTES) continue;
    baseline.set(normalized, hashBytes(file.content));
  }
  return baseline;
}

export async function captureChangedWorkspaceArtifacts(
  input: PersistenceInput & {
    sandbox: SandboxProvider;
    computer: ComputerRef;
    baseline: ReadonlyMap<string, string>;
    excludePaths?: ReadonlySet<string>;
  },
): Promise<FileBlock[]> {
  const current = new Map<string, Uint8Array>();
  const changed: Array<{ path: string; size: number; modifiedAt: number }> = [];
  const excluded = new Set(Array.from(input.excludePaths ?? [], normalizePath));

  for await (const file of input.sandbox.exportWorkspace(input.computer, input.context)) {
    const normalized = normalizePath(file.path);
    if (excluded.has(normalized)) continue;
    if (!isRelevantDeliverable(normalized) || file.content.byteLength > MAX_ARTIFACT_BYTES) continue;
    if (input.baseline.get(normalized) === hashBytes(file.content)) continue;

    current.set(normalized, file.content);
    changed.push({ path: normalized, size: file.content.byteLength, modifiedAt: 1 });
  }

  const selected = selectChangedRunArtifacts(new Map(), changed);
  const blocks: FileBlock[] = [];
  for (const candidate of selected) {
    const bytes = current.get(normalizePath(candidate.path));
    if (!bytes) continue;
    blocks.push(await persistArtifactBytes(input, candidate.path, bytes));
  }
  return blocks;
}

async function persistArtifactBytes(
  input: PersistenceInput,
  filePath: string,
  bytes: Uint8Array,
): Promise<FileBlock> {
  const normalized = normalizePath(filePath);
  const name = path.posix.basename(normalized);
  const mimeType = mimeTypeForArtifact(normalized);
  const stored = await input.artifacts.put({ name, mimeType, bytes }, input.context);

  try {
    const artifact = await input.prisma.artifact.create({
      data: {
        workspaceId: input.workspaceId,
        userId: input.userId,
        botId: input.botId,
        runId: input.runId,
        name,
        mimeType,
        size: bytes.byteLength,
        hash: stored.hash,
        storageKey: stored.id,
      },
      select: { id: true },
    });
    return {
      kind: "file",
      artifactId: artifact.id,
      name,
      mimeType,
      size: bytes.byteLength,
    };
  } catch (error) {
    await input.artifacts.remove(stored.id, input.context).catch(() => undefined);
    throw error;
  }
}

function hashBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/").replace(/^\.\//, "");
}
