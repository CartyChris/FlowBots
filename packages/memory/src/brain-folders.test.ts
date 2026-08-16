import { lstat, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import * as memory from "./index.js";

const temps: string[] = [];
afterEach(async () => {
  await Promise.all(temps.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

function required<T>(name: string): T | undefined {
  const value = (memory as Record<string, unknown>)[name];
  expect(value, `${name} must be exported by @rakazo/memory`).toBeDefined();
  return value as T | undefined;
}

describe("Markdown Brain Folders", () => {
  test("scans Markdown into cited heading chunks and searches lexically", async () => {
    const create = required<
      (roots: Array<{ name: string; path: string; writable: boolean }>) => {
        refresh(): Promise<void>;
        search(query: string, limit?: number): Promise<Array<{ text: string; sourcePath: string; heading: string }>>;
      }
    >("createBrainIndex");
    if (!create) return;
    const root = await mkdtemp(path.join(os.tmpdir(), "rakazo-brain-"));
    temps.push(root);
    await writeFile(
      path.join(root, "WORK.md"),
      "# Work\n\n## ScienceLogic\nObservability and AIOps notes for state government modernization.\n\n## Other\nUnrelated text.\n",
      "utf8",
    );
    const brain = create([{ name: "Work", path: root, writable: false }]);
    await brain.refresh();
    const hits = await brain.search("observability government", 5);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.heading).toBe("ScienceLogic");
    expect(hits[0]?.sourcePath).toBe(path.join(root, "WORK.md"));
    expect(hits[0]?.text).toContain("AIOps");
  });

  test("a proposed write is diff-first and does not mutate until applied", async () => {
    const propose = required<
      (input: { root: string; relativePath: string; content: string; frozenRoots?: string[] }) =>
        Promise<{ target: string; before: string; after: string; changed: boolean; apply(): Promise<void> }>
    >("proposeBrainWrite");
    if (!propose) return;
    const root = await mkdtemp(path.join(os.tmpdir(), "rakazo-brain-write-"));
    temps.push(root);
    const target = path.join(root, "GROWTH.md");
    await writeFile(target, "# Growth\n", "utf8");

    const proposal = await propose({
      root,
      relativePath: "GROWTH.md",
      content: "# Growth\n\n- Prefer executable verification before promotion.\n",
    });
    expect(proposal.changed).toBe(true);
    expect(proposal.before).toBe("# Growth\n");
    expect(proposal.after).toContain("executable verification");
    expect(await readFile(target, "utf8")).toBe("# Growth\n");
    await proposal.apply();
    expect(await readFile(target, "utf8")).toContain("executable verification");
  });

  test("rejects traversal and absolute-path escapes", async () => {
    const safe = required<(root: string, relativePath: string) => Promise<string>>("resolveBrainPath");
    if (!safe) return;
    const root = await mkdtemp(path.join(os.tmpdir(), "rakazo-brain-safe-"));
    temps.push(root);
    await expect(safe(root, "../../outside.md")).rejects.toThrow(/outside|escape|root/i);
    await expect(safe(root, path.resolve(root, "..", "outside.md"))).rejects.toThrow(/outside|escape|root/i);
    await expect(safe(root, "nested/note.md")).resolves.toBe(path.join(root, "nested", "note.md"));
  });

  test("rejects a symlink that escapes the selected brain root", async () => {
    if (process.platform === "win32") return;
    const safe = required<(root: string, relativePath: string) => Promise<string>>("resolveBrainPath");
    if (!safe) return;
    const root = await mkdtemp(path.join(os.tmpdir(), "rakazo-brain-link-"));
    const outside = await mkdtemp(path.join(os.tmpdir(), "rakazo-outside-"));
    temps.push(root, outside);
    await symlink(outside, path.join(root, "escape"), "dir");
    expect((await lstat(path.join(root, "escape"))).isSymbolicLink()).toBe(true);
    await expect(safe(root, "escape/secret.md")).rejects.toThrow(/symlink|outside|escape|root/i);
  });

  test("frozen eval roots can never be writable brain destinations", async () => {
    const propose = required<
      (input: { root: string; relativePath: string; content: string; frozenRoots?: string[] }) => Promise<unknown>
    >("proposeBrainWrite");
    if (!propose) return;
    const root = await mkdtemp(path.join(os.tmpdir(), "rakazo-frozen-"));
    temps.push(root);
    await expect(
      propose({ root, relativePath: "golden.md", content: "tamper", frozenRoots: [root] }),
    ).rejects.toThrow(/frozen|writable|protected/i);
  });
});
