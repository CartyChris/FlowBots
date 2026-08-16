import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AdapterContext } from "@rakazo/adapter-kit";
import { afterEach, expect, test } from "vitest";
import { MnemosyneSemanticIndex } from "./mnemosyne.js";

const tempDirs: string[] = [];
afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const realMnemosyneTest = process.env.RAKAZO_TEST_MNEMOSYNE === "1" ? test : test.skip;

realMnemosyneTest(
  "indexes canonical Markdown memory and recalls it through real Mnemosyne 3.15.1",
  async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "rakazo-real-mnemosyne-"));
    tempDirs.push(rootDir);
    const context: AdapterContext = {
      operationId: "mnemosyne-integration",
      traceId: "mnemosyne-integration",
      workspaceId: "integration-workspace",
      userId: "integration-user",
      botId: "integration-bot",
      signal: new AbortController().signal,
    };
    const index = new MnemosyneSemanticIndex({
      rootDir,
      mode: "required",
      command: process.env.MNEMOSYNE_COMMAND ?? "mnemosyne",
      timeoutMs: 20_000,
    });
    const documents = [
      {
        id: "project-memory",
        path: "PROJECT.md",
        revision: 1,
        content:
          "The Rakazo project uses the Vitest testing framework for TypeScript adapter verification and regression checks.",
      },
      {
        id: "desktop-memory",
        path: "DESKTOP.md",
        revision: 1,
        content:
          "The FlowBots desktop release uses Electron and an embedded local runtime for the macOS application.",
      },
    ];

    const vitestRecall = await index.search(
      {
        query: "Vitest testing framework",
        scope: "bot",
        botId: context.botId,
        documents,
      },
      context,
    );
    expect(vitestRecall).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: "PROJECT.md" })]),
    );

    const updated = [
      {
        ...documents[0]!,
        revision: 2,
        content:
          "The Rakazo project now records the unique integration marker OBSIDIAN-ORBIT in its TypeScript memory verification notes.",
      },
      documents[1]!,
    ];
    const updatedRecall = await index.search(
      {
        query: "OBSIDIAN-ORBIT",
        scope: "bot",
        botId: context.botId,
        documents: updated,
      },
      context,
    );
    expect(updatedRecall).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: "PROJECT.md" })]),
    );
  },
  60_000,
);