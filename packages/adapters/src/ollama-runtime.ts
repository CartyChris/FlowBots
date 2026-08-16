import { OLLAMA_PROVIDER_ID, ollamaOpenAiBaseUrl } from "./ollama-provider.js";

export function ollamaRuntimeModel(
  modelId: string,
  source: NodeJS.ProcessEnv = process.env,
) {
  return {
    id: modelId,
    name: modelId,
    api: "openai-completions",
    provider: OLLAMA_PROVIDER_ID,
    baseUrl: ollamaOpenAiBaseUrl(source),
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 32768,
    maxTokens: 8192,
  } as never;
}
