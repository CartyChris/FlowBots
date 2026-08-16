import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  launcherDocumentUrl,
  resolveRuntimeResourcePaths,
  trustedRuntimeSender,
} from "./runtime-bootstrap.js";

describe("desktop runtime bootstrap boundaries", () => {
  test("packaged Lite resources come only from Electron resources and userData", () => {
    expect(
      resolveRuntimeResourcePaths({
        isPackaged: true,
        appPath: "/Applications/Rakazo.app/Contents/Resources/app.asar",
        resourcesPath: "/Applications/Rakazo.app/Contents/Resources",
        userData: "/Users/chris/Library/Application Support/Rakazo",
      }),
    ).toEqual({
      dataDir: path.join("/Users/chris/Library/Application Support/Rakazo", "lite"),
      migrationsDir: "/Applications/Rakazo.app/Contents/Resources/migrations",
      webDir: "/Applications/Rakazo.app/Contents/Resources/web",
    });
  });

  test("development resources resolve from the repository root rather than cwd", () => {
    expect(
      resolveRuntimeResourcePaths({
        isPackaged: false,
        appPath: "/repo/apps/desktop",
        resourcesPath: "/ignored",
        userData: "/tmp/rakazo-user",
      }),
    ).toEqual({
      dataDir: "/tmp/rakazo-user/lite",
      migrationsDir: "/repo/packages/db/prisma/migrations",
      webDir: "/repo/apps/web/dist",
    });
  });

  test("launcher data URL is exact-match trusted and remote/application origins are not", () => {
    const launcher = launcherDocumentUrl("connection failed");
    expect(launcher).toMatch(/^data:text\/html;charset=utf-8,/);
    expect(trustedRuntimeSender(launcher, launcher)).toBe(true);
    expect(trustedRuntimeSender("https://example.com", launcher)).toBe(false);
    expect(trustedRuntimeSender("http://127.0.0.1:43117", launcher)).toBe(false);
    expect(trustedRuntimeSender(`${launcher}x`, launcher)).toBe(false);
  });
});
