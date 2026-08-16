import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";

const desktopDir = path.resolve(import.meta.dirname, "..");

describe("FlowBots macOS package contract", () => {
  test("pack:mac builds the embedded web UI before Electron Builder", async () => {
    const pkg = JSON.parse(await readFile(path.join(desktopDir, "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };
    expect(pkg.scripts?.["pack:mac"]).toContain("@rakazo/web build");
    expect(pkg.scripts?.["pack:mac"]).toContain("electron-builder --mac --universal");
  });

  test("package copies the Lite web bundle and Prisma migrations into process.resourcesPath", async () => {
    const pkg = JSON.parse(await readFile(path.join(desktopDir, "package.json"), "utf8")) as {
      build?: {
        extraResources?: Array<{ from?: string; to?: string }>;
        dmg?: { title?: string };
      };
    };
    expect(pkg.build?.extraResources).toEqual(
      expect.arrayContaining([
        { from: "../web/dist", to: "web" },
        { from: "../../packages/db/prisma/migrations", to: "migrations" },
      ]),
    );
    expect(pkg.build?.dmg?.title).toBe("FlowBots");
  });

  test("universal merge skips lipo only inside node-pty's architecture-labeled macOS prebuild slices", async () => {
    const pkg = JSON.parse(await readFile(path.join(desktopDir, "package.json"), "utf8")) as {
      build?: { mac?: { x64ArchFiles?: string } };
    };
    expect(pkg.build?.mac?.x64ArchFiles).toBe(
      "**/node-pty/prebuilds/darwin-{arm64,x64}/**",
    );
  });
});
