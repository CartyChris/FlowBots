import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readConnectionSettings, writeConnectionSettings } from "./connection-settings.js";

let root = "";

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "rakazo-desktop-settings-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("desktop connection settings persistence", () => {
  it("returns empty settings when the file is missing or malformed", async () => {
    const missing = path.join(root, "missing.json");
    await expect(readConnectionSettings(missing)).resolves.toEqual({ recentUrls: [] });

    const malformed = path.join(root, "malformed.json");
    await writeFile(malformed, "{not-json", "utf8");
    await expect(readConnectionSettings(malformed)).resolves.toEqual({ recentUrls: [] });
  });

  it("round-trips valid active and recent endpoints", async () => {
    const file = path.join(root, "connection-settings.json");
    const settings = {
      activeUrl: "https://rakazo.example",
      recentUrls: ["https://rakazo.example", "http://127.0.0.1:5173"],
    };

    await writeConnectionSettings(file, settings);

    await expect(readConnectionSettings(file)).resolves.toEqual(settings);
    expect(JSON.parse(await readFile(file, "utf8"))).toEqual(settings);
    await expect(readFile(`${file}.tmp`, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("drops invalid and credential-bearing endpoints from stored JSON", async () => {
    const file = path.join(root, "connection-settings.json");
    await writeFile(
      file,
      JSON.stringify({
        activeUrl: "file:///tmp/rakazo",
        recentUrls: [
          "javascript:alert(1)",
          "https://alice:secret@example.com",
          "https://good.example/",
        ],
      }),
      "utf8",
    );

    await expect(readConnectionSettings(file)).resolves.toEqual({
      recentUrls: ["https://good.example"],
    });
  });

  it("creates a missing parent directory before atomically writing", async () => {
    const parent = path.join(root, "nested", "settings");
    const file = path.join(parent, "connection-settings.json");
    await mkdir(path.join(root, "unrelated"));

    await writeConnectionSettings(file, {
      activeUrl: "http://localhost:5173",
      recentUrls: ["http://localhost:5173"],
    });

    await expect(readConnectionSettings(file)).resolves.toEqual({
      activeUrl: "http://localhost:5173",
      recentUrls: ["http://localhost:5173"],
    });
  });
});
