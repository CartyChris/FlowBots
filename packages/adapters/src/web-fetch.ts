import { lookup as dnsLookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";

export interface ResolvedAddress {
  address: string;
  family: 4 | 6;
}

export type ResolveHost = (hostname: string) => Promise<ResolvedAddress[]>;

export interface WebFetchHop {
  url: string;
  addresses: ResolvedAddress[];
  timeoutMs: number;
  maxBytes: number;
  signal?: AbortSignal;
}

export interface WebFetchHopResult {
  status: number;
  headers: Record<string, string>;
  body: Uint8Array;
  truncated: boolean;
}

export type RequestWebFetchHop = (input: WebFetchHop) => Promise<WebFetchHopResult>;

export interface WebFetchInput {
  url: string;
  maxChars?: number;
}

export interface WebFetchResult {
  url: string;
  status: number;
  contentType: string;
  text: string;
  truncated: boolean;
}

export interface WebFetchOptions {
  resolveHost?: ResolveHost;
  requestHop?: RequestWebFetchHop;
  timeoutMs?: number;
  maxRedirects?: number;
  signal?: AbortSignal;
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const DEFAULT_MAX_CHARS = 80_000;
const MAX_MAX_CHARS = 200_000;
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_REDIRECTS = 5;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

export async function validatePublicUrl(
  rawUrl: string,
  resolveHost: ResolveHost = resolvePublicHost,
): Promise<{ url: string; addresses: ResolvedAddress[] }> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("web_fetch requires a valid http(s) URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("web_fetch supports only http(s) URLs");
  }
  if (url.username || url.password) {
    throw new Error("web_fetch URLs must not contain embedded credentials");
  }

  const hostname = unbracket(url.hostname).toLowerCase();
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new Error("web_fetch can access only public internet addresses");
  }

  const literalFamily = isIP(hostname);
  const addresses = literalFamily
    ? [{ address: hostname, family: literalFamily as 4 | 6 }]
    : await resolveHost(hostname);
  if (!addresses.length || addresses.some((entry) => !isPublicIp(entry.address))) {
    throw new Error("web_fetch can access only public internet addresses");
  }

  return { url: url.toString(), addresses };
}

export async function safeWebFetch(
  input: WebFetchInput,
  options: WebFetchOptions = {},
): Promise<WebFetchResult> {
  const resolveHost = options.resolveHost ?? resolvePublicHost;
  const requestHop = options.requestHop ?? requestNodeHop;
  const maxChars = clampInteger(input.maxChars ?? DEFAULT_MAX_CHARS, 1, MAX_MAX_CHARS);
  const timeoutMs = clampInteger(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, 250, 60_000);
  const maxRedirects = clampInteger(options.maxRedirects ?? DEFAULT_MAX_REDIRECTS, 0, 10);
  const maxBytes = Math.min(MAX_RESPONSE_BYTES, Math.max(16_384, maxChars * 4 + 8_192));

  let current = input.url;
  let redirects = 0;
  while (true) {
    if (options.signal?.aborted) throw options.signal.reason ?? new Error("web_fetch aborted");
    const validated = await validatePublicUrl(current, resolveHost);
    const hop = await requestHop({
      url: validated.url,
      addresses: validated.addresses,
      timeoutMs,
      maxBytes,
      signal: options.signal,
    });

    const location = hop.headers.location;
    if (REDIRECT_STATUSES.has(hop.status) && location) {
      if (redirects >= maxRedirects) throw new Error("web_fetch exceeded the redirect limit");
      current = new URL(location, validated.url).toString();
      redirects += 1;
      continue;
    }

    const contentType = hop.headers["content-type"] ?? "text/plain";
    if (!isTextContentType(contentType)) {
      throw new Error(`web_fetch supports text responses, received ${contentType}`);
    }
    const decoded = new TextDecoder("utf-8").decode(hop.body);
    const readable = contentType.toLowerCase().includes("text/html")
      ? htmlToReadableText(decoded)
      : collapseWhitespace(decoded);
    const truncated = hop.truncated || readable.length > maxChars;
    return {
      url: validated.url,
      status: hop.status,
      contentType,
      text: readable.slice(0, maxChars),
      truncated,
    };
  }
}

async function resolvePublicHost(hostname: string): Promise<ResolvedAddress[]> {
  const entries = await dnsLookup(hostname, { all: true, verbatim: true });
  return entries
    .filter(
      (entry): entry is { address: string; family: 4 | 6 } =>
        entry.family === 4 || entry.family === 6,
    )
    .map((entry) => ({ address: entry.address, family: entry.family }));
}

function requestNodeHop(input: WebFetchHop): Promise<WebFetchHopResult> {
  return new Promise((resolve, reject) => {
    const url = new URL(input.url);
    const target = chooseAddress(input.addresses, url.hostname);
    const transport = url.protocol === "https:" ? https : http;
    let settled = false;

    const finish = (result: WebFetchHopResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    const request = transport.request(
      {
        protocol: url.protocol,
        hostname: target.address,
        port: url.port || undefined,
        method: "GET",
        path: `${url.pathname}${url.search}`,
        headers: {
          accept:
            "text/html,application/xhtml+xml,application/json,text/plain,application/xml,text/xml;q=0.9,*/*;q=0.1",
          "accept-encoding": "identity",
          host: url.host,
          "user-agent": "FlowBots/1.0 (+local web fetch)",
        },
        ...(url.protocol === "https:" && isIP(unbracket(url.hostname)) === 0
          ? { servername: unbracket(url.hostname) }
          : {}),
        signal: input.signal,
      },
      (response) => {
        const chunks: Buffer[] = [];
        let bytes = 0;
        let truncated = false;
        response.on("data", (chunk: Buffer) => {
          if (settled || truncated) return;
          const remaining = input.maxBytes - bytes;
          if (remaining <= 0) {
            truncated = true;
            response.destroy();
            finish({
              status: response.statusCode ?? 0,
              headers: normalizeHeaders(response.headers),
              body: new Uint8Array(Buffer.concat(chunks)),
              truncated: true,
            });
            return;
          }
          const slice = chunk.subarray(0, remaining);
          chunks.push(slice);
          bytes += slice.length;
          if (slice.length < chunk.length || bytes >= input.maxBytes) {
            truncated = true;
            response.destroy();
            finish({
              status: response.statusCode ?? 0,
              headers: normalizeHeaders(response.headers),
              body: new Uint8Array(Buffer.concat(chunks)),
              truncated: true,
            });
          }
        });
        response.on("end", () => {
          finish({
            status: response.statusCode ?? 0,
            headers: normalizeHeaders(response.headers),
            body: new Uint8Array(Buffer.concat(chunks)),
            truncated,
          });
        });
        response.on("error", (error) => {
          if (!truncated) fail(error);
        });
      },
    );
    request.setTimeout(input.timeoutMs, () => request.destroy(new Error("web_fetch timed out")));
    request.on("error", fail);
    request.end();
  });
}

function chooseAddress(addresses: ResolvedAddress[], hostname: string): ResolvedAddress {
  const family = isIP(unbracket(hostname));
  if (family) {
    const match = addresses.find((entry) => entry.family === family);
    if (match) return match;
  }
  return addresses[0]!;
}

function normalizeHeaders(headers: http.IncomingHttpHeaders): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (Array.isArray(value)) normalized[key.toLowerCase()] = value.join(", ");
    else if (value !== undefined) normalized[key.toLowerCase()] = String(value);
  }
  return normalized;
}

function isTextContentType(contentType: string): boolean {
  const value = contentType.toLowerCase();
  return (
    value.startsWith("text/") ||
    value.includes("json") ||
    value.includes("xml") ||
    value.includes("javascript") ||
    value.includes("x-www-form-urlencoded")
  );
}

function htmlToReadableText(value: string): string {
  return collapseWhitespace(
    decodeHtmlEntities(
      value
        .replace(/<!--[\s\S]*?-->/g, " ")
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
        .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
        .replace(/<[^>]+>/g, " "),
    ),
  );
}

function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === "#") {
      const hex = entity[1]?.toLowerCase() === "x";
      const parsed = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isFinite(parsed) && parsed >= 0 && parsed <= 0x10ffff
        ? String.fromCodePoint(parsed)
        : match;
    }
    return named[entity.toLowerCase()] ?? match;
  });
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function isPublicIp(address: string): boolean {
  const normalized = unbracket(address).split("%")[0]!;
  const family = isIP(normalized);
  if (family === 4) return isPublicIpv4(normalized);
  if (family === 6) return isPublicIpv6(normalized);
  return false;
}

function isPublicIpv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return false;
  }
  const value =
    (((parts[0]! << 24) >>> 0) + (parts[1]! << 16) + (parts[2]! << 8) + parts[3]!) >>> 0;
  return ![
    ["0.0.0.0", 8],
    ["10.0.0.0", 8],
    ["100.64.0.0", 10],
    ["127.0.0.0", 8],
    ["169.254.0.0", 16],
    ["172.16.0.0", 12],
    ["192.0.0.0", 24],
    ["192.0.2.0", 24],
    ["192.168.0.0", 16],
    ["198.18.0.0", 15],
    ["198.51.100.0", 24],
    ["203.0.113.0", 24],
    ["224.0.0.0", 4],
    ["240.0.0.0", 4],
  ].some(([base, prefix]) => inIpv4Range(value, ipv4Value(String(base)), Number(prefix)));
}

function ipv4Value(address: string): number {
  return address
    .split(".")
    .map(Number)
    .reduce((value, part) => ((value << 8) | part) >>> 0, 0);
}

function inIpv4Range(value: number, base: number, prefix: number): boolean {
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (value & mask) === (base & mask);
}

function isPublicIpv6(address: string): boolean {
  const bytes = ipv6Bytes(address);
  if (!bytes) return false;
  const allZero = bytes.every((byte) => byte === 0);
  const loopback = bytes.slice(0, 15).every((byte) => byte === 0) && bytes[15] === 1;
  if (allZero || loopback) return false;

  const mappedV4 =
    bytes.slice(0, 10).every((byte) => byte === 0) && bytes[10] === 0xff && bytes[11] === 0xff;
  const compatibleV4 = bytes.slice(0, 12).every((byte) => byte === 0);
  if (mappedV4 || compatibleV4) {
    return isPublicIpv4(`${bytes[12]}.${bytes[13]}.${bytes[14]}.${bytes[15]}`);
  }
  if ((bytes[0]! & 0xfe) === 0xfc) return false; // fc00::/7 ULA
  if (bytes[0] === 0xfe && (bytes[1]! & 0xc0) === 0x80) return false; // fe80::/10 link-local
  if (bytes[0] === 0xff) return false; // multicast
  if (bytes[0] === 0x20 && bytes[1] === 0x01 && bytes[2] === 0x0d && bytes[3] === 0xb8) {
    return false; // documentation range
  }
  return true;
}

function ipv6Bytes(address: string): number[] | null {
  let value = unbracket(address).split("%")[0]!.toLowerCase();
  if (value.includes(".")) {
    const lastColon = value.lastIndexOf(":");
    if (lastColon < 0) return null;
    const ipv4 = value.slice(lastColon + 1);
    if (!isIP(ipv4)) return null;
    const parts = ipv4.split(".").map(Number);
    value = `${value.slice(0, lastColon)}:${((parts[0]! << 8) | parts[1]!).toString(16)}:${((parts[2]! << 8) | parts[3]!).toString(16)}`;
  }

  const pieces = value.split("::");
  if (pieces.length > 2) return null;
  const left = pieces[0] ? pieces[0].split(":") : [];
  const right = pieces.length === 2 && pieces[1] ? pieces[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if (missing < 0 || (pieces.length === 1 && missing !== 0)) return null;
  const groups = [...left, ...Array.from({ length: missing }, () => "0"), ...right];
  if (groups.length !== 8) return null;
  const bytes: number[] = [];
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
    const parsed = Number.parseInt(group, 16);
    bytes.push((parsed >> 8) & 0xff, parsed & 0xff);
  }
  return bytes;
}

function unbracket(value: string): string {
  return value.startsWith("[") && value.endsWith("]") ? value.slice(1, -1) : value;
}

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.floor(value)));
}
