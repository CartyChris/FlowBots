import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";

const src = import.meta.dirname;

describe("external research provider wiring", () => {
  test("Pi runtime resolves external models and provider-specific environment keys", async () => {
    const source = await readFile(path.join(src, "pi-runtime.ts"), "utf8");
    expect(source).toContain("externalRuntimeModel");
    expect(source).toContain("externalStreamSimple");
    expect(source).toContain("providerEnvironmentApiKey(provider)");
  });

  test("executor chooses from connected model credentials using the research route policy", async () => {
    const source = await readFile(path.join(src, "executor.ts"), "utf8");
    expect(source).toContain("orderedResearchCredentials");
    expect(source).toContain("isG0dm0d3Reachable");
    expect(source).toMatch(/userModelCredential\.findMany/);
    expect(source).toContain("selectRunModelCredential");
  });
});
