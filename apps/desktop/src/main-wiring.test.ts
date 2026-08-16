import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";

describe("desktop main runtime wiring", () => {
  test("Electron uses the three-mode runtime session instead of direct WEB_URL navigation", async () => {
    const source = await readFile(path.join(import.meta.dirname, "main.ts"), "utf8");
    expect(source).toContain('from "./local-runtime.js"');
    expect(source).not.toContain('from "@rakazo/local-runtime"');
    expect(source).toContain("DesktopRuntimeSession");
    expect(source).toContain("activateRuntimeProfile");
    expect(source).toContain("probeRuntimeOrigin");
    expect(source).toContain("readRuntimeSettings");
    expect(source).toContain("writeRuntimeSettings");
    expect(source).toContain("resolveRuntimeResourcePaths");
    expect(source).toContain("trustedRuntimeSender");
    expect(source).toMatch(/desktop\.runtime\.choose/);
    expect(source).toMatch(/\.start\(await readRuntimeSettings\(/);
    expect(source).toMatch(/\.stop\(\)/);
    expect(source).not.toMatch(/loadURL\(WEB_URL\)/);
  });

  test("host terminal is owned by Electron main and every IPC mutation is re-authorized", async () => {
    const source = await readFile(path.join(import.meta.dirname, "main.ts"), "utf8");
    expect(source).toMatch(/from ["']node-pty["']/);
    expect(source).toContain("createNodePtyFactory");
    expect(source).toContain("TerminalSessionManager");
    expect(source).toContain("trustedTerminalSender");
    expect(source).toMatch(/desktop\.terminal\.create/);
    expect(source).toMatch(/desktop\.terminal\.write/);
    expect(source).toMatch(/desktop\.terminal\.resize/);
    expect(source).toMatch(/desktop\.terminal\.interrupt/);
    expect(source).toMatch(/desktop\.terminal\.close/);
    expect(source).toMatch(/desktop\.terminal\.data/);
    expect(source).toMatch(/desktop\.terminal\.activity/);
    expect(source).toMatch(/assertTrustedTerminalSender\(event\)/);
    expect(source).toMatch(/terminalManager\?\.closeAll\(\)/);
  });

  test("desktop production dependencies include embedded LocalRuntime and pinned native PTY", async () => {
    const pkg = JSON.parse(
      await readFile(path.join(import.meta.dirname, "..", "package.json"), "utf8"),
    ) as { dependencies?: Record<string, string>; build?: { asarUnpack?: string[] } };
    expect(pkg.dependencies?.["@rakazo/local-runtime"]).toBe("workspace:*");
    expect(pkg.dependencies?.["node-pty"]).toBe("1.2.0-beta.14");
    expect(pkg.build?.asarUnpack ?? []).toContain("node_modules/node-pty/**/*");
  });
});
