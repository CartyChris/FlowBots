import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";

const desktopDir = path.resolve(import.meta.dirname, "..");
const repoRoot = path.resolve(desktopDir, "../..");

async function text(relativePath: string) {
  return readFile(path.join(repoRoot, relativePath), "utf8");
}

function electronBuilderVariable(name: string) {
  return `${String.fromCharCode(36)}{${name}}`;
}

describe("FlowBots product branding", () => {
  test("macOS package and artifacts are named FlowBots while internal workspace namespaces remain stable", async () => {
    const pkg = JSON.parse(await text("apps/desktop/package.json")) as {
      name?: string;
      build?: { productName?: string; artifactName?: string };
    };
    expect(pkg.name).toBe("@rakazo/desktop");
    expect(pkg.build?.productName).toBe("FlowBots");
    expect(pkg.build?.artifactName).toBe(
      `FlowBots-${electronBuilderVariable("version")}-${electronBuilderVariable("arch")}.${electronBuilderVariable("ext")}`,
    );
  });

  test("desktop runtime launcher and host-boundary errors present FlowBots to the user", async () => {
    const runtime = await text("apps/desktop/src/runtime-profile.ts");
    const main = await text("apps/desktop/src/main.ts");
    expect(runtime).toContain("<title>Choose how FlowBots runs</title>");
    expect(runtime).toContain('<div class="eyebrow">FlowBots Runtime</div>');
    expect(runtime).toContain("<h1>How should FlowBots run?</h1>");
    expect(runtime).toContain("trusted FlowBots server");
    expect(main).toContain("FlowBots local runtime launcher");
    expect(main).toContain("loopback FlowBots runtime");
    expect(main).toContain("FlowBots terminal service is unavailable");
    expect(main).toContain("this FlowBots window");
  });

  test("web welcome, document metadata, and install manifest all present FlowBots", async () => {
    const welcome = await text("apps/web/src/pages/Welcome.tsx");
    const index = await text("apps/web/index.html");
    const manifest = JSON.parse(await text("apps/web/public/site.webmanifest")) as {
      name?: string;
      short_name?: string;
    };

    expect(welcome).toContain(">FlowBots</div>");
    expect(index).toContain('<meta name="apple-mobile-web-app-title" content="FlowBots" />');
    expect(index).toContain("<title>FlowBots</title>");
    expect(manifest.name).toBe("FlowBots");
    expect(manifest.short_name).toBe("FlowBots");
  });
});
