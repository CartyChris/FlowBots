import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PrismaClient } from "./generated/prisma/client.js";

export type Db = PrismaClient;

export function createDbFromPool(pool: Pool): { prisma: PrismaClient; pool: Pool } {
  const adapter = new PrismaPg(pool);
  return { prisma: new PrismaClient({ adapter }), pool };
}

export function createDb(connectionString: string): { prisma: PrismaClient; pool: Pool } {
  return createDbFromPool(new Pool({ connectionString }));
}

export type { Pool } from "pg";
export * from "./generated/prisma/client.js";
export { Prisma, PrismaClient } from "./generated/prisma/client.js";
