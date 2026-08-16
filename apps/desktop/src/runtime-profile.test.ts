import { describe, expect, test, vi } from "vitest";
import * as profile from "./runtime-profile.js";

function required<T>(name: string): T | undefined {
  const value = (profile as Record<string, unknown>)[name];
  expect(value, `${name} must be exported by runtime-profile`).toBeDefined();
  return value as T | undefined;
}

describe("desktop runtime profiles", () => {
  test("first run has no implicit profile and the launcher exposes exactly three modes", () => {
    const parse = required<(value: unknown) => unknown>("parseRuntimeProfile");
    const modes =
      required<Array<{ id: string; recommended?: boolean; title: string }>>("RUNTIME_MODES");
    if (!parse || !modes) return;
    expect(parse(undefined)).toBeNull();
    expect(modes.map((mode) => mode.id)).toEqual(["lite", "full-local", "remote"]);
    expect(modes.find((mode) => mode.id === "lite")?.recommended).toBe(true);
  });

  test("normalizes Full Local and Remote origins without credentials, query strings, or fragments", () => {
    const normalize =
      required<
        (value: { mode: string; serverUrl?: string }) => { mode: string; serverUrl?: string }
      >("normalizeRuntimeProfile");
    if (!normalize) return;

    expect(normalize({ mode: "full-local" })).toEqual({
      mode: "full-local",
      serverUrl: "http://127.0.0.1:5173",
    });
    expect(normalize({ mode: "remote", serverUrl: "https://example.com/rakazo/" })).toEqual({
      mode: "remote",
      serverUrl: "https://example.com/rakazo",
    });
    expect(() => normalize({ mode: "remote", serverUrl: "https://u:p@example.com" })).toThrow(
      /credential/i,
    );
    expect(() => normalize({ mode: "remote", serverUrl: "https://example.com?a=1" })).toThrow(
      /query|fragment/i,
    );
  });

  test("only Lite mode is allowed to start the embedded LocalRuntime", async () => {
    const activate =
      required<
        (
          value: { mode: string; serverUrl?: string },
          deps: { startLite(): Promise<{ origin: string; stop(): Promise<void> }> },
        ) => Promise<{ mode: string; origin: string; stop?: () => Promise<void> }>
      >("activateRuntimeProfile");
    if (!activate) return;

    const stop = vi.fn(async () => undefined);
    const startLite = vi.fn(async () => ({ origin: "http://127.0.0.1:43117", stop }));

    const full = await activate({ mode: "full-local" }, { startLite });
    expect(full).toMatchObject({ mode: "full-local", origin: "http://127.0.0.1:5173" });
    expect(startLite).not.toHaveBeenCalled();

    const remote = await activate(
      { mode: "remote", serverUrl: "https://example.com/app" },
      { startLite },
    );
    expect(remote).toMatchObject({ mode: "remote", origin: "https://example.com/app" });
    expect(startLite).not.toHaveBeenCalled();

    const lite = await activate({ mode: "lite" }, { startLite });
    expect(lite).toMatchObject({ mode: "lite", origin: "http://127.0.0.1:43117" });
    expect(startLite).toHaveBeenCalledTimes(1);
    await lite.stop?.();
    expect(stop).toHaveBeenCalledTimes(1);
  });

  test("launcher copy makes zero-setup and external modes explicit", () => {
    const html = required<(error?: string) => string>("runtimeLauncherHtml");
    if (!html) return;
    const output = html();
    expect(output).toContain("Lite");
    expect(output).toContain("Recommended");
    expect(output).toMatch(/No Docker/i);
    expect(output).toContain("Full Local");
    expect(output).toContain("Remote");
    expect(output).toMatch(/data-runtime-mode=["']lite["']/);
    expect(output).toMatch(/data-runtime-mode=["']full-local["']/);
    expect(output).toMatch(/data-runtime-mode=["']remote["']/);
  });

  test("launcher invokes only the hardened runtime.choose preload bridge", () => {
    const html = required<(error?: string) => string>("runtimeLauncherHtml");
    if (!html) return;
    const output = html();
    expect(output).toMatch(/rakazoDesktop\?\.runtime\?\.choose\?\.\(profile\)/);
    expect(output).not.toContain("chooseRuntime");
  });
});
