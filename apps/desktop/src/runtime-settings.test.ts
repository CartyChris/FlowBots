import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import * as settings from "./runtime-settings.js";

const temps: string[] = [];
afterEach(async () => {
  await Promise.all(temps.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

function required<T>(name: string): T | undefined {
  const value = (settings as Record<string, unknown>)[name];
  expect(value, `${name} must be exported by runtime-settings`).toBeDefined();
  return value as T | undefined;
}

describe("runtime profile persistence", () => {
  test("missing or corrupt settings never invent a runtime mode", async () => {
    const read = required<(file: string) => Promise<unknown>>("readRuntimeProfile");
    if (!read) return;
    const dir = await mkdtemp(path.join(os.tmpdir(), "rakazo-runtime-settings-"));
    temps.push(dir);
    const file = path.join(dir, "profile.json");
    await expect(read(file)).resolves.toBeNull();
    await writeFile(file, "{bad json", "utf8");
    await expect(read(file)).resolves.toBeNull();
    await writeFile(file, JSON.stringify({ mode: "unknown" }), "utf8");
    await expect(read(file)).resolves.toBeNull();
  });

  test("writes normalized profiles atomically", async () => {
    const write =
      required<(file: string, profile: { mode: string; serverUrl?: string }) => Promise<void>>(
        "writeRuntimeProfile",
      );
    const read = required<(file: string) => Promise<unknown>>("readRuntimeProfile");
    if (!write || !read) return;
    const dir = await mkdtemp(path.join(os.tmpdir(), "rakazo-runtime-settings-"));
    temps.push(dir);
    const file = path.join(dir, "profile.json");
    await write(file, { mode: "remote", serverUrl: "https://example.com/app/" });
    await expect(read(file)).resolves.toEqual({
      mode: "remote",
      serverUrl: "https://example.com/app",
    });
    expect(JSON.parse(await readFile(file, "utf8"))).toEqual({
      mode: "remote",
      serverUrl: "https://example.com/app",
    });
  });
});
