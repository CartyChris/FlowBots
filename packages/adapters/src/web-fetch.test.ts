import { describe, expect, it } from "vitest";
import { safeWebFetch, validatePublicUrl, type WebFetchHop } from "./web-fetch.js";

const publicResolver = async () => [{ address: "93.184.216.34", family: 4 as const }];

async function rejects(url: string, match: RegExp) {
  await expect(validatePublicUrl(url, publicResolver)).rejects.toThrow(match);
}

describe("validatePublicUrl", () => {
  it("rejects non-http protocols and credentialed URLs", async () => {
    await rejects("file:///etc/passwd", /http/i);
    await rejects("ftp://example.com/file", /http/i);
    await rejects("https://user:secret@example.com/", /credentials/i);
  });

  it("rejects literal loopback, private, link-local, carrier, multicast, and reserved IPv4", async () => {
    for (const host of [
      "0.0.0.1",
      "10.1.2.3",
      "100.64.0.1",
      "127.0.0.1",
      "169.254.1.2",
      "172.16.0.1",
      "192.168.1.1",
      "198.18.0.1",
      "224.0.0.1",
      "240.0.0.1",
    ]) {
      await rejects(`http://${host}/`, /public internet/i);
    }
  });

  it("rejects literal loopback, ULA, link-local, multicast, and mapped-private IPv6", async () => {
    for (const host of [
      "[::1]",
      "[fc00::1]",
      "[fd12::1]",
      "[fe80::1]",
      "[ff02::1]",
      "[::ffff:127.0.0.1]",
    ]) {
      await rejects(`http://${host}/`, /public internet/i);
    }
  });

  it("rejects public hostnames when DNS resolves to a blocked address", async () => {
    await expect(
      validatePublicUrl("https://example.com/", async () => [
        { address: "93.184.216.34", family: 4 },
        { address: "127.0.0.1", family: 4 },
      ]),
    ).rejects.toThrow(/public internet/i);
  });

  it("returns only validated public addresses", async () => {
    await expect(validatePublicUrl("https://example.com/a", publicResolver)).resolves.toMatchObject(
      {
        url: "https://example.com/a",
        addresses: [{ address: "93.184.216.34", family: 4 }],
      },
    );
  });
});

describe("safeWebFetch", () => {
  it("revalidates every redirect before following it", async () => {
    const hops: string[] = [];
    const requestHop = async (input: WebFetchHop) => {
      hops.push(input.url);
      return {
        status: 302,
        headers: { location: "http://127.0.0.1/admin" },
        body: new Uint8Array(),
        truncated: false,
      };
    };

    await expect(
      safeWebFetch(
        { url: "https://example.com/start" },
        { resolveHost: publicResolver, requestHop },
      ),
    ).rejects.toThrow(/public internet/i);
    expect(hops).toEqual(["https://example.com/start"]);
  });

  it("extracts readable text and enforces the requested character bound", async () => {
    const requestHop = async (_input: WebFetchHop) => ({
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
      body: new TextEncoder().encode(
        "<html><head><style>.x{}</style><script>nope()</script></head><body><h1>Hello &amp; welcome</h1><p>Alpha   beta gamma delta</p></body></html>",
      ),
      truncated: false,
    });

    const result = await safeWebFetch(
      { url: "https://example.com/", maxChars: 26 },
      { resolveHost: publicResolver, requestHop },
    );

    expect(result.status).toBe(200);
    expect(result.text).toBe("Hello & welcome Alpha beta");
    expect(result.truncated).toBe(true);
  });

  it("fails closed on redirect loops and unsupported binary responses", async () => {
    const redirectHop = async (input: WebFetchHop) => ({
      status: 302,
      headers: { location: input.url },
      body: new Uint8Array(),
      truncated: false,
    });
    await expect(
      safeWebFetch(
        { url: "https://example.com/" },
        { resolveHost: publicResolver, requestHop: redirectHop, maxRedirects: 1 },
      ),
    ).rejects.toThrow(/redirect/i);

    const binaryHop = async (_input: WebFetchHop) => ({
      status: 200,
      headers: { "content-type": "application/octet-stream" },
      body: new Uint8Array([0, 1, 2]),
      truncated: false,
    });
    await expect(
      safeWebFetch(
        { url: "https://example.com/file.bin" },
        { resolveHost: publicResolver, requestHop: binaryHop },
      ),
    ).rejects.toThrow(/text/i);
  });
});
