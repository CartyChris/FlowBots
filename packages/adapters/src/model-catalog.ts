import { ollamaModelIds } from "./ollama-provider.js";
import type { PiCatalogEntry } from "./pi-models.js";

export interface LiveModelCatalogOptions {
  staticCatalog: readonly PiCatalogEntry[];
  ollamaBaseUrl?: string | null;
  xaiApiKey?: string;
  fetchFn?: typeof fetch;
  signal?: AbortSignal;
}

export async function liveModelCatalog(
  options: LiveModelCatalogOptions,
): Promise<PiCatalogEntry[]> {
  const base = options.staticCatalog.map((entry) => ({ ...entry }));
  const discovered: PiCatalogEntry[] = [];

  const [ollamaIds, xaiIds] = await Promise.all([
    options.ollamaBaseUrl
      ? ollamaModelIds(options.ollamaBaseUrl, {
          fetchFn: options.fetchFn,
          signal: options.signal,
        }).catch(() => [])
      : Promise.resolve([]),
    options.xaiApiKey
      ? xaiLanguageModelIds(options.xaiApiKey, {
          fetchFn: options.fetchFn,
          signal: options.signal,
        }).catch(() => [])
      : Promise.resolve([]),
  ]);

  for (const id of ollamaIds) {
    discovered.push({
      provider: "ollama",
      providerName: "Ollama (local)",
      id,
      label: id,
      billing: "Runs locally through Ollama on this computer. No API key or hosted model charge.",
      auth: "api-key",
      subscription: false,
    });
  }

  for (const id of xaiIds) {
    discovered.push({
      provider: "xai",
      providerName: "xAI",
      id,
      label: id,
      billing:
        "Uses your xAI credential. FlowBots refreshes this list from the models available to your account.",
      auth: "api-key",
      subscription: false,
    });
  }

  const seen = new Set<string>();
  return [...base, ...discovered].filter((entry) => {
    const key = `${entry.provider}\0${entry.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function xaiLanguageModelIds(
  apiKey: string,
  options: { fetchFn?: typeof fetch; signal?: AbortSignal } = {},
): Promise<string[]> {
  const fetchFn = options.fetchFn ?? fetch;
  const response = await fetchFn("https://api.x.ai/v1/language-models", {
    method: "GET",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    signal: options.signal ?? AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error(`xAI model discovery answered ${response.status}`);
  const payload = (await response.json()) as {
    models?: Array<{ id?: unknown; aliases?: unknown }>;
  };
  const ids = new Set<string>();
  for (const model of payload.models ?? []) {
    if (typeof model.id === "string" && model.id.trim()) ids.add(model.id.trim());
    if (Array.isArray(model.aliases)) {
      for (const alias of model.aliases) {
        if (typeof alias === "string" && alias.trim()) ids.add(alias.trim());
      }
    }
  }
  return [...ids].sort((a, b) => a.localeCompare(b));
}
