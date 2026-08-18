import type { Context, Model, Provider, SimpleStreamOptions } from "@earendil-works/pi-ai";
import { streamSimple } from "@earendil-works/pi-ai/api/openai-completions";

export const OLLAMA_PROVIDER_ID = "ollama";
export const OLLAMA_DEFAULT_BASE_URL = "http://127.0.0.1:11434";

type OllamaModelTag = {
  name: string;
  details?: { parameter_size?: string };
};

export function ollamaBaseUrl(source: NodeJS.ProcessEnv = process.env): string {
  const raw = source.OLLAMA_BASE_URL?.trim() || OLLAMA_DEFAULT_BASE_URL;
  return raw.replace(/\/+$/, "");
}

export function ollamaOpenAiBaseUrl(source: NodeJS.ProcessEnv = process.env): string {
  return `${ollamaBaseUrl(source)}/v1`;
}

export function ollamaStreamSimple(
  model: Model<never>,
  context: Context,
  options?: SimpleStreamOptions,
) {
  return streamSimple(model, context, {
    ...options,
    apiKey: options?.apiKey ?? "ollama",
  } as never);
}

export function ollamaProvider(baseUrl: string): Provider {
  const url = baseUrl.replace(/\/+$/, "");
  const openAiBaseUrl = `${url}/v1`;
  return {
    id: OLLAMA_PROVIDER_ID,
    name: "Ollama (local)",
    baseUrl: openAiBaseUrl,
    auth: {
      apiKey: {
        name: "No key needed — runs on this machine",
        async resolve() {
          return { apiKey: "ollama" };
        },
      },
    },
    models: [],
    api: {
      streamSimple: (model: Model<never>, context: Context, options?: SimpleStreamOptions) =>
        ollamaStreamSimple({ ...model, baseUrl: openAiBaseUrl } as never, context, options),
      stream: () => {
        throw new Error("Ollama provider streams via streamSimple only.");
      },
    },
  } as unknown as Provider;
}

export async function ollamaModelIds(
  baseUrl: string,
  opts?: { signal?: AbortSignal; fetchFn?: typeof fetch },
): Promise<string[]> {
  const fetcher = opts?.fetchFn ?? fetch;
  const response = await fetcher(`${baseUrl.replace(/\/+$/, "")}/api/tags`, {
    signal: opts?.signal ?? AbortSignal.timeout(3000),
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error(`Ollama answered ${response.status} at ${baseUrl}`);
  const body = (await response.json()) as { models?: OllamaModelTag[] };
  return (body.models ?? [])
    .map((model) => model.name)
    .filter((name): name is string => typeof name === "string" && name.length > 0)
    .sort();
}
