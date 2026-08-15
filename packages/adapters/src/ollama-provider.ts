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

/**
 * A keyless local provider. Ollama speaks the OpenAI chat-completions wire
 * format at /v1, so the built-in completions stream handles everything.
 * Models are fetched live from the running server in `ollamaModelIds`.
 */
export function ollamaProvider(baseUrl: string): Provider {
  const url = baseUrl.replace(/\/+$/, "");
  return {
    id: OLLAMA_PROVIDER_ID,
    name: "Ollama (local)",
    baseUrl: `${url}/v1`,
    auth: {
      apiKey: {
        name: "No key needed — runs on this machine",
        async resolve() {
          // Ollama ignores the Authorization header, but the completions
          // client requires a key to be present.
          return { apiKey: "ollama" };
        },
      },
    },
    models: [],
    api: {
      streamSimple: (model: Model<never>, context: Context, options?: SimpleStreamOptions) =>
        streamSimple(
          model as never,
          context,
          ({ ...options, apiKey: options?.apiKey ?? "ollama" }) as never,
        ),
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
    .sort((a, b) => a.localeCompare(b));
}
