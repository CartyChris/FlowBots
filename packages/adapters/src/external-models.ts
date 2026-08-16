import type { Context, Model, SimpleStreamOptions } from "@earendil-works/pi-ai";
import { streamSimple } from "@earendil-works/pi-ai/api/openai-completions";
import type { PiCatalogEntry } from "./pi-models.js";

export const VENICE_PROVIDER_ID = "venice";
export const VENICE_BASE_URL = "https://api.venice.ai/api/v1";
export const G0DM0D3_PROVIDER_ID = "g0dm0d3";
export const G0DM0D3_DEFAULT_BASE_URL = "http://127.0.0.1:7860/v1";

const EXTERNAL_CATALOG: PiCatalogEntry[] = [
  {
    provider: VENICE_PROVIDER_ID,
    providerName: "Venice AI",
    id: "venice-uncensored",
    label: "Venice Uncensored",
    billing: "Uses your Venice API key. Private high-control text model; charges are billed by Venice.",
    auth: "api-key",
    subscription: false,
  },
  {
    provider: VENICE_PROVIDER_ID,
    providerName: "Venice AI",
    id: "zai-org-glm-5-1",
    label: "GLM 5.1 via Venice",
    billing: "Uses your Venice API key. Charges are billed by Venice.",
    auth: "api-key",
    subscription: false,
  },
  {
    provider: G0DM0D3_PROVIDER_ID,
    providerName: "Pliny G0DM0D3",
    id: "ultraplinian/fast",
    label: "ULTRAPLINIAN Fast",
    billing:
      "Connects to your G0DM0D3 Research Preview API. The server must have upstream model access configured.",
    auth: "api-key",
    subscription: false,
  },
  {
    provider: G0DM0D3_PROVIDER_ID,
    providerName: "Pliny G0DM0D3",
    id: "ultraplinian/standard",
    label: "ULTRAPLINIAN Standard",
    billing:
      "Connects to your G0DM0D3 Research Preview API. Pro tier may be required; upstream model usage is separate.",
    auth: "api-key",
    subscription: false,
  },
  {
    provider: G0DM0D3_PROVIDER_ID,
    providerName: "Pliny G0DM0D3",
    id: "consortium/fast",
    label: "CONSORTIUM Fast",
    billing:
      "Connects to your G0DM0D3 Research Preview API for multi-model synthesis; upstream model usage is separate.",
    auth: "api-key",
    subscription: false,
  },
];

export function externalCatalogEntries(): PiCatalogEntry[] {
  return EXTERNAL_CATALOG.map((entry) => ({ ...entry }));
}

export function providerEnvironmentApiKey(
  provider: string,
  source: NodeJS.ProcessEnv = process.env,
): string | undefined {
  if (provider === VENICE_PROVIDER_ID) return source.VENICE_API_KEY?.trim() || undefined;
  if (provider === G0DM0D3_PROVIDER_ID) return source.GODMODE_API_KEY?.trim() || undefined;
  return source.OPENROUTER_API_KEY?.trim() || undefined;
}

export function g0dm0d3BaseUrl(source: NodeJS.ProcessEnv = process.env): string {
  const raw = source.GODMODE_BASE_URL?.trim() || G0DM0D3_DEFAULT_BASE_URL;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("GODMODE_BASE_URL must be a valid http(s) URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("GODMODE_BASE_URL must use http or https.");
  }
  if (url.username || url.password) {
    throw new Error("GODMODE_BASE_URL must not contain embedded credentials.");
  }
  if (url.search || url.hash) {
    throw new Error("GODMODE_BASE_URL must not contain a query string or fragment.");
  }
  const pathname = url.pathname.replace(/\/+$/, "");
  url.pathname = pathname.endsWith("/v1") ? pathname : `${pathname}/v1`;
  return url.toString().replace(/\/$/, "");
}

export function g0dm0d3HealthUrl(source: NodeJS.ProcessEnv = process.env): string {
  return `${g0dm0d3BaseUrl(source)}/health`;
}

export function externalRuntimeModel(
  provider: string,
  modelId: string,
  source: NodeJS.ProcessEnv = process.env,
): Model<never> | undefined {
  if (provider === VENICE_PROVIDER_ID) {
    return {
      id: modelId,
      name: modelId,
      api: "openai-completions",
      provider,
      baseUrl: VENICE_BASE_URL,
      reasoning: false,
      input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: modelId === "venice-uncensored" ? 128_000 : 200_000,
      maxTokens: 16_384,
      compat: {
        supportsDeveloperRole: false,
        supportsReasoningEffort: false,
      },
    } as unknown as Model<never>;
  }
  if (provider === G0DM0D3_PROVIDER_ID) {
    return {
      id: modelId,
      name: modelId,
      api: "openai-completions",
      provider,
      baseUrl: g0dm0d3BaseUrl(source),
      reasoning: false,
      input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 128_000,
      maxTokens: 16_384,
      compat: {
        supportsDeveloperRole: false,
        supportsReasoningEffort: false,
        maxTokensField: "max_tokens",
      },
    } as unknown as Model<never>;
  }
  return undefined;
}

export function externalStreamSimple(
  model: Model<never>,
  context: Context,
  options?: SimpleStreamOptions,
) {
  return streamSimple(model, context, options as never);
}

export async function isG0dm0d3Reachable(opts?: {
  source?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
  fetchFn?: typeof fetch;
}): Promise<boolean> {
  const fetcher = opts?.fetchFn ?? fetch;
  try {
    const response = await fetcher(g0dm0d3HealthUrl(opts?.source ?? process.env), {
      method: "GET",
      headers: { accept: "application/json" },
      signal: opts?.signal ?? AbortSignal.timeout(1500),
    });
    return response.ok;
  } catch {
    return false;
  }
}
