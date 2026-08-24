import { safeWebFetch, type WebFetchInput, type WebFetchResult } from "./web-fetch.js";

export interface WebSearchInput {
  query: string;
  maxResults?: number;
  recencyDays?: number;
}

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  source: "duckduckgo" | "bing";
}

type SearchFetch = (input: WebFetchInput) => Promise<WebFetchResult>;

export async function keylessWebSearch(
  input: WebSearchInput,
  options: { fetch?: SearchFetch; signal?: AbortSignal } = {},
): Promise<WebSearchResult[]> {
  const query = input.query.trim();
  if (!query) throw new Error("web_search requires a query");
  const maxResults = clampInteger(input.maxResults ?? 6, 1, 10);
  const recencyDays = input.recencyDays
    ? clampInteger(input.recencyDays, 1, 3650)
    : undefined;
  const searchQuery = recencyDays ? `${query} past ${recencyDays} days` : query;
  const fetcher: SearchFetch =
    options.fetch ??
    ((request) => safeWebFetch(request, { signal: options.signal }));

  let duckError: unknown;
  try {
    const duck = await fetcher({
      url: `https://html.duckduckgo.com/html/?q=${encodeURIComponent(searchQuery)}`,
      maxChars: 160_000,
      extract: "raw",
    });
    const results = parseDuckDuckGoResults(duck.text, maxResults);
    if (results.length) return results;
  } catch (error) {
    duckError = error;
  }

  try {
    const bing = await fetcher({
      url: `https://www.bing.com/search?format=rss&q=${encodeURIComponent(searchQuery)}`,
      maxChars: 160_000,
      extract: "raw",
    });
    return parseBingRssResults(bing.text, maxResults);
  } catch (error) {
    const duckMessage = duckError instanceof Error ? duckError.message : String(duckError ?? "no results");
    const bingMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`web_search failed via DuckDuckGo (${duckMessage}) and Bing (${bingMessage})`);
  }
}

export function parseDuckDuckGoResults(html: string, maxResults = 6): WebSearchResult[] {
  const results: WebSearchResult[] = [];
  const seen = new Set<string>();
  const rowPattern = /<div\b[^>]*class=["'][^"']*\bresult\b[^"']*["'][^>]*>([\s\S]*?)(?=<div\b[^>]*class=["'][^"']*\bresult\b|<\/body>|$)/gi;
  for (const row of html.matchAll(rowPattern)) {
    const block = row[1] ?? "";
    const anchor = block.match(/<a\b[^>]*class=["'][^"']*result__a[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
    if (!anchor) continue;
    const url = normalizeDuckDuckGoUrl(decodeHtmlEntities(anchor[1] ?? ""));
    if (!url || seen.has(url)) continue;
    const snippetMatch = block.match(/<[^>]+class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\//i);
    results.push({
      title: cleanMarkup(anchor[2] ?? ""),
      url,
      snippet: cleanMarkup(snippetMatch?.[1] ?? "").slice(0, 1000),
      source: "duckduckgo",
    });
    seen.add(url);
    if (results.length >= clampInteger(maxResults, 1, 10)) break;
  }
  return results;
}

export function parseBingRssResults(xml: string, maxResults = 6): WebSearchResult[] {
  const results: WebSearchResult[] = [];
  const seen = new Set<string>();
  const itemPattern = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  for (const item of xml.matchAll(itemPattern)) {
    const block = item[1] ?? "";
    const title = xmlValue(block, "title");
    const rawUrl = xmlValue(block, "link");
    const snippet = xmlValue(block, "description");
    const url = normalizePublicResultUrl(rawUrl);
    if (!title || !url || seen.has(url)) continue;
    results.push({
      title: cleanMarkup(title),
      url,
      snippet: cleanMarkup(snippet).slice(0, 1000),
      source: "bing",
    });
    seen.add(url);
    if (results.length >= clampInteger(maxResults, 1, 10)) break;
  }
  return results;
}

function normalizeDuckDuckGoUrl(raw: string): string | null {
  let candidate = raw.trim();
  if (candidate.startsWith("//")) candidate = `https:${candidate}`;
  try {
    const url = new URL(candidate);
    if (url.hostname === "duckduckgo.com" || url.hostname.endsWith(".duckduckgo.com")) {
      const target = url.searchParams.get("uddg");
      if (target) return normalizePublicResultUrl(target);
    }
    return normalizePublicResultUrl(url.toString());
  } catch {
    return null;
  }
}

function normalizePublicResultUrl(raw: string): string | null {
  try {
    const url = new URL(decodeHtmlEntities(raw.trim()));
    if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function xmlValue(block: string, tag: string): string {
  const match = block.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return decodeHtmlEntities(match?.[1] ?? "");
}

function cleanMarkup(value: string): string {
  return decodeHtmlEntities(value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
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

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.floor(value)));
}
