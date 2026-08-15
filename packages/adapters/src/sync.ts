import { listPiCatalog } from "./pi-models.js";
import { ollamaModelIds } from "./ollama-provider.js";

export type EnvCredentialHint = {
  provider: string;
  label: string;
  envVar: string;
  apiKey: string;
  modelId?: string;
};

/**
 * Well-known environment variables used by CLIs and SDKs (Claude Code,
 * Codex CLI, llm, aichat, LangChain, …). Importing these lets everything the
 * user already pays for work in Rakazo immediately, with zero re-typing.
 * Keys are read from the host environment only, never written to disk here —
 * they are stored through the encrypted secret store like any pasted key.
 */
export const ENV_CREDENTIAL_SOURCES: Array<{
  envVar: string;
  provider: string;
  label: string;
  modelId?: string;
}> = [
  { envVar: "OPENROUTER_API_KEY", provider: "openrouter", label: "OpenRouter (env)" },
  { envVar: "ANTHROPIC_API_KEY", provider: "anthropic", label: "Anthropic (env)" },
  { envVar: "OPENAI_API_KEY", provider: "openai", label: "OpenAI (env)" },
  { envVar: "GEMINI_API_KEY", provider: "google", label: "Google Gemini (env)" },
  { envVar: "GOOGLE_API_KEY", provider: "google", label: "Google (env)" },
  { envVar: "XAI_API_KEY", provider: "xai", label: "xAI Grok (env)" },
  { envVar: "GROQ_API_KEY", provider: "groq", label: "Groq (env)" },
  { envVar: "DEEPSEEK_API_KEY", provider: "deepseek", label: "DeepSeek (env)" },
  { envVar: "MISTRAL_API_KEY", provider: "mistral", label: "Mistral (env)" },
  { envVar: "TOGETHER_API_KEY", provider: "together", label: "Together (env)" },
  { envVar: "CEREBRAS_API_KEY", provider: "cerebras", label: "Cerebras (env)" },
  { envVar: "FIREWORKS_API_KEY", provider: "fireworks", label: "Fireworks (env)" },
];

export function defaultModelForProvider(
  provider: string,
  catalog: Array<{ provider: string; id: string }> = listPiCatalog(),
): string | undefined {
  return catalog.find((entry) => entry.provider === provider)?.id;
}

/** Reads configured env keys. Only the provider/label is exposed to callers;
 * the key itself is returned solely so the caller can encrypt+persist it. */
export function detectEnvCredentials(
  source: NodeJS.ProcessEnv = process.env,
): EnvCredentialHint[] {
  const seen = new Set<string>();
  const hints: EnvCredentialHint[] = [];
  for (const entry of ENV_CREDENTIAL_SOURCES) {
    const key = source[entry.envVar]?.trim();
    if (!key || key.length < 8) continue;
    if (seen.has(entry.provider)) continue;
    seen.add(entry.provider);
    hints.push({
      provider: entry.provider,
      label: entry.label,
      envVar: entry.envVar,
      apiKey: key,
      modelId: entry.modelId ?? defaultModelForProvider(entry.provider),
    });
  }
  return hints;
}

export type LocalModelServer = {
  provider: "ollama";
  baseUrl: string;
  running: boolean;
  models: string[];
  error?: string;
};

export async function detectLocalModelServers(opts?: {
  baseUrl?: string;
  fetchFn?: typeof fetch;
  signal?: AbortSignal;
}): Promise<LocalModelServer[]> {
  const baseUrl = (opts?.baseUrl ?? "http://127.0.0.1:11434").replace(/\/+$/, "");
  try {
    const models = await ollamaModelIds(baseUrl, {
      fetchFn: opts?.fetchFn,
      signal: opts?.signal,
    });
    return [{ provider: "ollama", baseUrl, running: true, models }];
  } catch (error) {
    return [
      {
        provider: "ollama",
        baseUrl,
        running: false,
        models: [],
        error: error instanceof Error ? error.message : "Ollama is not reachable",
      },
    ];
  }
}
