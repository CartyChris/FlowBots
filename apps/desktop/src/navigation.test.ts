import { describe, expect, it } from "vitest";
import { attemptNavigation, shouldAutoRetry } from "./navigation.js";

describe("desktop navigation", () => {
  it("returns recovery state when the web origin cannot be loaded", async () => {
    const result = await attemptNavigation(async () => {
      throw new Error("ERR_CONNECTION_REFUSED (-102)");
    }, "http://127.0.0.1:5173");

    expect(result).toEqual({
      ok: false,
      url: "http://127.0.0.1:5173",
      error: "ERR_CONNECTION_REFUSED (-102)",
    });
  });

  it("returns connected state when navigation succeeds", async () => {
    const result = await attemptNavigation(async () => undefined, "https://rakazo.example");
    expect(result).toEqual({ ok: true, url: "https://rakazo.example" });
  });

  it("auto-retries only while disconnected and the window is alive", () => {
    expect(shouldAutoRetry({ connected: false, windowDestroyed: false })).toBe(true);
    expect(shouldAutoRetry({ connected: true, windowDestroyed: false })).toBe(false);
    expect(shouldAutoRetry({ connected: false, windowDestroyed: true })).toBe(false);
    expect(shouldAutoRetry({ connected: true, windowDestroyed: true })).toBe(false);
  });
});
