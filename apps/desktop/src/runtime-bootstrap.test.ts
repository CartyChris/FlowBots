import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  launcherDocumentUrl,
  resolveRuntimeResourcePaths,
  trustedRuntimeSender,
  trustedTerminalSender,
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

  test("host terminal trusts only the exact active loopback FlowBots origin", () => {
    const active = "http://127.0.0.1:43117";
    expect(trustedTerminalSender("http://127.0.0.1:43117/chat", active)).toBe(true);
    expect(trustedTerminalSender("http://127.0.0.1:43117/terminal?tab=2", active)).toBe(true);
    expect(trustedTerminalSender("http://127.0.0.1:43118/chat", active)).toBe(false);
    expect(trustedTerminalSender("http://localhost:43117/chat", active)).toBe(false);
    expect(trustedTerminalSender("https://example.com", active)).toBe(false);
    expect(trustedTerminalSender("http://127.0.0.1.evil.test", active)).toBe(false);
    expect(trustedTerminalSender("data:text/html,hello", active)).toBe(false);
    expect(trustedTerminalSender(undefined, active)).toBe(false);
    expect(trustedTerminalSender("http://127.0.0.1:43117/chat", "")).toBe(false);
    expect(
      trustedTerminalSender("http://127.0.0.1:43117/chat", "https://127.0.0.1:43117"),
    ).toBe(false);
  });
});