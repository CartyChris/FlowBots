import { routineWakeupJob, type JobPublisher } from "@rakazo/adapter-kit";
import type {
  ActivityEvent,
  AgentRunRequest,
  AgentRuntime,
  AppEvent,
  ArtifactStore,
  ComposioConnector,
  ControlAction,
  MessageBlock,
  RunStatus,
  Sandbox,
  SandboxRuntimeInfo,
} from "@rakazo/contracts";
import { EVENT_TYPES } from "@rakazo/contracts";
import { decryptCredential } from "./secrets.js";
import { G0DM0D3_PROVIDER_ID, isG0dm0d3Reachable } from "./external-models.js";
import { orderedResearchCredentials, type RouteCredential } from "./research-routing.js";
import { inferScript } from "./scripted-runtime.js";
import { builtinAgentTools, type BuiltinAgentTool } from "./builtin-tools.js";
import { ensureUserComputer } from "./computer-tools.js";
import { createPiMcpServers } from "./mcp-client.js";

export type RunContext = {
  runId: string;
  userId: string;
  workspaceId: string;
  threadId: string;
};

export type RunExecutor = {
  execute(runId: string): Promise<void>;
  requestCancel(runId: string): Promise<void>;
  completeRun(runId: string, status: RunStatus, error?: string): Promise<void>;
};

type RunRecord = {
  id: string;
  userId: string;
  workspaceId: string;
  threadId: string;
  status: string;
  leaseOwner: string | null;
  leaseFence: number | null;
};

export type ExecutorDeps = {
  prisma: any;
  events: { appendEvent: (input: any) => Promise<AppEvent> };
  activity?: { appendActivity?: (input: any) => Promise<ActivityEvent> };
  realtime?: { publish?: (event: AppEvent) => void };
  sandbox: Sandbox;
  artifactStore: ArtifactStore;
  composio?: ComposioConnector;
  agentRuntime?: AgentRuntime;
  secrets: string[];
  credentialKey?: string;
  computer?: { resolve?: (userId: string) => Promise<SandboxRuntimeInfo> };
  now?: () => Date;
};

const GRAPHICAL_AGENT_TOOLS = new Set(["computer"]);

export async function deferFutureRoutine(
  jobs: JobPublisher,
  routineId: string,
  scheduledAt: Date,
): Promise<boolean> {
  if (!routineId.trim()) throw new Error("routineId is required");
  const timestamp = scheduledAt.getTime();
  if (!Number.isFinite(timestamp) || timestamp <= Date.now()) return false;
  await jobs.enqueue(routineWakeupJob(routineId, scheduledAt));
  return true;
}

async function selectRunModelCredential<T extends RouteCredential>(
  prompt: string,
  credentials: readonly T[],
): Promise<T | undefined> {
  const ordered = orderedResearchCredentials(prompt, credentials);
  for (const credential of ordered) {
    if (credential.provider !== G0DM0D3_PROVIDER_ID) return credential;
    if (await isG0dm0d3Reachable()) return credential;
  }
  return ordered.at(-1);
}

export function createRunExecutor(deps: ExecutorDeps): RunExecutor {
  const now = deps.now ?? (() => new Date());
  let workerCounter = 0;

  async function completeRun(runId: string, status: RunStatus, error?: string) {
    await deps.prisma.run.update({
      where: { id: runId },
      data: {
        status,
        ...(status === "running" ? {} : { finishedAt: now() }),
        ...(error ? { error } : {}),
      },
    });
  }

  async function execute(runId: string) {
    const workerId = `executor:${process.pid}:${++workerCounter}`;
    const lease = await deps.prisma.$transaction(async (tx: any) => {
      const current = (await tx.run.findUnique({ where: { id: runId } })) as RunRecord | null;
      if (!current || !["queued", "running"].includes(current.status)) return null;
      const fence = (current.leaseFence ?? 0) + 1;
      const claimed = await tx.run.updateMany({
        where: {
          id: runId,
          status: current.status,
          leaseFence: current.leaseFence,
        },
        data: {
          status: "running",
          startedAt: current.status === "queued" ? now() : undefined,
          leaseOwner: workerId,
          leaseFence: fence,
        },
      });
      if (!claimed.count) return null;
      return { ...current, status: "running", leaseOwner: workerId, leaseFence: fence };
    });
    if (!lease) return;

    const run = lease as RunRecord;
    const fence = run.leaseFence as number;
    const context: RunContext = {
      runId: run.id,
      userId: run.userId,
      workspaceId: run.workspaceId,
      threadId: run.threadId,
    };

    try {
      const task = await deps.prisma.task.findFirst({ where: { runId } });
      if (!task) throw new Error(`run ${runId} has no task`);
      const bot = await deps.prisma.bot.findUnique({ where: { id: task.botId } });
      if (!bot) throw new Error(`bot ${task.botId} not found`);

      await deps.events.appendEvent({
        type: EVENT_TYPES.RUN_STARTED,
        userId: run.userId,
        workspaceId: run.workspaceId,
        threadId: run.threadId,
        runId,
        payload: { runId },
      });

      const [thread, messages, connectedPlugins, credentials, settings] = await Promise.all([
        deps.prisma.thread.findUnique({ where: { id: run.threadId } }),
        deps.prisma.message.findMany({ where: { threadId: run.threadId }, orderBy: { createdAt: "asc" } }),
        deps.prisma.connectedPlugin.findMany({
          where: { userId: run.userId, workspaceId: run.workspaceId, status: "connected" },
        }),
        deps.prisma.userModelCredential.findMany({
          where: { userId: run.userId, workspaceId: run.workspaceId },
          orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
        }),
        deps.prisma.userSetting.findUnique({
          where: { userId_workspaceId: { userId: run.userId, workspaceId: run.workspaceId } },
        }),
      ]);
      if (!thread) throw new Error(`thread ${run.threadId} not found`);

      const input = messages.map((m: any) => ({
        role: (m.role === "user" ? "user" : m.role === "system" ? "system" : "assistant") as
          | "user"
          | "assistant"
          | "system",
        content: blocksToText(m.blocks as MessageBlock[]),
      }));
      const credential = await selectRunModelCredential(task.prompt, credentials);
      const selectedModelProvider =
        credential?.provider ?? settings?.defaultModelProvider ?? "scripted";
      const selectedModelId = credential?.defaultModel ?? settings?.defaultModelId ?? "scripted";
      await deps.prisma.run.updateMany({
        where: { id: runId, status: "running", leaseOwner: workerId, leaseFence: fence },
        data: { modelProvider: selectedModelProvider, modelId: selectedModelId },
      });
      const resolved = await resolveModelKey(
        deps,
        run.userId,
        run.workspaceId,
        credential ?? null,
      );
      const runSecrets = [...deps.secrets, ...resolved.redact];
      const computer = await ensureComputer(deps, bot.id, context);
      const graphical =
        computer.kind !== "desktop" && deps.sandbox.describe().capabilities.graphical;
      const builtins = graphical
        ? builtinAgentTools
        : builtinAgentTools.filter((tool) => !GRAPHICAL_AGENT_TOOLS.has(tool.name));
      const tools = [
        ...builtins,
        ...(deps.composio
          ? await deps.composio.getTools({
              userId: run.userId,
              workspaceId: run.workspaceId,
              connectedPlugins,
            })
          : []),
      ];
      const request: AgentRunRequest = {
        runId,
        userId: run.userId,
        workspaceId: run.workspaceId,
        threadId: run.threadId,
        bot: {
          id: bot.id,
          name: bot.name,
          systemPrompt: bot.systemPrompt,
        },
        messages: input,
        model: {
          provider: selectedModelProvider,
          id: selectedModelId,
          apiKey: resolved.apiKey,
          oauth: resolved.oauth,
        },
        tools,
        sandbox: deps.sandbox,
        mcpServers: await createPiMcpServers({
          userId: run.userId,
          workspaceId: run.workspaceId,
          connectedPlugins,
          composio: deps.composio,
        }),
        secrets: runSecrets,
      };

      const runtime = deps.agentRuntime;
      if (runtime) {
        const result = await runtime.run(request, {
          onEvent: async (event) => {
            await handleAgentEvent(deps, context, event, fence, workerId);
          },
          signal: undefined,
        });
        await appendAssistantMessage(deps, context, result.text || "", runSecrets);
        await finalizeRun(deps, context, result.status, fence, workerId);
      } else {
        const script = inferScript(task.prompt);
        for (const step of script) {
          await handleAgentEvent(deps, context, step, fence, workerId);
        }
        await appendAssistantMessage(deps, context, script.at(-1)?.text ?? "", runSecrets);
        await finalizeRun(deps, context, "completed", fence, workerId);
      }
    } catch (error) {
      await finalizeRun(
        deps,
        context,
        "failed",
        fence,
        workerId,
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  }

  async function requestCancel(runId: string) {
    const run = await deps.prisma.run.findUnique({ where: { id: runId } });
    if (!run || !["queued", "running"].includes(run.status)) return;
    await deps.prisma.run.update({ where: { id: runId }, data: { status: "cancelled" } });
  }

  return { execute, requestCancel, completeRun };
}

async function resolveModelKey(
  deps: ExecutorDeps,
  userId: string,
  workspaceId: string,
  credential: { secretId: string; provider: string } | null,
) {
  if (!credential) return { apiKey: undefined, oauth: undefined, redact: [] as string[] };
  if (!deps.credentialKey) throw new Error("MODEL_CREDENTIAL_KEY is required for encrypted model credentials");
  const secret = await deps.prisma.secret.findFirst({
    where: { id: credential.secretId, userId, workspaceId },
  });
  if (!secret) throw new Error(`model credential secret ${credential.secretId} not found`);
  const decrypted = decryptCredential(secret.ciphertext, deps.credentialKey);
  const apiKey = credential.provider === "ollama" ? undefined : decrypted;
  return {
    apiKey,
    oauth: undefined,
    redact: decrypted ? [decrypted] : [],
  };
}

async function ensureComputer(deps: ExecutorDeps, botId: string, context: RunContext) {
  return ensureUserComputer({
    botId,
    userId: context.userId,
    workspaceId: context.workspaceId,
    sandbox: deps.sandbox,
    resolver: deps.computer,
  });
}

function blocksToText(blocks: MessageBlock[]) {
  return blocks
    .filter((block): block is Extract<MessageBlock, { type: "text" }> => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}

async function handleAgentEvent(
  deps: ExecutorDeps,
  context: RunContext,
  event: any,
  fence: number,
  workerId: string,
) {
  if (event.type === "assistant.delta") {
    await deps.events.appendEvent({
      type: EVENT_TYPES.ASSISTANT_DELTA,
      userId: context.userId,
      workspaceId: context.workspaceId,
      threadId: context.threadId,
      runId: context.runId,
      payload: { text: event.text },
    });
    return;
  }

  if (event.type === "tool.call") {
    await deps.events.appendEvent({
      type: EVENT_TYPES.TOOL_CALL,
      userId: context.userId,
      workspaceId: context.workspaceId,
      threadId: context.threadId,
      runId: context.runId,
      payload: { tool: event.name, input: event.input },
    });
    return;
  }

  if (event.type === "tool.result") {
    await deps.events.appendEvent({
      type: EVENT_TYPES.TOOL_RESULT,
      userId: context.userId,
      workspaceId: context.workspaceId,
      threadId: context.threadId,
      runId: context.runId,
      payload: { tool: event.name, result: event.result },
    });
    return;
  }

  if (event.type === "activity") {
    await deps.activity?.appendActivity?.({
      userId: context.userId,
      workspaceId: context.workspaceId,
      runId: context.runId,
      type: event.activity.type,
      summary: event.activity.summary,
      detail: event.activity.detail,
      metadata: event.activity.metadata,
    });
    return;
  }

  if (event.type === "control") {
    const action = event.action as ControlAction;
    if (action.type === "cancel") {
      await deps.prisma.run.updateMany({
        where: {
          id: context.runId,
          status: "running",
          leaseOwner: workerId,
          leaseFence: fence,
        },
        data: { status: "cancelled" },
      });
    }
  }
}

async function appendAssistantMessage(
  deps: ExecutorDeps,
  context: RunContext,
  text: string,
  secrets: string[],
) {
  const clean = redactText(text, secrets);
  const message = await deps.prisma.message.create({
    data: {
      threadId: context.threadId,
      role: "assistant",
      blocks: [{ type: "text", text: clean }] as any,
    },
  });
  await deps.events.appendEvent({
    type: EVENT_TYPES.MESSAGE_CREATED,
    userId: context.userId,
    workspaceId: context.workspaceId,
    threadId: context.threadId,
    runId: context.runId,
    payload: { messageId: message.id, role: "assistant", blocks: message.blocks },
  });
}

async function finalizeRun(
  deps: ExecutorDeps,
  context: RunContext,
  status: RunStatus,
  fence: number,
  workerId: string,
  error?: string,
) {
  const updated = await deps.prisma.run.updateMany({
    where: {
      id: context.runId,
      status: "running",
      leaseOwner: workerId,
      leaseFence: fence,
    },
    data: {
      status,
      finishedAt: deps.now?.() ?? new Date(),
      ...(error ? { error } : {}),
    },
  });
  if (!updated.count) return;
  await deps.events.appendEvent({
    type: EVENT_TYPES.RUN_COMPLETED,
    userId: context.userId,
    workspaceId: context.workspaceId,
    threadId: context.threadId,
    runId: context.runId,
    payload: { runId: context.runId, status, error },
  });
}

function redactText(text: string, secrets: string[]) {
  return secrets.reduce(
    (out, secret) => (secret ? out.split(secret).join("[REDACTED]") : out),
    text,
  );
}
