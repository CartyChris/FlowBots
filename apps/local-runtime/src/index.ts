import { createServer, type Server } from "node:http";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { createApp } from "@rakazo/api/app";
import { loadEnv } from "@rakazo/api/env";
import { createAuth } from "@rakazo/auth";
import { createMemoryStore } from "@rakazo/memory";
import { createWorker } from "@rakazo/worker";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { type PrismaClient, createPrismaClient } from "@rakazo/db";
import { createLocalRuntimeDeps } from "./runtime-deps.js";

export type LocalRuntimeHandle = {
  origin: string;
  stop(): Promise<void>;
};

export type StartLocalRuntimeOptions = {
  dataDir: string;
  port?: number;
};

export async function startLocalRuntime(options: StartLocalRuntimeOptions): Promise<LocalRuntimeHandle> {
  const dataDir = path.resolve(options.dataDir);
  await mkdir(dataDir, { recursive: true });
  const databaseUrl = `file:${path.join(dataDir, "flowbots.sqlite")}`;
  const prisma = createPrismaClient(databaseUrl);
  let server: Server | undefined;
  let worker: Awaited<ReturnType<typeof createWorker>> | undefined;

  try {
    await ensureLocalSchema(prisma);
    const env = loadEnv(process.env, {
      databaseUrl,
      webOrigin: "http://127.0.0.1",
      sandboxProvider: "desktop",
    });
    const runtime = await createLocalRuntimeDeps({ prisma, dataDir, env });
    const auth = createAuth({
      prisma,
      baseURL: env.authUrl,
      secret: env.authSecret,
    });
    const memory = createMemoryStore({ prisma });
    worker = await createWorker({
      prisma,
      events: runtime.events,
      runtime: runtime.agentRuntime,
      sandbox: runtime.sandbox,
      memory,
      home: runtime.home,
      connector: runtime.connector,
      secrets: runtime.secrets,
      secretStore: runtime.secretStore,
      dataDir,
      jobs: runtime.jobs,
    });
    const app = createApp({
      prisma,
      auth,
      events: runtime.events,
      jobs: runtime.jobs,
      sandbox: runtime.sandbox,
      memory,
      home: runtime.home,
      secrets: runtime.secretStore,
      oauthLogins: runtime.oauthLogins,
      composio: runtime.composio,
      dataDir,
      env,
    });
    const host = new Hono();
    host.route("/", app);
    const port = options.port ?? (await reservePort());
    server = serve({ fetch: host.fetch, hostname: "127.0.0.1", port });
    await waitForListening(server);
    const origin = `http://127.0.0.1:${port}`;

    return {
      origin,
      async stop() {
        await worker?.stop();
        await closeHttpServer(server);
        await prisma.$disconnect();
      },
    };
  } catch (error) {
    await worker?.stop().catch(() => undefined);
    await closeHttpServer(server).catch(() => undefined);
    await prisma.$disconnect().catch(() => undefined);
    throw error;
  }
}

async function ensureLocalSchema(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "LocalRuntimeMetadata" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

function reservePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
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
  if (!server?.listening) return Promise.resolve();
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}
