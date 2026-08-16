import { readFile, writeFile } from "node:fs/promises";

const file = "packages/adapters/src/pi-runtime.ts";
let source = await readFile(file, "utf8");

function replaceOnce(before, after) {
  const first = source.indexOf(before);
  const second = first < 0 ? -1 : source.indexOf(before, first + before.length);
  if (first < 0 || second >= 0) {
    throw new Error(`Expected exactly one patch anchor; first=${first}, second=${second}: ${before.slice(0, 80)}`);
  }
  source = source.slice(0, first) + after + source.slice(first + before.length);
}

replaceOnce(
  "  providerEnvironmentApiKey,\n  VENICE_PROVIDER_ID,",
  "  providerEnvironmentApiKey,\n  providerHistoryLimit,\n  VENICE_PROVIDER_ID,",
);
replaceOnce(
  "        const history = toHistory(request.history, request.prompt);",
  `        const fullHistory = toHistory(request.history, request.prompt);\n        const historyLimit = providerHistoryLimit(provider);\n        const history =\n          historyLimit === undefined ? fullHistory : fullHistory.slice(-historyLimit);`,
);

await writeFile(file, source);
console.log("Applied bounded G0DM0D3 history window to Pi runtime.");
