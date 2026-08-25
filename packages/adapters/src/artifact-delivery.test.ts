import type {
  AdapterContext,
  ArtifactPut,
  ArtifactStore,
  ComputerRef,
  SandboxProvider,
} from "@rakazo/adapter-kit";
import { describe, expect, it } from "vitest";
import { persistWorkspaceArtifact } from "./artifact-delivery.js";

const context: AdapterContext = {
  operationId: "artifact-delivery",
  traceId: "artifact-delivery",
  workspaceId: "workspace-1",
  userId: "user-1",
  botId: "bot-1",
  runId: "run-1",
  signal: new AbortController().signal,
};

class RecordingArtifactStore implements ArtifactStore {
  puts: ArtifactPut[] = [];
  removed: string[] = [];

  describe() {
    return {
      id: "recording-artifacts",
      contractVersion: "1",
      adapterVersion: "1",
      capabilities: { stream: true },
    };
  }

  async put(artifact: ArtifactPut) {
    this.puts.push(artifact);
    return { id: "storage-1", hash: "sha256-real" };
  }

  async get() {
    return new Uint8Array();
  }

  async remove(id: string) {
    this.removed.push(id);
  }
}

function sandboxWith(bytes: Uint8Array): SandboxProvider {
  return {
    describe: () => ({
      id: "artifact-sandbox",
      contractVersion: "1",
      adapterVersion: "1",
      capabilities: {
        exec: false,
        files: true,
        screen: false,
        snapshots: false,
        persistent: true,
        interactive: false,
      },
    }),
    readFile: async () => bytes,
  } as unknown as SandboxProvider;
}

const computer = { id: "computer-1", kind: "fake" } as unknown as ComputerRef;

describe("workspace artifact persistence", () => {
  it("persists real workspace bytes before publishing a Prisma-backed file block", async () => {
    const bytes = Uint8Array.from([0, 1, 255, 7, 0]);
    const store = new RecordingArtifactStore();
    let createdData: Record<string, unknown> | undefined;
    const prisma = {
      artifact: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          createdData = data;
          return { id: "artifact-row-1" };
        },
      },
    };

    const block = await persistWorkspaceArtifact({
      artifacts: store,
      prisma: prisma as never,
      sandbox: sandboxWith(bytes),
      computer,
      context,
      filePath: "reports/result.pdf",
      workspaceId: "workspace-1",
      userId: "user-1",
      botId: "bot-1",
      runId: "run-1",
    });

    expect(store.puts).toHaveLength(1);
    expect(store.puts[0]?.bytes).toEqual(bytes);
    expect(createdData).toMatchObject({
      workspaceId: "workspace-1",
      userId: "user-1",
      botId: "bot-1",
      runId: "run-1",
      name: "result.pdf",
      mimeType: "application/pdf",
      size: bytes.byteLength,
      hash: "sha256-real",
      storageKey: "storage-1",
    });
    expect(block).toEqual({
      kind: "file",
      artifactId: "artifact-row-1",
      name: "result.pdf",
      mimeType: "application/pdf",
      size: bytes.byteLength,
    });
  });

  it("removes stored bytes when the database row cannot be created", async () => {
    const store = new RecordingArtifactStore();
    const prisma = {
      artifact: {
        create: async () => {
          throw new Error("database unavailable");
        },
      },
    };

    await expect(
      persistWorkspaceArtifact({
        artifacts: store,
        prisma: prisma as never,
        sandbox: sandboxWith(Uint8Array.from([9, 8, 7])),
        computer,
        context,
        filePath: "output/report.docx",
        workspaceId: "workspace-1",
        userId: "user-1",
        botId: "bot-1",
        runId: "run-1",
      }),
    ).rejects.toThrow("database unavailable");
    expect(store.removed).toEqual(["storage-1"]);
  });
});
