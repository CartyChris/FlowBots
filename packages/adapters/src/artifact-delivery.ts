import path from "node:path";
import type { AdapterContext, ArtifactStore, ComputerRef, SandboxProvider } from "@rakazo/adapter-kit";
import type { PrismaClient } from "@rakazo/db";
import { MAX_ARTIFACT_BYTES, mimeTypeForArtifact } from "./run-artifacts.js";

export async function persistWorkspaceArtifact(input: {
  artifacts: ArtifactStore;
  prisma: PrismaClient;
  sandbox: SandboxProvider;
  computer: ComputerRef;
  context: AdapterContext;
  filePath: string;
  workspaceId: string;
  userId: string;
  botId: string;
  runId?: string;
}) {
  const bytes = await input.sandbox.readFile(input.computer, input.filePath, input.context, {
    maxBytes: MAX_ARTIFACT_BYTES + 1,
  });
  if (bytes.byteLength > MAX_ARTIFACT_BYTES) {
    throw new Error(`Artifact exceeds the ${MAX_ARTIFACT_BYTES}-byte delivery limit.`);
  }

  const normalized = input.filePath.replace(/\\/g, "/");
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
      kind: "file" as const,
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
