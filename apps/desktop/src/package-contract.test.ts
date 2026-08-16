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

  test("desktop bundles LocalRuntime instead of importing workspace TypeScript at runtime", async () => {
    const pkg = JSON.parse(await readFile(path.join(desktopDir, "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };
    const main = await readFile(path.join(desktopDir, "src", "main.ts"), "utf8");

    expect(main).toContain('from "./local-runtime.js"');
    expect(main).not.toContain('from "@rakazo/local-runtime"');
    expect(pkg.scripts?.build).toContain("build-local-runtime.mjs");
  });

  test("runtime packages kept external by esbuild are direct desktop dependencies", async () => {
    const pkg = JSON.parse(await readFile(path.join(desktopDir, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
    };
    const bundler = await readFile(
      path.join(desktopDir, "scripts", "build-local-runtime.mjs"),
      "utf8",
    );

    for (const dependency of ["@electric-sql/pglite", "pg", "@prisma/client"]) {
      expect(
        pkg.dependencies?.[dependency],
        `${dependency} must be packaged by Electron`,
      ).toBeTruthy();
    }
    expect(bundler).toContain('specifier === "@electric-sql/pglite"');
    expect(bundler).toContain('specifier === "pg"');
    expect(bundler).toContain('specifier === "@prisma/client"');
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
    expect(pkg.build?.mac?.x64ArchFiles).toBe("**/node-pty/prebuilds/darwin-{arm64,x64}/**");
  });
});
