import { readFile, writeFile } from "node:fs/promises";

const file = "packages/adapters/src/executor.ts";
let source = await readFile(file, "utf8");

function replaceOnce(before, after) {
  const first = source.indexOf(before);
  const second = first < 0 ? -1 : source.indexOf(before, first + before.length);
  if (first < 0 || second >= 0) {
    throw new Error(`Expected exactly one anchor; first=${first}, second=${second}: ${before.slice(0, 80)}`);
  }
  source = source.slice(0, first) + after + source.slice(first + before.length);
}

replaceOnce(
  'import type {\n  ActivityEvent,',
  'import { routineWakeupJob, type JobPublisher } from "@rakazo/adapter-kit";\nimport type {\n  ActivityEvent,',
);

replaceOnce(
  'const GRAPHICAL_AGENT_TOOLS = new Set(["computer"]);\n\nasync function selectRunModelCredential',
  `const GRAPHICAL_AGENT_TOOLS = new Set(["computer"]);\n\nexport async function deferFutureRoutine(\n  jobs: JobPublisher,\n  routineId: string,\n  scheduledAt: Date,\n): Promise<boolean> {\n  if (!routineId.trim()) throw new Error("routineId is required");\n  const timestamp = scheduledAt.getTime();\n  if (!Number.isFinite(timestamp) || timestamp <= Date.now()) return false;\n  await jobs.enqueue(routineWakeupJob(routineId, scheduledAt));\n  return true;\n}\n\nasync function selectRunModelCredential`,
);

await writeFile(file, source);
console.log("Routine scheduling helper wired into executor.ts");
