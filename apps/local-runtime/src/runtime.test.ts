import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import * as localRuntime from "./index.js";

const temps: string[] = [];
afterEach(async () => {
  await Promise.all(temps.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

type Start = (input: {
  dataDir: string;
  migrationsDir: string;
  webDir?: string;
  port?: number;
  mnemosyneMode?: "auto" | "off" | "required";
  mnemosyneCommand?: string;
  mnemosyneTimeoutMs?: number;
}) => Promise<{
  origin: string;
  prisma: {
    $executeRawUnsafe(query: string): Promise<unknown>;
    $queryRawUnsafe<T = unknown>(query: string): Promise<T>;
  };
  stop(): Promise<void>;
}>;

function requiredStart(): Start | undefined {
  const value = (localRuntime as Record<string, unknown>).startLocalRuntime;
  expect(typeof value, "startLocalRuntime must be exported by @rakazo/local-runtime").toBe("function");
  return typeof value === "function" ? (value as Start) : undefined;
}

function migrationsDir() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
  return path.join(repoRoot, "packages/db/prisma/migrations");
}

describe("embedded Rakazo LocalRuntime", () => {
  test("starts without ambient server configuration, reports Lite topology and hybrid memory, and persists across restart", async () => {
    const start = requiredStart();
    if (!start) return;

    const dataDir = await mkdtemp(path.join(os.tmpdir(), "rakazo-lite-"));
    temps.push(dataDir);
    const previousDatabaseUrl = process.env.DATABASE_URL;
    const previousAuth = process.env.BETTER_AUTH_SECRET;
    const previousMnemosynePath = process.env.MNEMOSYNE_COMMAND;
    delete process.env.DATABASE_URL;
    delete process.env.BETTER_AUTH_SECRET;
    // The default embedded app must remain bootable even when Mnemosyne/Python is absent.
    process.env.MNEMOSYNE_COMMAND = path.join(dataDir, "definitely-not-installed-mnemosyne");

    let first: Awaited<ReturnType<Start>> | undefined;
    let second: Awaited<ReturnType<Start>> | undefined;
    try {
      first = await start({ dataDir, migrationsDir: migrationsDir(), port: 0 });
      expect(new URL(first.origin).hostname).toBe("127.0.0.1");
      const health = await fetch(`${first.origin}/health`).then((response) => response.json());
      expect(health).toMatchObject({
        ok: true,
        sandbox: "desktop",
        jobs: "memory",
        realtime: "memory",
        memory: "markdown+mnemosyne",
        mnemosyne: "auto",
      });

      await first.prisma.$executeRawUnsafe(
        'CREATE TABLE IF NOT EXISTS "_rakazo_lite_probe" ("value" TEXT PRIMARY KEY)',
      );
      await first.prisma.$executeRawUnsafe(
        `INSERT INTO "_rakazo_lite_probe" ("value") VALUES ('survives-restart') ON CONFLICT DO NOTHING`,
      );
      await first.stop();
      first = undefined;

      second = await start({
        dataDir,
        migrationsDir: migrationsDir(),
        port: 0,
        mnemosyneMode: "off",
        mnemosyneCommand: "/opt/custom/mnemosyne",
        mnemosyneTimeoutMs: 6789,
      });
      const secondHealth = await fetch(`${second.origin}/health`).then((response) => response.json());
      expect(secondHealth).toMatchObject({ memory: "markdown+mnemosyne", mnemosyne: "off" });
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
      if (previousMnemosynePath === undefined) delete process.env.MNEMOSYNE_COMMAND;
      else process.env.MNEMOSYNE_COMMAND = previousMnemosynePath;
    }
  }, 60_000);

  test("serves the built web UI and SPA routes without masking API failures", async () => {
    const start = requiredStart();
    if (!start) return;
    const dataDir = await mkdtemp(path.join(os.tmpdir(), "rakazo-lite-web-data-"));
    const webDir = await mkdtemp(path.join(os.tmpdir(), "rakazo-lite-web-"));
    temps.push(dataDir, webDir);
    await mkdir(path.join(webDir, "assets"), { recursive: true });
    await writeFile(path.join(webDir, "index.html"), "<!doctype html><div id=app>RAKAZO_LITE_UI</div>", "utf8");
    await writeFile(path.join(webDir, "assets", "app.js"), "globalThis.RAKAZO_ASSET=true;", "utf8");

    const runtime = await start({ dataDir, migrationsDir: migrationsDir(), webDir, port: 0 });
    try {
      const home = await fetch(`${runtime.origin}/`);
      expect(home.status).toBe(200);
      expect(home.headers.get("content-type")).toContain("text/html");
      expect(await home.text()).toContain("RAKAZO_LITE_UI");

      const asset = await fetch(`${runtime.origin}/assets/app.js`);
      expect(asset.status).toBe(200);
      expect(asset.headers.get("content-type")).toContain("javascript");
      expect(await asset.text()).toContain("RAKAZO_ASSET");

      const spa = await fetch(`${runtime.origin}/bots/example`);
      expect(spa.status).toBe(200);
      expect(await spa.text()).toContain("RAKAZO_LITE_UI");

      const apiMiss = await fetch(`${runtime.origin}/api/definitely-not-a-ui-route`);
      expect(apiMiss.status).toBe(404);
      expect(await apiMiss.text()).not.toContain("RAKAZO_LITE_UI");
    } finally {
      await runtime.stop();
    }
  }, 60_000);
});