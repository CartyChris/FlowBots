import { describe, expect, it } from "vitest";
import { defaultWebUrl, localApiHealthUrl, normalizeWebUrl, rememberWebUrl } from "./connection.js";

describe("desktop connection profiles", () => {
  it("normalizes supported web URLs", () => {
    expect(normalizeWebUrl(" https://example.com/ ")).toBe("https://example.com");
    expect(normalizeWebUrl("http://127.0.0.1:5173/room/")).toBe("http://127.0.0.1:5173/room");
    expect(normalizeWebUrl("https://example.com/path/?view=1#chat")).toBe(
      "https://example.com/path?view=1#chat",
    );
  });

  it("rejects unsafe or non-web URL schemes", () => {
    expect(() => normalizeWebUrl("file:///tmp/index.html")).toThrow(/http/i);
    expect(() => normalizeWebUrl("javascript:alert(1)")).toThrow(/http/i);
  });

  it("rejects credential-bearing URLs so settings never store secrets", () => {
    expect(() => normalizeWebUrl("https://alice:secret@example.com")).toThrow(/credential/i);
  });

  it("uses the environment web URL and falls back to local development", () => {
    expect(defaultWebUrl({ RAKAZO_WEB_URL: "https://host.example/" } as NodeJS.ProcessEnv)).toBe(
      "https://host.example",
    );
    expect(defaultWebUrl({} as NodeJS.ProcessEnv)).toBe("http://127.0.0.1:5173");
  });

  it("keeps recent URLs newest-first, unique, and capped at five", () => {
    expect(
      rememberWebUrl({ recentUrls: ["https://b.test", "https://a.test"] }, "https://a.test"),
    ).toEqual({
      activeUrl: "https://a.test",
      recentUrls: ["https://a.test", "https://b.test"],
    });

    const six = rememberWebUrl(
      {
        recentUrls: [
          "https://1.test",
          "https://2.test",
          "https://3.test",
          "https://4.test",
          "https://5.test",
        ],
      },
      "https://6.test",
    );
    expect(six.recentUrls).toEqual([
      "https://6.test",
      "https://1.test",
      "https://2.test",
      "https://3.test",
      "https://4.test",
    ]);
  });

  it("derives the local API health endpoint only for local web origins", () => {
    expect(localApiHealthUrl("http://127.0.0.1:5173")).toBe("http://127.0.0.1:3100/health");
    expect(localApiHealthUrl("http://localhost:5173/foo")).toBe("http://127.0.0.1:3100/health");
    expect(localApiHealthUrl("https://rakazo.example")).toBeUndefined();
  });
});
