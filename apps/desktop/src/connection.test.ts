import { describe, expect, it } from "vitest";
import {
  defaultWebUrl,
  isTrustedConnectionCenterDocument,
  localApiHealthUrl,
  normalizeWebUrl,
  rememberWebUrl,
} from "./connection.js";

describe("desktop connection profiles", () => {
  it("normalizes supported web URLs", () => {
    expect(normalizeWebUrl(" https://example.com/ ")).toBe("https://example.com");
    expect(normalizeWebUrl("http://127.0.0.1:5173/room/")).toBe("http://127.0.0.1:5173/room");
  });

  it("rejects unsafe or non-web URL schemes", () => {
    expect(() => normalizeWebUrl("file:///tmp/index.html")).toThrow(/http/i);
    expect(() => normalizeWebUrl("javascript:alert(1)")).toThrow(/http/i);
  });

  it("rejects URL components that could persist credentials or tokens", () => {
    expect(() => normalizeWebUrl("https://alice:secret@example.com")).toThrow(/credential/i);
    expect(() => normalizeWebUrl("https://example.com/?token=secret")).toThrow(/query|fragment/i);
    expect(() => normalizeWebUrl("https://example.com/#access_token=secret")).toThrow(
      /query|fragment/i,
    );
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

  it("trusts connection controls only from the exact generated Connection Center document", () => {
    const expected = "data:text/html;charset=utf-8,%3Chtml%3Erecovery-a%3C%2Fhtml%3E";

    expect(isTrustedConnectionCenterDocument(expected, expected)).toBe(true);
    expect(isTrustedConnectionCenterDocument("https://rakazo.example", expected)).toBe(false);
    expect(
      isTrustedConnectionCenterDocument(
        "data:text/html;charset=utf-8,%3Chtml%3Eattacker%3C%2Fhtml%3E",
        expected,
      ),
    ).toBe(false);
    expect(isTrustedConnectionCenterDocument(expected, "")).toBe(false);
  });
});
