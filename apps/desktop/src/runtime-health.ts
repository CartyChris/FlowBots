import type { RuntimeMode } from "./runtime-profile.js";

export interface RuntimeHealthTarget {
  mode: RuntimeMode;
  origin: string;
}

export interface RuntimeProbeResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

export type RuntimeProbeFetch = (
  url: string,
  init: { signal: AbortSignal; redirect: "manual" },
) => Promise<RuntimeProbeResponse>;

export type RuntimeHealthResult = { ok: true } | { ok: false; error: string };

export async function probeRuntimeOrigin(
  target: RuntimeHealthTarget,
  fetcher: RuntimeProbeFetch = fetch,
  timeoutMs = 2500,
): Promise<RuntimeHealthResult> {
  const origin = target.origin.replace(/\/+$/, "");
  const url = target.mode === "lite" ? `${origin}/health` : origin;

  try {
    const response = await fetcher(url, {
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "manual",
    });

    if (target.mode === "lite") {
      if (!response.ok) {
        return { ok: false, error: "Lite runtime health check failed before navigation." };
      }
      const payload = await response.json().catch(() => null);
      if (
        !payload ||
        typeof payload !== "object" ||
        (payload as { ok?: unknown }).ok !== true ||
        (payload as { jobs?: unknown }).jobs !== "memory" ||
        (payload as { sandbox?: unknown }).sandbox !== "desktop"
      ) {
        return {
          ok: false,
          error:
            "Lite runtime is reachable but did not report the required memory jobs and desktop sandbox topology.",
        };
      }
      return { ok: true };
    }

    if (response.status >= 500) {
      return {
        ok: false,
        error: `The selected Rakazo server responded with HTTP ${response.status}.`,
      };
    }
    return { ok: true };
  } catch {
    return {
      ok: false,
      error: "Could not reach the selected Rakazo runtime. Check that it is running and try again.",
    };
  }
}
