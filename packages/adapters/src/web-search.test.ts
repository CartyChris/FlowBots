import { describe, expect, it, vi } from "vitest";
import { keylessWebSearch, parseBingRssResults, parseDuckDuckGoResults } from "./web-search.js";

const duckHtml = `
<html><body>
  <div class="result">
    <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Frelease">Example Release</a>
    <a class="result__snippet">Latest release notes and changes.</a>
  </div>
  <div class="result">
    <a class="result__a" href="https://example.org/news">Example News</a>
    <a class="result__snippet">A current update.</a>
  </div>
</body></html>`;

const bingRss = `<?xml version="1.0"?>
<rss><channel>
  <item><title>Fallback Result</title><link>https://fallback.example/item</link><description>Fallback snippet.</description></item>
  <item><title>Duplicate</title><link>https://fallback.example/item</link><description>Duplicate row.</description></item>
</channel></rss>`;

describe("keyless web search", () => {
  it("normalizes DuckDuckGo HTML results into bounded public result records", () => {
    expect(parseDuckDuckGoResults(duckHtml, 10)).toEqual([
      {
        title: "Example Release",
        url: "https://example.com/release",
        snippet: "Latest release notes and changes.",
        source: "duckduckgo",
      },
      {
        title: "Example News",
        url: "https://example.org/news",
        snippet: "A current update.",
        source: "duckduckgo",
      },
    ]);
  });

  it("parses and deduplicates Bing RSS fallback results", () => {
    expect(parseBingRssResults(bingRss, 10)).toEqual([
      {
        title: "Fallback Result",
        url: "https://fallback.example/item",
        snippet: "Fallback snippet.",
        source: "bing",
      },
    ]);
  });

  it("uses DuckDuckGo first and falls back to Bing without API keys", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({
        url: "https://html.duckduckgo.com/html/?q=test",
        status: 200,
        contentType: "text/html",
        text: "no useful result markup",
        truncated: false,
      })
      .mockResolvedValueOnce({
        url: "https://www.bing.com/search?format=rss&q=test",
        status: 200,
        contentType: "application/rss+xml",
        text: bingRss,
        truncated: false,
      });

    const results = await keylessWebSearch({ query: "test", maxResults: 3 }, { fetch });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(results).toHaveLength(1);
    expect(results[0]?.source).toBe("bing");
    expect(results[0]?.url).toBe("https://fallback.example/item");
  });

  it("caps requested result count and rejects an empty query", async () => {
    await expect(keylessWebSearch({ query: "  " })).rejects.toThrow(/query/i);

    const fetch = vi.fn().mockResolvedValue({
      url: "https://html.duckduckgo.com/html/?q=test",
      status: 200,
      contentType: "text/html",
      text: duckHtml,
      truncated: false,
    });
    const results = await keylessWebSearch({ query: "test", maxResults: 1 }, { fetch });
    expect(results).toHaveLength(1);
  });
});
