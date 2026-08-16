import type {
  AdapterContext,
  MemoryCommitRequest,
  MemoryReadRequest,
  MemorySearchRequest,
  MemoryStore,
  PortableFile,
} from "@rakazo/adapter-kit";
import { describe, expect, test, vi } from "vitest";
import { HybridMemoryStore } from "./hybrid-memory.js";
import type { MnemosyneSemanticIndex } from "./mnemosyne.js";

function context(): AdapterContext {
  return {
    operationId: "op",
    traceId: "trace",
    workspaceId: "workspace",
    userId: "user",
    botId: "bot-1",
    signal: new AbortController().signal,
  };
}

function primaryStore() {
  const read = vi.fn(async (request: MemoryReadRequest) => ({
    documents:
      request.scope === "bot"
        ? [{ id: "b1", path: "BOT.md", content: "Bot likes Rust.", revision: 3 }]
        : [{ id: "u1", path: "PREFS.md", content: "User likes Vitest.", revision: 2 }],
  }));
  const search = vi.fn(async (_request: MemorySearchRequest) => [
    { path: "PREFS.md", snippet: "lexical preference", score: 1 },
  ]);
  const commit = vi.fn(async (request: MemoryCommitRequest) => ({
    id: "u1",
    path: request.path,
    revision: 4,
    content: request.content,
  }));
  const imported = { id: "import", path: "import.md", revision: 1, content: "imported" };

  const store: MemoryStore = {
    describe: () => ({
      id: "markdown",
      contractVersion: "1",
      adapterVersion: "0.1.0",
      capabilities: { search: true, revisions: true, markdownPortable: true },
    }),
    read,
    search,
    commit,
    async *exportMarkdown() {
      yield { path: "PREFS.md", content: new TextEncoder().encode("User likes Vitest.") };
    },
    async importMarkdown(_files: AsyncIterable<PortableFile>) {
      return imported;
    },
  };
  return { store, read, search, commit, imported };
}

function semanticIndex() {
  const search = vi.fn(async (request: { scope: "bot" | "user" }) =>
    request.scope === "bot"
      ? [{ path: "BOT.md", snippet: "semantic bot", score: 0.95 }]
      : [
          { path: "PREFS.md", snippet: "semantic duplicate", score: 0.82 },
          { path: "PROJECT.md", snippet: "semantic project", score: 0.91 },
        ],
  );
  return { search } as unknown as Pick<MnemosyneSemanticIndex, "search"> & {
    search: typeof search;
  };
}

describe("HybridMemoryStore", () => {
  test("keeps Markdown authoritative for read and commit", async () => {
    const primary = primaryStore();
    const semantic = semanticIndex();
    const memory = new HybridMemoryStore(primary.store, semantic);
    const ctx = context();

    const readRequest: MemoryReadRequest = { scope: "user", path: "PREFS.md" };
    await expect(memory.read(readRequest, ctx)).resolves.toEqual({
      documents: [expect.objectContaining({ path: "PREFS.md", revision: 2 })],
    });
    expect(primary.read).toHaveBeenCalledWith(readRequest, ctx);

    const commitRequest: MemoryCommitRequest = {
      scope: "user",
      path: "PREFS.md",
      content: "updated",
    };
    await expect(memory.commit(commitRequest, ctx)).resolves.toMatchObject({
      path: "PREFS.md",
      content: "updated",
    });
    expect(primary.commit).toHaveBeenCalledWith(commitRequest, ctx);
    expect(semantic.search).not.toHaveBeenCalled();
  });

  test("merges semantic recall with lexical search and deduplicates canonical paths", async () => {
    const primary = primaryStore();
    const semantic = semanticIndex();
    const memory = new HybridMemoryStore(primary.store, semantic);

    const results = await memory.search({ query: "testing tools", scope: "user" }, context());
    expect(results.map((result) => result.path)).toEqual(["PREFS.md", "PROJECT.md"]);
    expect(results.filter((result) => result.path === "PREFS.md")).toHaveLength(1);
    expect(results.find((result) => result.path === "PREFS.md")).toMatchObject({
      snippet: "lexical preference",
      score: 1,
    });
    expect(semantic.search).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "testing tools",
        scope: "user",
        documents: [expect.objectContaining({ path: "PREFS.md" })],
      }),
      expect.any(Object),
    );
  });

  test("all scope with a bot searches isolated user and bot semantic indexes", async () => {
    const primary = primaryStore();
    const semantic = semanticIndex();
    const memory = new HybridMemoryStore(primary.store, semantic);

    const results = await memory.search(
      { query: "preferences", scope: "all", botId: "bot-1" },
      context(),
    );
    expect(semantic.search).toHaveBeenCalledTimes(2);
    expect(semantic.search).toHaveBeenCalledWith(
      expect.objectContaining({ scope: "user", documents: [expect.objectContaining({ path: "PREFS.md" })] }),
      expect.any(Object),
    );
    expect(semantic.search).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: "bot",
        botId: "bot-1",
        documents: [expect.objectContaining({ path: "BOT.md" })],
      }),
      expect.any(Object),
    );
    expect(results.map((result) => result.path)).toEqual(["PREFS.md", "BOT.md", "PROJECT.md"]);
  });

  test("all scope without a bot preserves broad lexical behavior instead of guessing semantic scope", async () => {
    const primary = primaryStore();
    const semantic = semanticIndex();
    const memory = new HybridMemoryStore(primary.store, semantic);
    await expect(memory.search({ query: "anything", scope: "all" }, context())).resolves.toEqual([
      { path: "PREFS.md", snippet: "lexical preference", score: 1 },
    ]);
    expect(semantic.search).not.toHaveBeenCalled();
  });

  test("delegates Markdown export/import without semantic side effects", async () => {
    const primary = primaryStore();
    const semantic = semanticIndex();
    const memory = new HybridMemoryStore(primary.store, semantic);
    const exported: PortableFile[] = [];
    for await (const file of memory.exportMarkdown({ scope: "user" }, context())) exported.push(file);
    expect(exported.map((file) => file.path)).toEqual(["PREFS.md"]);

    async function* files() {
      yield { path: "import.md", content: new TextEncoder().encode("imported") };
    }
    await expect(memory.importMarkdown(files(), context())).resolves.toEqual(primary.imported);
    expect(semantic.search).not.toHaveBeenCalled();
  });
});