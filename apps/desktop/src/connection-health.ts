import { localApiHealthUrl } from "./connection.js";
import type { ApiReachability, WebReachability } from "./recovery-page.js";

export interface ConnectionHealth {
  webStatus: WebReachability;
  apiStatus: ApiReachability;
}

export interface ProbeResponse {
  ok: boolean;
  json(): Promise<unknown>;
}

export type ProbeFetch = (
  url: string,
  init: { signal: AbortSignal; redirect: "manual" },
) => Promise<ProbeResponse>;

async function webReachability(
  url: string,
  fetcher: ProbeFetch,
  timeoutMs: number,
): Promise<WebReachability> {
  try {
    await fetcher(url, { signal: AbortSignal.timeout(timeoutMs), redirect: "manual" });
    return "online";
  } catch {
    return "offline";
  }
}

async function apiReachability(
  url: string,
  fetcher: ProbeFetch,
  timeoutMs: number,
): Promise<ApiReachability> {
  try {
    const response = await fetcher(url, {
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "manual",
    });
    if (!response.ok) return "offline";
    const payload = await response.json();
    return payload && typeof payload === "object" && (payload as { ok?: unknown }).ok === true
      ? "online"
      : "offline";
  } catch {
    return "offline";
  }
}

export async function probeConnectionHealth(
  webUrl: string,
  fetcher: ProbeFetch = fetch,
  timeoutMs = 2500,
): Promise<ConnectionHealth> {
  const apiUrl = localApiHealthUrl(webUrl);
  const [webStatus, apiStatus] = await Promise.all([
    webReachability(webUrl, fetcher, timeoutMs),
    apiUrl
      ? apiReachability(apiUrl, fetcher, timeoutMs)
      : Promise.resolve<ApiReachability>("not-applicable"),
  ]);

  return { webStatus, apiStatus };
}
