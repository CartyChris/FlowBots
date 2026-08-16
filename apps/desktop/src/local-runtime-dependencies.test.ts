import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

const REQUIRED_LOCAL_RUNTIME_EXTERNALS = [
  "@composio/core",
  "@e2b/desktop",
  "@earendil-works/pi-agent-core",
  "@earendil-works/pi-ai",
  "@electric-sql/pglite",
  "@electric-sql/pglite-socket",
  "@hono/node-server",
  "@orpc/contract",
  "@orpc/server",
  "@prisma/adapter-pg",
  "@prisma/client",
  "better-auth",
  "graphile-worker",
  "hono",
  "pg",
  "zod",
] as const;

describe("desktop LocalRuntime dependency boundary", () => {
  test("declares every generated third-party external as a direct desktop dependency", () => {
    const packageJson = JSON.parse(
      readFileSync(path.join(import.meta.dirname, "..", "package.json"), "utf8"),
    ) as { dependencies?: Record<string, string> };
    const dependencies = packageJson.dependencies ?? {};

    expect(REQUIRED_LOCAL_RUNTIME_EXTERNALS.filter((name) => !dependencies[name])).toEqual([]);
  });
});
