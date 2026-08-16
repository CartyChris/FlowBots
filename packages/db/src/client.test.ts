import { describe, expect, test } from "vitest";
import * as client from "./client.js";

describe("database client construction", () => {
  test("can construct Prisma from an existing pg pool", () => {
    expect(typeof (client as Record<string, unknown>).createDbFromPool).toBe("function");
  });
});
