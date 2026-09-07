import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { createDbFromPool } from "@rakazo/db";
import { Pool } from "pg";

/** Isolated actual PostgreSQL schema; deliberately starts no API, scheduler, or model calls. */
export async function createTestDatabase(options: { maxConnections?: number } = {}) {
  const embedded = await PGlite.create();
  const migrations = fileURLToPath(
    new URL("../../../packages/db/prisma/migrations/", import.meta.url),
  );
  for (const directory of (await readdir(migrations)).filter((name) => /^\d/.test(name)).sort()) {
    await embedded.exec(await readFile(path.join(migrations, directory, "migration.sql"), "utf8"));
  }
  const socket = new PGLiteSocketServer({
    db: embedded,
    host: "127.0.0.1",
    port: 0,
    maxConnections: options.maxConnections ?? 1,
  });
  const port = new Promise<number>((resolve, reject) => {
    socket.addEventListener(
      "listening",
      (event) => {
        const actualPort = (event as CustomEvent<{ port: number }>).detail.port;
        if (actualPort) resolve(actualPort);
        else reject(new Error("Embedded PostgreSQL did not expose a port"));
      },
      { once: true },
    );
    socket.addEventListener("error", (event) => reject((event as CustomEvent).detail), {
      once: true,
    });
  });
  await socket.start();
  const databasePort = await port;
  const databaseUrl = `postgres://postgres@127.0.0.1:${databasePort}/postgres?sslmode=disable`;
  const pool = new Pool({
    host: "127.0.0.1",
    port: databasePort,
    database: "postgres",
    user: "postgres",
    max: 1,
  });
  const { prisma } = createDbFromPool(pool);
  return {
    prisma,
    databaseUrl,
    async close() {
      await prisma.$disconnect();
      await pool.end();
      await socket.stop();
      await embedded.close();
    },
  };
}
