import { readFile, writeFile } from "node:fs/promises";

async function replaceOnce(file, before, after) {
  const source = await readFile(file, "utf8");
  const first = source.indexOf(before);
  const second = first < 0 ? -1 : source.indexOf(before, first + before.length);
  if (first < 0 || second >= 0) {
    throw new Error(`${file}: expected exactly one wiring anchor; first=${first}, second=${second}`);
  }
  await writeFile(file, source.slice(0, first) + after + source.slice(first + before.length));
}

const runtime = "packages/adapters/src/pi-runtime.ts";
await replaceOnce(
  runtime,
  'import { builtinAgentTools, DELEGATION_TOOL_NAMES } from "./builtin-tools.js";\n',
  'import { builtinAgentTools, DELEGATION_TOOL_NAMES } from "./builtin-tools.js";\nimport {\n  externalRuntimeModel,\n  externalStreamSimple,\n  G0DM0D3_PROVIDER_ID,\n  providerEnvironmentApiKey,\n  VENICE_PROVIDER_ID,\n} from "./external-models.js";\n',
);
await replaceOnce(
  runtime,
  `        const models = modelsForRequest(request, provider);\n        const model =\n          provider === OLLAMA_PROVIDER_ID\n            ? ollamaRuntimeModel(modelId)\n            : (models.getModel(provider, modelId) ?? models.getModel("openrouter", modelId));`,
  `        const models = modelsForRequest(request, provider);\n        const model =\n          externalRuntimeModel(provider, modelId) ??\n          (provider === OLLAMA_PROVIDER_ID\n            ? ollamaRuntimeModel(modelId)\n            : (models.getModel(provider, modelId) ?? models.getModel("openrouter", modelId)));`,
);
await replaceOnce(
  runtime,
  `        const apiKey =\n          provider === OLLAMA_PROVIDER_ID\n            ? "ollama"\n            : request.model.oauth\n              ? undefined\n              : (request.model.apiKey ?? process.env.OPENROUTER_API_KEY);`,
  `        const apiKey =\n          provider === OLLAMA_PROVIDER_ID\n            ? "ollama"\n            : request.model.oauth\n              ? undefined\n              : (request.model.apiKey ?? providerEnvironmentApiKey(provider));`,
);
await replaceOnce(
  runtime,
  `function streamModel(models: Models, model: Model<Api>, context: Parameters<Models["streamSimple"]>[1], options: Parameters<Models["streamSimple"]>[2]) {\n  return model.provider === OLLAMA_PROVIDER_ID\n    ? ollamaStreamSimple(model as never, context, options)\n    : models.streamSimple(model, context, options);\n}`,
  `function streamModel(models: Models, model: Model<Api>, context: Parameters<Models["streamSimple"]>[1], options: Parameters<Models["streamSimple"]>[2]) {\n  if (model.provider === OLLAMA_PROVIDER_ID) {\n    return ollamaStreamSimple(model as never, context, options);\n  }\n  if (model.provider === VENICE_PROVIDER_ID || model.provider === G0DM0D3_PROVIDER_ID) {\n    return externalStreamSimple(model as never, context, options);\n  }\n  return models.streamSimple(model, context, options);\n}`,
);

const executor = "packages/adapters/src/executor.ts";
await replaceOnce(
  executor,
  'import { inferScript } from "./scripted-runtime.js";\n',
  'import { G0DM0D3_PROVIDER_ID, isG0dm0d3Reachable } from "./external-models.js";\nimport { orderedResearchCredentials, type RouteCredential } from "./research-routing.js";\nimport { inferScript } from "./scripted-runtime.js";\n',
);
await replaceOnce(
  executor,
  `export function createRunExecutor(deps: ExecutorDeps) {`,
  `async function selectRunModelCredential<T extends RouteCredential>(\n  prompt: string,\n  credentials: readonly T[],\n): Promise<T | undefined> {\n  const ordered = orderedResearchCredentials(prompt, credentials);\n  for (const credential of ordered) {\n    if (credential.provider !== G0DM0D3_PROVIDER_ID) return credential;\n    if (await isG0dm0d3Reachable()) return credential;\n  }\n  return ordered.at(-1);\n}\n\nexport function createRunExecutor(deps: ExecutorDeps) {`,
);
await replaceOnce(
  executor,
  `        const [bot, thread, messages, task, connectedPlugins, credential, settings] =\n          await Promise.all([`,
  `        const [bot, thread, messages, task, connectedPlugins, credentials, settings] =\n          await Promise.all([`,
);
await replaceOnce(
  executor,
  `            deps.prisma.userModelCredential.findFirst({\n              where: { userId: run.userId, workspaceId: run.workspaceId, isDefault: true },\n            }),`,
  `            deps.prisma.userModelCredential.findMany({\n              where: { userId: run.userId, workspaceId: run.workspaceId },\n              orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],\n            }),`,
);
await replaceOnce(
  executor,
  `        const resolved = await resolveModelKey(deps, run.userId, run.workspaceId, credential);\n        const runSecrets = [...deps.secrets, ...resolved.redact];`,
  `        const credential = await selectRunModelCredential(task.prompt, credentials);\n        const selectedModelProvider =\n          credential?.provider ?? settings?.defaultModelProvider ?? "scripted";\n        const selectedModelId = credential?.defaultModel ?? settings?.defaultModelId ?? "scripted";\n        await deps.prisma.run.updateMany({\n          where: { id: runId, status: "running", leaseOwner: workerId, leaseFence: fence },\n          data: { modelProvider: selectedModelProvider, modelId: selectedModelId },\n        });\n        const resolved = await resolveModelKey(deps, run.userId, run.workspaceId, credential);\n        const runSecrets = [...deps.secrets, ...resolved.redact];`,
);
await replaceOnce(
  executor,
  `              model: {\n                provider: credential?.provider ?? settings?.defaultModelProvider ?? "scripted",\n                id: credential?.defaultModel ?? settings?.defaultModelId ?? "scripted",`,
  `              model: {\n                provider: selectedModelProvider,\n                id: selectedModelId,`,
);

console.log("FlowBots research-provider runtime/executor wiring applied.");
