import { lstat, mkdir, readdir, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";

export interface BrainRoot {
  name: string;
  path: string;
  writable: boolean;
}

export interface BrainChunk {
  rootName: string;
  sourcePath: string;
  relativePath: string;
  heading: string;
  text: string;
  score?: number;
}

export function createBrainIndex(roots: BrainRoot[]) {
  let chunks: BrainChunk[] = [];

  return {
    async refresh(): Promise<void> {
      const next: BrainChunk[] = [];
      for (const root of roots) {
        const canonicalRoot = await realpath(root.path);
        const files = await listMarkdownFiles(canonicalRoot);
        for (const file of files) {
          const content = await readFile(file, "utf8");
          next.push(...chunkMarkdown(root.name, canonicalRoot, file, content));
        }
      }
      chunks = next;
    },

    async search(query: string, limit = 8): Promise<Array<BrainChunk & { score: number }>> {
      const terms = tokenize(query);
      if (!terms.length) return [];
      return chunks
        .map((chunk) => ({ ...chunk, score: scoreChunk(chunk, terms) }))
        .filter((chunk) => chunk.score > 0)
        .sort((a, b) => b.score - a.score || a.sourcePath.localeCompare(b.sourcePath))
        .slice(0, Math.max(1, limit));
    },

    snapshot(): BrainChunk[] {
      return chunks.map((chunk) => ({ ...chunk }));
    },
  };
}

async function listMarkdownFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  const visit = async (dir: string) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) await visit(full);
      else if (entry.isFile() && /\.md$/i.test(entry.name)) files.push(full);
    }
  };
  await visit(root);
  files.sort();
  return files;
}

function chunkMarkdown(
  rootName: string,
  root: string,
  file: string,
  content: string,
): BrainChunk[] {
  const relativePath = path.relative(root, file);
  const lines = content.split(/\r?\n/);
  const out: BrainChunk[] = [];
  let heading = path.basename(file, path.extname(file));
  let body: string[] = [];

  const flush = () => {
    const text = body.join("\n").trim();
    if (text) out.push({ rootName, sourcePath: file, relativePath, heading, text });
    body = [];
  };

  for (const line of lines) {
    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (match) {
      flush();
      heading = match[2]!.trim();
    } else {
      body.push(line);
    }
  }
  flush();
  return out;
}

function tokenize(value: string): string[] {
  return [...new Set(value.toLowerCase().match(/[\p{L}\p{N}_-]+/gu) ?? [])].filter(
    (term) => term.length > 1,
  );
}

function scoreChunk(chunk: BrainChunk, terms: string[]): number {
  const heading = chunk.heading.toLowerCase();
  const text = chunk.text.toLowerCase();
  const pathText = chunk.relativePath.toLowerCase();
  let score = 0;
  for (const term of terms) {
    if (heading.includes(term)) score += 5;
    if (pathText.includes(term)) score += 3;
    let at = text.indexOf(term);
    while (at >= 0) {
      score += 1;
      at = text.indexOf(term, at + term.length);
    }
  }
  return score;
}

export async function resolveBrainPath(root: string, relativePath: string): Promise<string> {
  if (!relativePath || path.isAbsolute(relativePath)) {
    throw new Error("brain path must be relative to the selected root");
  }
  const canonicalRoot = await realpath(root);
  const candidate = path.resolve(canonicalRoot, relativePath);
  assertInside(canonicalRoot, candidate, "path escapes the selected brain root");

  const segments = path.relative(canonicalRoot, candidate).split(path.sep).filter(Boolean);
  let current = canonicalRoot;
  for (const segment of segments) {
    current = path.join(current, segment);
    try {
      const stat = await lstat(current);
      if (stat.isSymbolicLink()) {
        const target = await realpath(current);
        assertInside(canonicalRoot, target, "symlink escapes the selected brain root");
        current = target;
      }
    } catch (error: any) {
      if (error?.code === "ENOENT") break;
      throw error;
    }
  }

  return candidate;
}

function assertInside(root: string, target: string, message: string) {
  const base = path.resolve(root);
  const resolved = path.resolve(target);
  if (resolved !== base && !resolved.startsWith(`${base}${path.sep}`)) throw new Error(message);
}

async function canonicalOrResolved(value: string): Promise<string> {
  return realpath(value).catch(() => path.resolve(value));
}

async function assertWritableRootNotFrozen(root: string, frozenRoots: string[]) {
  const canonicalRoot = await canonicalOrResolved(root);
  for (const frozen of frozenRoots) {
    const canonicalFrozen = await canonicalOrResolved(frozen);
    if (
      canonicalRoot === canonicalFrozen ||
      canonicalRoot.startsWith(`${canonicalFrozen}${path.sep}`) ||
      canonicalFrozen.startsWith(`${canonicalRoot}${path.sep}`)
    ) {
      throw new Error("frozen evaluation/safety roots are protected and cannot be writable");
    }
  }
}

export async function proposeBrainWrite(input: {
  root: string;
  relativePath: string;
  content: string;
  frozenRoots?: string[];
}): Promise<{
  target: string;
  before: string;
  after: string;
  changed: boolean;
  apply(): Promise<void>;
}> {
  await assertWritableRootNotFrozen(input.root, input.frozenRoots ?? []);
  const target = await resolveBrainPath(input.root, input.relativePath);
  const before = await readFile(target, "utf8").catch((error: any) => {
    if (error?.code === "ENOENT") return "";
    throw error;
  });
  const after = String(input.content);
  const changed = before !== after;

  return {
    target,
    before,
    after,
    changed,
    async apply() {
      // Re-resolve immediately before the mutation so a symlink swap between proposal and
      // approval cannot turn an approved in-root write into an escape.
      const safeTarget = await resolveBrainPath(input.root, input.relativePath);
      if (safeTarget !== target) throw new Error("brain target changed after approval");
      await assertWritableRootNotFrozen(input.root, input.frozenRoots ?? []);
      await mkdir(path.dirname(safeTarget), { recursive: true });
      await writeFile(safeTarget, after, "utf8");
    },
  };
}
