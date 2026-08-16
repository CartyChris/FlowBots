import { describe, expect, test, vi } from "vitest";
import type { RuntimeProfile } from "./runtime-profile.js";
import { DesktopRuntimeSession } from "./runtime-session.js";

function harness() {
  const liteStop = vi.fn(async () => undefined);
  const activate = vi.fn(async (profile: RuntimeProfile) =>
    profile.mode === "lite"
      ? { mode: "lite" as const, origin: "http://127.0.0.1:43117", stop: liteStop }
      : { mode: profile.mode, origin: profile.serverUrl },
  );
  const probe = vi.fn(async () => ({ ok: true as const }));
  const navigate = vi.fn(async () => undefined);
  const persist = vi.fn(async () => undefined);
  const showLauncher = vi.fn(async () => undefined);
  const session = new DesktopRuntimeSession({ activate, probe, navigate, persist, showLauncher });
  return { session, activate, probe, navigate, persist, showLauncher, liteStop };
}

describe("desktop runtime session", () => {
  test("first run shows the launcher and starts no runtime", async () => {
    const h = harness();
    await h.session.start(null);
    expect(h.showLauncher).toHaveBeenCalledWith("");
    expect(h.activate).not.toHaveBeenCalled();
    expect(h.navigate).not.toHaveBeenCalled();
  });

  test("Lite activates, verifies, persists, then navigates in that order", async () => {
    const h = harness();
    const order: string[] = [];
    h.activate.mockImplementation(async () => {
      order.push("activate");
      return { mode: "lite", origin: "http://127.0.0.1:43117", stop: h.liteStop };
    });
    h.probe.mockImplementation(async () => {
      order.push("probe");
      return { ok: true };
    });
    h.persist.mockImplementation(async () => {
      order.push("persist");
    });
    h.navigate.mockImplementation(async () => {
      order.push("navigate");
    });

    await expect(h.session.choose({ mode: "lite" })).resolves.toEqual({ ok: true });
    expect(order).toEqual(["activate", "probe", "persist", "navigate"]);
    expect(h.probe).toHaveBeenCalledWith({ mode: "lite", origin: "http://127.0.0.1:43117" });
  });

  test("Full Local and Remote never inherit or silently start Lite", async () => {
    const h = harness();
    await h.session.choose({ mode: "full-local", serverUrl: "http://127.0.0.1:5173" });
    await h.session.choose({ mode: "remote", serverUrl: "https://example.com/app" });

    expect(h.activate.mock.calls.map((call) => call[0].mode)).toEqual(["full-local", "remote"]);
    expect(h.probe.mock.calls.map((call) => call[0].mode)).toEqual(["full-local", "remote"]);
  });

  test("switching away from Lite stops the embedded runtime before activating the next mode", async () => {
    const h = harness();
    await h.session.choose({ mode: "lite" });
    await h.session.choose({ mode: "remote", serverUrl: "https://example.com" });
    expect(h.liteStop).toHaveBeenCalledTimes(1);
  });

  test("failed health never navigates or persists and closes a newly started Lite runtime", async () => {
    const h = harness();
    h.probe.mockResolvedValue({ ok: false, error: "health failed" });

    await expect(h.session.choose({ mode: "lite" })).resolves.toEqual({
      ok: false,
      error: "health failed",
    });
    expect(h.persist).not.toHaveBeenCalled();
    expect(h.navigate).not.toHaveBeenCalled();
    expect(h.liteStop).toHaveBeenCalledTimes(1);
    expect(h.showLauncher).toHaveBeenCalledWith("health failed");
  });

  test("failed navigation returns to the launcher and stops the active Lite runtime", async () => {
    const h = harness();
    h.navigate.mockRejectedValue(new Error("ERR_CONNECTION_RESET"));

    await expect(h.session.choose({ mode: "lite" })).resolves.toMatchObject({ ok: false });
    expect(h.liteStop).toHaveBeenCalledTimes(1);
    expect(h.showLauncher).toHaveBeenCalledWith(expect.stringMatching(/connection|navigation|load/i));
  });

  test("showLauncher and stop release any active Lite runtime idempotently", async () => {
    const h = harness();
    await h.session.choose({ mode: "lite" });
    await h.session.showLauncher();
    await h.session.stop();
    await h.session.stop();
    expect(h.liteStop).toHaveBeenCalledTimes(1);
    expect(h.showLauncher).toHaveBeenCalledWith("");
  });
});
