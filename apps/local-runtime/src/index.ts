import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import type { Server } from "node:http";
import { createServer as createNetServer } from "node:net";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { serve } from "@hono/node-server";
import { createApp } from "@rakazo/api/app";
import { createDbFromPool, type PrismaClient } from "@rakazo/db";
import { Pool } from "pg";

export interface StartLocalRuntimeOptions {
  dataDir: string;
  migrationsDir: string;
  webDir?: string;
  port?: number;
  openRouterKey?: string;
  defaultProvider?: string;
  defaultModel?: string;
  mnemosyneMode?: "auto" | "off" | "required";
  mnemosyneCommand?: string;
  mnemosyneTimeoutMs?: number;
}

export interface LocalRuntimeHandle {
  origin: string;
  prisma: PrismaClient;
  stop(): Promise<void>;
}

interface LocalSecrets {
  authSecret: string;
  encryptionKey: string;
  supervisorToken: string;
}

export async function startLocalRuntime(
  options: StartLocalRuntimeOptions,
): Promise<LocalRuntimeHandle> {
  const dataDir = path.resolve(options.dataDir);
  const migrationsDir = path.resolve(options.migrationsDir);
  const webDir = options.webDir ? path.resolve(options.webDir) : undefined;
  await mkdir(dataDir, { recursive: true });

  const secrets = await loadOrCreateSecrets(path.join(dataDir, "local-runtime-secrets.json"));
  const pgDataDir = path.join(dataDir, "pgdata");
  const embedded = await PGlite.create(pgDataDir);
  let socket: PGLiteSocketServer | undefined;
  let pool: Pool | undefined;
  let handles: Awaited<ReturnType<typeof createApp>> | undefined;
  let httpServer: Server | undefined;
  let stopped = false;

  try {
    await applyLiteMigrations(embedded, migrationsDir);

    const pgPortPromise = new Promise<number>((resolve, reject) => {
      const onListening = (event: Event) => {
        const detail = (event as CustomEvent<{ port?: number; host?: string }>).detail;
        if (!detail?.port) reject(new Error("PGlite socket started without an assigned port"));
        else resolve(detail.port);
      };
      socket = new PGLiteSocketServer({ db: embedded, host: "127.0.0.1", port: 0 });
      socket.addEventListener("listening", onListening, { once: true });
      socket.addEventListener(
        "error",
        (event) => reject((event as CustomEvent<Error>).detail ?? new Error("PGlite socket failed")),
        { once: true },
      );
    });
    await socket!.start();
    const pgPort = await pgPortPromise;

    pool = new Pool({
      host: "127.0.0.1",
      port: pgPort,
      database: "postgres",
      user: "postgres",
      ssl: false,
      max: 1,
      min: 0,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
    pool.on("error", () => undefined);
    const { prisma } = createDbFromPool(pool);

    const httpPort = options.port && options.port > 0 ? options.port : await reserveLoopbackPort();
    const origin = `http://127.0.0.1:${httpPort}`;
    const databaseUrl = `postgres://postgres@127.0.0.1:${pgPort}/postgres?sslmode=disable`;

    handles = await createApp({
      prisma,
      databaseUrl,
      realtimeDatabaseUrl: databaseUrl,
      authSecret: secrets.authSecret,
      authUrl: origin,
      webOrigin: origin,
      apiUrl: origin,
      signupsEnabled: "true",
      signupAllowlist: undefined,
      encryptionKey: secrets.encryptionKey,
      dataDir,
      sandboxSupervisorUrl: "http://127.0.0.1:7091",
      sandboxSupervisorToken: secrets.supervisorToken,
      sandboxProvider: "desktop",
      agentRuntime: "pi",
      openRouterKey: options.openRouterKey,
      e2bApiKey: undefined,
      composioApiKey: undefined,
      defaultProvider: options.defaultProvider ?? "openrouter",
      defaultModel: options.defaultModel ?? "deepseek/deepseek-v4-flash-0731",
      wakeupDriver: "memory",
      mnemosyneMode: options.mnemosyneMode ?? "auto",
      mnemosyneCommand: options.mnemosyneCommand ?? process.env.MNEMOSYNE_COMMAND ?? "mnemosyne",
      mnemosyneTimeoutMs: options.mnemosyneTimeoutMs ?? 5000,
      port: httpPort,
    });

    const apiFetch = handles.app.fetch.bind(handles.app);
    const runtimeFetch = webDir ? createWebFallback(apiFetch, webDir) : apiFetch;
    httpServer = serve({
      fetch: runtimeFetch,
      hostname: "127.0.0.1",
      port: httpPort,
    }) as Server;
    await waitForListening(httpServer);

    return {
      origin,
      prisma,
      async stop() {
        if (stopped) return;
        stopped = true;
        await closeHttpServer(httpServer);
        await handles?.stop().catch(() => undefined);
        // createApp receives an externally-owned Prisma/pool, so its stop disconnects Prisma
        // but deliberately does not end this pool.
        await pool?.end().catch(() => undefined);
        await socket?.stop().catch(() => undefined);
        await embedded.close().catch(() => undefined);
      },
    };
  } catch (error) {
    await closeHttpServer(httpServer).catch(() => undefined);
    await handles?.stop().catch(() => undefined);
    await pool?.end().catch(() => undefined);
    await socket?.stop().catch(() => undefined);
    await embedded.close().catch(() => undefined);
    throw error;
  }
}

export async function applyLiteMigrations(db: PGlite, migrationsDir: string): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS "_rakazo_lite_migrations" (
      "id" TEXT PRIMARY KEY,
      "checksum" TEXT NOT NULL,
      "applied_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const entries = (await readdir(migrationsDir, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && /^\d+/.test(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    const sqlPath = path.join(migrationsDir, entry.name, "migration.sql");
    const sql = await readFile(sqlPath, "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    const existing = await db.query<{ checksum: string }>(
      'SELECT "checksum" FROM "_rakazo_lite_migrations" WHERE "id" = $1',
      [entry.name],
    );
    const prior = existing.rows[0];
    if (prior) {
      if (prior.checksum !== checksum) {
        throw new Error(
          `Lite migration ${entry.name} changed after application; refusing to run against a mutated migration history`,
        );
      }
      continue;
    }

    await db.exec("BEGIN");
    try {
      await db.exec(sql);
      await db.query(
        'INSERT INTO "_rakazo_lite_migrations" ("id", "checksum") VALUES ($1, $2)',
        [entry.name, checksum],
      );
      await db.exec("COMMIT");
    } catch (error) {
      await db.exec("ROLLBACK").catch(() => undefined);
      throw new Error(`Lite migration ${entry.name} failed`, { cause: error });
    }
  }
}

function createWebFallback(
  apiFetch: (request: Request) => Response | Promise<Response>,
  webDir: string,
): (request: Request) => Promise<Response> {
  const root = path.resolve(webDir);
  return async (request) => {
    const apiResponse = await apiFetch(request);
    if (apiResponse.status !== 404) return apiResponse;
    if (request.method !== "GET" && request.method !== "HEAD") return apiResponse;

    const url = new URL(request.url);
    if (isProtectedRuntimePath(url.pathname)) return apiResponse;

    let decoded: string;
    try {
      decoded = decodeURIComponent(url.pathname);
    } catch {
      return apiResponse;
    }
    if (decoded.includes("\0")) return apiResponse;

    const relative = decoded.replace(/^\/+/, "");
    const candidate = path.resolve(root, relative || "index.html");
    if (!isInside(root, candidate)) return apiResponse;

    const direct = await regularFile(candidate);
    if (direct)
      return fileResponse(direct, request.method === "HEAD", decoded.startsWith("/assets/"));

    // Missing asset-like paths should remain honest 404s. Only application routes fall
    // back to index.html so client-side routing works.
    if (decoded.startsWith("/assets/") || path.extname(decoded)) return apiResponse;
    const index = await regularFile(path.join(root, "index.html"));
    if (!index) return apiResponse;
    return fileResponse(index, request.method === "HEAD", false);
  };
}

function isProtectedRuntimePath(pathname: string): boolean {
  return ["/api", "/rpc", "/health", "/novnc"].some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function isInside(root: string, target: string): boolean {
  return target === root || target.startsWith(`${root}${path.sep}`);
}

async function regularFile(file: string): Promise<string | undefined> {
  try {
    return (await stat(file)).isFile() ? file : undefined;
  } catch (error: any) {
    if (error?.code === "ENOENT" || error?.code === "ENOTDIR") return undefined;
    throw error;
  }
}

async function fileResponse(file: string, head: boolean, immutable: boolean): Promise<Response> {
  const body = head ? null : await readFile(file);
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": mimeType(file),
      "cache-control": immutable ? "public, max-age=31536000, immutable" : "no-cache",
      "x-content-type-options": "nosniff",
    },
  });
}

function mimeType(file: string): string {
  switch (path.extname(file).toLowerCase()) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
    case ".mjs":
      return "text/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".json":
    case ".map":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".ico":
      return "image/x-icon";
    case ".woff":
      return "font/woff";
    case ".woff2":
      return "font/woff2";
    default:
      return "application/octet-stream";
  }
}

async function loadOrCreateSecrets(file: string): Promise<LocalSecrets> {
  try {
    return validateSecrets(JSON.parse(await readFile(file, "utf8")));
  } catch (error: any) {
    if (error?.code !== "ENOENT") throw error;
  }

  const created: LocalSecrets = {
    authSecret: randomBytes(48).toString("base64url"),
    encryptionKey: randomBytes(32).toString("hex"),
    supervisorToken: randomBytes(32).toString("hex"),
  };
  await mkdir(path.dirname(file), { recursive: true });
  try {
    await writeFile(file, `${JSON.stringify(created, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    return created;
  } catch (error: any) {
    if (error?.code !== "EEXIST") throw error;
    return validateSecrets(JSON.parse(await readFile(file, "utf8")));
  }
}

function validateSecrets(value: unknown): LocalSecrets {
  if (!value || typeof value !== "object") throw new Error("Invalid LocalRuntime secrets file");
  const row = value as Record<string, unknown>;
  for (const key of ["authSecret", "encryptionKey", "supervisorToken"] as const) {
    if (typeof row[key] !== "string" || row[key].length < 32) {
      throw new Error(`Invalid LocalRuntime secret ${key}`);
    }
  }
  return row as unknown as LocalSecrets;
}

function reserveLoopbackPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createNetServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not reserve a LocalRuntime port"));
        return;
      }
      const port = address.port;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

function waitForListening(server: Server): Promise<void> {
  if (server.listening) return Promise.resolve();
  return new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
}

function closeHttpServer(server?: Server): Promise<void> {
  if (!server || !server.listening) return Promise.resolve();
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}