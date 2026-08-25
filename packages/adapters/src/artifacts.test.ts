import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AdapterContext } from "@rakazo/adapter-kit";
import { afterEach, describe, expect, it } from "vitest";
import { LocalArtifactStore } from "./artifacts.js";

const roots: string[] = [];
const context: AdapterContext = {
  operationId: "artifact-test",
  traceId: "artifact-test",
  workspaceId: "workspace-1",
  userId: "user-1",
  botId: "bot-1",
  runId: "run-1",
  signal: new AbortController().signal,
};

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("LocalArtifactStore", () => {
  it("preserves binary bytes and returns their SHA-256 digest", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "flowbots-artifacts-"));
    roots.push(root);
    const store = new LocalArtifactStore(root);
    const bytes = Uint8Array.from([0, 255, 17, 0, 128, 42]);

    const stored = await store.put(
      { name: "sample.bin", mimeType: "application/octet-stream", bytes },
      context,
    );

    expect(stored.hash).toBe(createHash("sha256").update(bytes).digest("hex"));
    expect(await store.get(stored.id, context)).toEqual(bytes);
  });
});
