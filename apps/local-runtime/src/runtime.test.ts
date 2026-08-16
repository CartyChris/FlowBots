import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import * as localRuntime from "./index.js";

const temps: string[] = [];
afterEach(async () => {
  await Promise.all(temps.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

function requiredStart():
  | ((input: { dataDir: string; migrationsDir: string; port?: number }) => Promise<{
      origin: string;
      prisma: {
        $executeRawUnsafe(query: string): Promise<unknown>;
        $queryRawUnsafe<T = unknown>(query: string): Promise<T>;
      };
      stop(): Promise<void>;
    }>)
  | undefined {
  const value = (localRuntime as Record<string, unknown>).startLocalRuntime;
  expect(typeof value, "startLocalRuntime must be exported by @rakazo/local-runtime").toBe("function");
  return typeof value === "function" ? (value as any) : undefined;
}

describe("embedded Rakazo LocalRuntime", () => {
  test("starts without ambient server configuration, reports Lite topology, and persists across restart", async () => {
    const start = requiredStart();
    if (!start) return;

    const dataDir = await mkdtemp(path.join(os.tmpdir(), "rakazo-lite-"));
    temps.push(dataDir);
    const migrationsDir = path.resolve(process.cwd(), "packages/db/prisma/migrations");
    const previousDatabaseUrl = process.env.DATABASE_URL;
    const previousAuth = process.env.BETTER_AUTH_SECRET;
    delete process.env.DATABASE_URL;
    delete process.env.BETTER_AUTH_SECRET;

    let first: Awaited<ReturnType<typeof start>> | undefined;
    let second: Awaited<ReturnType<typeof start>> | undefined;
    try {
      first = await start({ dataDir, migrationsDir, port: 0 });
      expect(new URL(first.origin).hostname).toBe("127.0.0.1");
      const health = await fetch(`${first.origin}/health`).then((response) => response.json());
      expect(health).toMatchObject({ ok: true, sandbox: "desktop", jobs: "memory", realtime: "memory" });

      await first.prisma.$executeRawUnsafe(
        'CREATE TABLE IF NOT EXISTS "_rakazo_lite_probe" ("value" TEXT PRIMARY KEY)',
      );
      await first.prisma.$executeRawUnsafe(
        `INSERT INTO "_rakazo_lite_probe" ("value") VALUES ('survives-restart') ON CONFLICT DO NOTHING`,
      );
      await first.stop();
      first = undefined;

      second = await start({ dataDir, migrationsDir, port: 0 });
      const rows = await second.prisma.$queryRawUnsafe<Array<{ value: string }>>(
        'SELECT "value" FROM "_rakazo_lite_probe"',
      );
      expect(rows).toEqual([{ value: "survives-restart" }]);
    } finally {
      await first?.stop().catch(() => undefined);
      await second?.stop().catch(() => undefined);
      if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previousDatabaseUrl;
      if (previousAuth === undefined) delete process.env.BETTER_AUTH_SECRET;
      else process.env.BETTER_AUTH_SECRET = previousAuth;
    }
  }, 60_000);
});
