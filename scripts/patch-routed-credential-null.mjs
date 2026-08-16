import { readFile, writeFile } from "node:fs/promises";

const file = "packages/adapters/src/executor.ts";
const before = "const resolved = await resolveModelKey(deps, run.userId, run.workspaceId, credential);";
const after = `const resolved = await resolveModelKey(\n          deps,\n          run.userId,\n          run.workspaceId,\n          credential ?? null,\n        );`;
const source = await readFile(file, "utf8");
const first = source.indexOf(before);
const second = first < 0 ? -1 : source.indexOf(before, first + before.length);
if (first < 0 || second >= 0) {
  throw new Error(`Expected exactly one resolveModelKey anchor; first=${first}, second=${second}`);
}
await writeFile(file, source.slice(0, first) + after + source.slice(first + before.length));
console.log("Applied routed credential null-normalization patch.");
