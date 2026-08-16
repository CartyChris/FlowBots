import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";

describe("desktop main runtime wiring", () => {
  test("Electron uses the three-mode runtime session instead of direct WEB_URL navigation", async () => {
    const source = await readFile(path.join(import.meta.dirname, "main.ts"), "utf8");
    expect(source).toContain('from "@rakazo/local-runtime"');
    expect(source).toContain("DesktopRuntimeSession");
    expect(source).toContain("activateRuntimeProfile");
    expect(source).toContain("probeRuntimeOrigin");
    expect(source).toContain("readRuntimeSettings");
    expect(source).toContain("writeRuntimeSettings");
    expect(source).toContain("resolveRuntimeResourcePaths");
    expect(source).toContain("trustedRuntimeSender");
    expect(source).toMatch(/desktop\.runtime\.choose/);
    expect(source).toMatch(/session\.start\(/);
    expect(source).toMatch(/session\.stop\(/);
    expect(source).not.toMatch(/loadURL\(WEB_URL\)/);
  });

  test("desktop production dependencies include the embedded LocalRuntime", async () => {
    const pkg = JSON.parse(
      await readFile(path.join(import.meta.dirname, "..", "package.json"), "utf8"),
    ) as { dependencies?: Record<string, string> };
    expect(pkg.dependencies?.["@rakazo/local-runtime"]).toBe("workspace:*");
  });
});
