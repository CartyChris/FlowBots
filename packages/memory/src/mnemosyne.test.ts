import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  MnemosyneSemanticIndex,
  memoryFingerprint,
  memoryIndexKey,
  mnemosyneSourceForPath,
  type MnemosyneCommandRunner,
} from "./mnemosyne.js";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

function context() {
  return {
    operationId: "op",
    traceId: "trace",
    workspaceId: "workspace-secret-id",
    userId: "user-secret-id",
    botId: "bot-secret-id",
    signal: new AbortController().signal,
  };
}

const docs = [
  { id: "1", path: "preferences.md", content: "User prefers Vitest over Jest.", revision: 2 },
  { id: "2", path: "projects/rakazo.md", content: "Rakazo is a local-first agent OS.", revision: 4 },
];

describe("Mnemosyne semantic memory index", () => {
  test("fingerprints canonical documents deterministically regardless of input order", () => {
    expect(memoryFingerprint(docs)).toBe(memoryFingerprint([...docs].reverse()));
    expect(
      memoryFingerprint([{ ...docs[0]!, content: "User prefers pytest." }, docs[1]!]),
    ).not.toBe(memoryFingerprint(docs));
  });

  test("derives opaque context-isolated index keys", () => {
    const first = memoryIndexKey(context(), "bot", "bot-secret-id");
    const second = memoryIndexKey({ ...context(), userId: "another-user" }, "bot", "bot-secret-id");
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(first).not.toContain("workspace-secret-id");
    expect(first).not.toContain("user-secret-id");
    expect(first).not.toContain("bot-secret-id");
    expect(second).not.toBe(first);
  });

  test("rebuilds only when canonical memory changes and recalls through isolated local data dir", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "rakazo-mnemosyne-test-"));
    cleanups.push(async () => {
      const { rm } = await import("node:fs/promises");
      await rm(rootDir, { recursive: true, force: true });
    });
    const calls: Array<{
      command: string;
      args: string[];
      dataDir: string | undefined;
      timeoutMs: number;
    }> = [];
    const runner: MnemosyneCommandRunner = {
      async run(command, args, options) {
        calls.push({
          command,
          args: [...args],
          dataDir: options.env.MNEMOSYNE_DATA_DIR,
          timeoutMs: options.timeoutMs,
        });
        if (args[0] === "--version") return { stdout: "Mnemosyne 3.15.1", stderr: "" };
        if (args[0] === "recall") {
          return {
            stdout: JSON.stringify({
              query: args[1],
              top_k: 8,
              results: [
                {
                  id: "m1",
                  content: docs[0]!.content,
                  source: mnemosyneSourceForPath(docs[0]!.path),
                  score: 0.91,
                },
                { id: "bad", content: "ignore", source: "other-system", score: 100 },
              ],
            }),
            stderr: "",
          };
        }
        return { stdout: "Stored: memory-id", stderr: "" };
      },
    };

    const index = new MnemosyneSemanticIndex({ rootDir, runner, timeoutMs: 3210 });
    const first = await index.search(
      { query: "testing preference", scope: "bot", botId: context().botId, documents: docs },
      context(),
    );
    expect(first).toEqual([
      expect.objectContaining({ path: "preferences.md", score: 0.91 }),
    ]);
    expect(calls.filter((call) => call.args[0] === "store")).toHaveLength(2);
    expect(calls.every((call) => call.command === "mnemosyne")).toBe(true);
    expect(calls.every((call) => call.timeoutMs === 3210)).toBe(true);
    const dirs = new Set(calls.map((call) => call.dataDir).filter(Boolean));
    expect(dirs.size).toBe(1);
    const [dataDir] = [...dirs] as string[];
    expect(dataDir).toContain(rootDir);
    expect(dataDir).not.toContain(context().workspaceId);
    expect(dataDir).not.toContain(context().userId);
    expect(dataDir).not.toContain(context().botId!);

    await index.search(
      { query: "testing preference", scope: "bot", botId: context().botId, documents: docs },
      context(),
    );
    expect(calls.filter((call) => call.args[0] === "store")).toHaveLength(2);

    await index.search(
      {
        query: "testing preference",
        scope: "bot",
        botId: context().botId,
        documents: [{ ...docs[0]!, revision: 3, content: "User prefers Node test runner." }, docs[1]!],
      },
      context(),
    );
    expect(calls.filter((call) => call.args[0] === "store")).toHaveLength(4);

    const manifest = JSON.parse(await readFile(path.join(dataDir, ".rakazo-index.json"), "utf8"));
    expect(manifest).toMatchObject({ schema: 1, mnemosyneVersion: "3.15.1" });
    expect(manifest).not.toHaveProperty("documents");
  });

  test("auto mode fails open while required mode surfaces an unavailable CLI", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "rakazo-mnemosyne-fallback-"));
    cleanups.push(async () => {
      const { rm } = await import("node:fs/promises");
      await rm(rootDir, { recursive: true, force: true });
    });
    const runner: MnemosyneCommandRunner = {
      async run() {
        throw new Error("ENOENT mnemosyne");
      },
    };
    const auto = new MnemosyneSemanticIndex({ rootDir, runner, mode: "auto" });
    await expect(
      auto.search({ query: "x", scope: "user", documents: docs }, context()),
    ).resolves.toEqual([]);

    const required = new MnemosyneSemanticIndex({ rootDir, runner, mode: "required" });
    await expect(
      required.search({ query: "x", scope: "user", documents: docs }, context()),
    ).rejects.toThrow(/Mnemosyne/i);
  });

  test("off mode never launches a child process", async () => {
    let calls = 0;
    const runner: MnemosyneCommandRunner = {
      async run() {
        calls += 1;
        return { stdout: "", stderr: "" };
      },
    };
    const index = new MnemosyneSemanticIndex({ rootDir: "/tmp/unused", runner, mode: "off" });
    await expect(
      index.search({ query: "x", scope: "user", documents: docs }, context()),
    ).resolves.toEqual([]);
    expect(calls).toBe(0);
  });
});
