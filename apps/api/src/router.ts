import { mkdir } from "node:fs/promises";
import { implement, ORPCError } from "@orpc/server";
import {
  type AdapterContext,
  type AgentHomeStore,
  type ComputerRef,
  type JobPublisher,
  type MemoryStore,
  routineJobKey,
  routineWakeupJob,
  runContinueJob,
  type SandboxProvider,
} from "@rakazo/adapter-kit";
import {
  type ComposioConnector,
  checkpointAndRecordComputerWorkspace,
  cliHarnessDefinitions,
  destroyBot,
  type EncryptedSecretStore,
  HarnessRegistry,
  listPiCatalog,
  type PiOAuthLogins,
  resolveAgentHomePath,
  resolveModelApiKey,
  restoreComputerWorkspace,
  runCliProcess,
  sanitizeComposioError,
  savePushToken,
  scheduleComputerSleep,
  scriptedCatalogEntry,
  serializeModelSecret,
  touchRunningComputer,
} from "@rakazo/adapters";
import type { Auth } from "@rakazo/auth";
import {
  type Actor,
  appContract,
  type ComputerStatus,
  type GroupChatSnapshot,
  type GroupChatSummary,
  type Me,
  type ThreadSnapshot,
} from "@rakazo/contracts";
import {
  ACTIVE_RUN_STATUSES,
  botParticipatesInFlow,
  nextCronDate,
  projectMessages,
  resolveGroupResponders,
} from "@rakazo/core";
import {
  createGroupMessage,
  createRepos,
  createThreadMessage,
  IsolationError,
  type Prisma,
  type PrismaClient,
  type ThreadEvents,
} from "@rakazo/db";
import {
  clearPersistedComposioKey,
  hasPersistedComposioKey,
  savePersistedComposioKey,
} from "./local-connectors.js";
import { addScreenProxyCapability } from "./screen-proxy.js";
import { loadAllMessages, loadMessagePage } from "./thread-message-pages.js";

const MAX_COMPUTER_TEXT_FILE_BYTES = 2 * 1024 * 1024;
const THREAD_MESSAGE_PAGE_SIZE = 100;
const EXPORT_MESSAGE_PAGE_SIZE = 500;

function computerContext(actor: Actor, botId: string, operationId: string): AdapterContext {
  return {
    operationId,
    traceId: operationId,
    workspaceId: actor.workspaceId,
    userId: actor.userId,
    botId,
    signal: new AbortController().signal,
  };
}

function computerRef(
  botId: string,
  computer: { providerRef: string | null; kind: string },
): ComputerRef {
  if (!computer.providerRef) throw new Error("computer provider reference is missing");
  return {
    id: computer.providerRef,
    botId,
    kind: computer.kind as ComputerRef["kind"],
    providerRef: computer.providerRef,
  };
}

export interface RouterDeps {
  prisma: PrismaClient;
  events: ThreadEvents;
  auth: Auth;
  jobs: JobPublisher;
  sandbox: SandboxProvider;
  memory: MemoryStore;
  home: AgentHomeStore;
  secrets: EncryptedSecretStore;
  oauthLogins: PiOAuthLogins;
  composio?: ComposioConnector;
  dataDir: string;
  env: {
    defaultProvider: string;
    defaultModel: string;
    openRouterKey?: string;
    composioApiKey?: string;
    ollamaBaseUrl: string;
    hostHarnessesEnabled: boolean;
    webOrigin: string;
    screenProxySecret: string;
    sandboxProvider: string;
  };
}

export function createRouter(deps: RouterDeps) {
  const os = implement(appContract).$context<{ actor: Actor | null; signal?: AbortSignal }>();
  const repos = createRepos(deps.prisma);

  const authed = os.use(async ({ context, next }) => {
    if (!context.actor) throw new ORPCError("UNAUTHORIZED");
    return next({ context: { actor: context.actor } });
  });

  return os.router({
    health: os.health.handler(async () => ({ ok: true as const, version: "0.1.0" })),
    me: authed.me.handler(async ({ context }): Promise<Me> => {
      const actor = context.actor;
      const user = await deps.prisma.user.findUniqueOrThrow({ where: { id: actor.userId } });
      const cred = await deps.prisma.userModelCredential.findFirst({
        where: {
          userId: actor.userId,
          workspaceId: actor.workspaceId,
          isDefault: true,
        },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      });
      const settings = await deps.prisma.deploymentSettings.findUnique({
        where: { id: "default" },
      });
      const hasDeployment = Boolean(
        settings?.deploymentModelCredentialCipher || deps.env.openRouterKey,
      );
      return {
        userId: actor.userId,
        email: user.email,
        name: user.name,
        workspaceId: actor.workspaceId,
        isDeploymentOwner: actor.isDeploymentOwner,
        needsModel: !cred && !hasDeployment,
        defaultProvider:
          cred?.provider ?? settings?.defaultModelProvider ?? deps.env.defaultProvider,
        defaultModel: cred?.defaultModel ?? settings?.defaultModelId ?? deps.env.defaultModel,
        computerHost: computerHostFor(settings?.computerHost, deps.env.sandboxProvider),
        canChooseHostComputer: actor.isDeploymentOwner && deps.env.sandboxProvider === "docker",
      };
    }),
    deployment: {
      get: authed.deployment.get.handler(async ({ context }) => {
        if (!context.actor.isDeploymentOwner) throw new ORPCError("FORBIDDEN");
        return deploymentDto(deps.prisma, deps.env.sandboxProvider);
      }),
      update: authed.deployment.update.handler(async ({ context, input }) => {
        if (!context.actor.isDeploymentOwner) throw new ORPCError("FORBIDDEN");
        if (input.computerHost === "this-mac" && deps.env.sandboxProvider !== "docker") {
          throw new ORPCError("BAD_REQUEST", {
            message:
              "This Mac mode is only available when SANDBOX_PROVIDER=docker on a personal local app.",
          });
        }
        await deps.prisma.deploymentSettings.upsert({
          where: { id: "default" },
          create: {
            id: "default",
            ownerUserId: context.actor.userId,
            signupsEnabled: input.signupsEnabled ?? true,
            signupAllowlist: (input.signupAllowlist ?? []).join(","),
            computerHost: input.computerHost ?? undefined,
          },
          update: {
            ...(input.signupsEnabled === undefined ? {} : { signupsEnabled: input.signupsEnabled }),
            ...(input.signupAllowlist ? { signupAllowlist: input.signupAllowlist.join(",") } : {}),
            ...(input.computerHost === undefined ? {} : { computerHost: input.computerHost }),
          },
        });
        return deploymentDto(deps.prisma, deps.env.sandboxProvider);
      }),
    },
    models: {
      list: authed.models.list.handler(async ({ context, input }) => {
        const xaiCredential = await deps.prisma.userModelCredential.findFirst({
          where: {
            userId: context.actor.userId,
            workspaceId: context.actor.workspaceId,
            provider: "xai",
          },
          orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
        });
        let xaiApiKey: string | undefined;
        if (xaiCredential?.secretId) {
          const secret = await deps.prisma.secret.findFirst({
            where: {
              id: xaiCredential.secretId,
              userId: context.actor.userId,
              workspaceId: context.actor.workspaceId,
            },
          });
          if (secret) {
            const plaintext = deps.secrets.load(secret.ciphertext);
            xaiApiKey = await resolveModelApiKey(plaintext, "xai", {
              persist: async (next) => {
                const encrypted = await deps.secrets.put(next, {
                  operationId: `models:list:${context.actor.userId}`,
                  traceId: `models:list:${context.actor.userId}`,
                  workspaceId: context.actor.workspaceId,
                  userId: context.actor.userId,
                  signal: new AbortController().signal,
                });
                await deps.prisma.secret.update({
                  where: { id: secret.id },
                  data: { ciphertext: encrypted.ciphertext },
                });
              },
            }).catch(() => undefined);
          }
        }
        return listPiCatalog({
          refresh: input?.refresh ?? true,
          staticCatalog: [...listPiCatalog(), scriptedCatalogEntry],
          ollamaBaseUrl: deps.env.ollamaBaseUrl,
          xaiApiKey,
        });
      }),
      credentials: authed.models.credentials.handler(async ({ context }) => {
        const rows = await deps.prisma.userModelCredential.findMany({
          where: { userId: context.actor.userId, workspaceId: context.actor.workspaceId },
        });
        return rows.map((row) => ({
          id: row.id,
          provider: row.provider,
          label: row.label,
          hasKey: Boolean(row.secretId),
          isDefault: row.isDefault,
        }));
      }),
      connect: authed.models.connect.handler(async ({ context, input }) => {
        return persistModelCredential(deps, context.actor, {
          provider: input.provider,
          plaintext: input.apiKey,
          label: input.label,
          modelId: input.modelId,
        });
      }),
      beginOAuth: authed.models.beginOAuth.handler(async ({ context, input }) => {
        return deps.oauthLogins.begin({
          userId: context.actor.userId,
          workspaceId: context.actor.workspaceId,
          provider: input.provider,
          modelId: input.modelId,
          label: input.label,
        });
      }),
      completeOAuth: authed.models.completeOAuth.handler(async ({ context, input }) => {
        const result = await deps.oauthLogins.complete(input.loginId, {
          userId: context.actor.userId,
          workspaceId: context.actor.workspaceId,
        });
        if (result.status !== "connected") return result;
        const credential = await persistModelCredential(deps, context.actor, {
          provider: result.provider,
          plaintext: serializeModelSecret({ kind: "oauth", credential: result.credential }),
          label: result.label ?? "ChatGPT Plus/Pro",
          modelId: result.modelId,
        });
        deps.oauthLogins.consume(input.loginId);
        return { status: "connected" as const, credential };
      }),
      setDefault: authed.models.setDefault.handler(async ({ context, input }) => {
        const selected = await deps.prisma.userModelCredential.findFirst({
          where: {
            userId: context.actor.userId,
            workspaceId: context.actor.workspaceId,
            provider: input.provider,
          },
          orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        });
        if (!selected && input.provider !== "ollama") {
          throw new ORPCError("NOT_FOUND", {
            message: `No ${input.provider} credential is connected in this workspace.`,
          });
        }
        await deps.prisma.$transaction(async (tx) => {
          await tx.userModelCredential.updateMany({
            where: {
              userId: context.actor.userId,
              workspaceId: context.actor.workspaceId,
            },
            data: { isDefault: false },
          });
          if (selected) {
            await tx.userModelCredential.update({
              where: { id: selected.id },
              data: { defaultModel: input.modelId, isDefault: true },
            });
          } else {
            await tx.userModelCredential.create({
              data: {
                userId: context.actor.userId,
                workspaceId: context.actor.workspaceId,
                provider: "ollama",
                label: "Ollama",
                secretId: null,
                isDefault: true,
                defaultModel: input.modelId,
              },
            });
          }
        });
        return { ok: true as const };
      }),
    },
    harnesses: {
      list: authed.harnesses.list.handler(async ({ context }) => {
        assertHostHarnessAccess(deps, context.actor);
        const registry = new HarnessRegistry(cliHarnessDefinitions());
        const definitions = registry.list();
        const probes = new Map((await registry.probeAll()).map((probe) => [probe.id, probe]));
        return definitions.map((definition) => {
          const probe = probes.get(definition.id) ?? {
            available: false as const,
            version: undefined,
            detail: undefined,
          };
          return {
            id: definition.id,
            label: definition.label,
            kind: definition.kind,
            interactions: definition.interactions,
            workspacePolicies: definition.workspacePolicies,
            scheduleable: definition.scheduleable,
            resident: definition.resident,
            outerVerificationRequired: definition.outerVerificationRequired,
            available: probe.available,
            ...(probe.version ? { version: probe.version } : {}),
            ...(probe.detail ? { detail: probe.detail } : {}),
          };
        });
      }),
      probeCustom: authed.harnesses.probeCustom.handler(async ({ context, input }) => {
        assertHostHarnessAccess(deps, context.actor);
        const result = await runCliProcess({
          command: input.executable.trim(),
          args: input.args,
          cwd: deps.dataDir,
          timeoutMs: 5_000,
          maxOutputBytes: 64 * 1024,
        });
        const version = firstNonEmptyLine(result.stdout) ?? firstNonEmptyLine(result.stderr);
        const available = result.code === 0 && !result.timedOut && !result.aborted;
        return {
          available,
          ...(available && version ? { version } : {}),
          ...(!available
            ? {
                detail:
                  result.stderr.trim() ||
                  result.stdout.trim() ||
                  (result.timedOut ? "version probe timed out" : "CLI is unavailable"),
              }
            : {}),
        };
      }),
    },
    bots: {
      list: authed.bots.list.handler(async ({ context }) => repos.listBots(context.actor)),
      get: authed.bots.get.handler(async ({ context, input }) => {
        const found = (await repos.listBots(context.actor)).find((bot) => bot.id === input.botId);
        if (!found) throw new IsolationError();
        return found;
      }),
      create: authed.bots.create.handler(async ({ context, input }) =>
        repos.createBot(context.actor, input),
      ),
      update: authed.bots.update.handler(async ({ context, input }) => {
        await repos.getBot(context.actor, input.botId);
        await deps.prisma.bot.update({
          where: { id: input.botId },
          data: {
            name: input.name,
            title: input.title,
            description: input.description,
            instructions: input.instructions,
            notifyOnFinish: input.notifyOnFinish,
            color: input.color,
          },
        });
        const bots = await repos.listBots(context.actor);
        const bot = bots.find((b) => b.id === input.botId);
        if (!bot) throw new IsolationError();
        return bot;
      }),
      remove: authed.bots.remove.handler(async ({ context, input }) => {
        const bot = await repos.getBot(context.actor, input.botId);
        await destroyBot(
          {
            prisma: deps.prisma,
            sandbox: deps.sandbox,
            home: deps.home,
            dataDir: deps.dataDir,
          },
          bot.id,
          {
            operationId: "destroy",
            traceId: "destroy",
            workspaceId: context.actor.workspaceId,
            userId: context.actor.userId,
            signal: new AbortController().signal,
          },
        );
        return { ok: true as const };
      }),
    },
    groupChats: {
      list: authed.groupChats.list.handler(async ({ context }) =>
        groupChatSummaries(deps, context.actor),
      ),
      get: authed.groupChats.get.handler(async ({ context, input }) =>
        groupChatSnapshot(deps, context.actor, input.groupChatId),
      ),
      create: authed.groupChats.create.handler(async ({ context, input }) => {
        const bots = await requireGroupBots(deps, context.actor, input.botIds);
        const room = await deps.prisma.groupChat.create({
          data: {
            workspaceId: context.actor.workspaceId,
            userId: context.actor.userId,
            name: input.name,
            members: {
              create: bots.map((bot, position) => ({ botId: bot.id, position })),
            },
          },
        });
        return groupChatSnapshot(deps, context.actor, room.id);
      }),
      update: authed.groupChats.update.handler(async ({ context, input }) => {
        const existing = await deps.prisma.groupChat.findFirst({
          where: {
            id: input.groupChatId,
            workspaceId: context.actor.workspaceId,
            userId: context.actor.userId,
          },
        });
        if (!existing) throw new IsolationError();
        const bots = input.botIds
          ? await requireGroupBots(deps, context.actor, input.botIds)
          : null;
        await deps.prisma.$transaction(async (tx) => {
          if (bots) {
            await tx.groupChatMember.deleteMany({ where: { groupChatId: existing.id } });
            await tx.groupChatMember.createMany({
              data: bots.map((bot, position) => ({
                groupChatId: existing.id,
                botId: bot.id,
                position,
              })),
            });
          }
          await tx.groupChat.update({
            where: { id: existing.id },
            data: { name: input.name },
          });
        });
        return groupChatSnapshot(deps, context.actor, existing.id);
      }),
      remove: authed.groupChats.remove.handler(async ({ context, input }) => {
        const removed = await deps.prisma.groupChat.deleteMany({
          where: {
            id: input.groupChatId,
            workspaceId: context.actor.workspaceId,
            userId: context.actor.userId,
          },
        });
        if (removed.count !== 1) throw new IsolationError();
        return { ok: true as const };
      }),
      send: authed.groupChats.send.handler(async ({ context, input }) => {
        const room = await deps.prisma.groupChat.findFirst({
          where: {
            id: input.groupChatId,
            workspaceId: context.actor.workspaceId,
            userId: context.actor.userId,
          },
          include: {
            members: {
              orderBy: { position: "asc" },
              include: { bot: { include: { thread: true } } },
            },
          },
        });
        if (!room) throw new IsolationError();

        if (input.clientNonce) {
          const duplicate = await deps.prisma.groupMessage.findFirst({
            where: { groupChatId: room.id, clientNonce: input.clientNonce },
          });
          if (duplicate) {
            const priorRuns = await deps.prisma.run.findMany({
              where: { groupChatId: room.id, groupPromptSeq: duplicate.seq },
              select: { id: true, botId: true, status: true },
            });
            return {
              messageSeq: duplicate.seq,
              responderBotIds: priorRuns.map((run) => run.botId),
              busyBotIds: [],
              runIds: priorRuns.map((run) => run.id),
            };
          }
        }

        const message = await createGroupMessage(deps.prisma, {
          groupChatId: room.id,
          authorKind: "user",
          blocks: [{ kind: "text", text: input.text }],
          clientNonce: input.clientNonce ?? null,
        });
        const routingMembers = room.members.map(({ bot }) => ({
          botId: bot.id,
          name: bot.name,
          title: bot.title,
          description: bot.description,
        }));
        const responderBotIds = resolveGroupResponders(input.text, routingMembers);
        const active = await deps.prisma.run.findMany({
          where: {
            botId: { in: responderBotIds },
            status: { in: [...ACTIVE_RUN_STATUSES] },
          },
          select: { botId: true },
        });
        const busy = new Set(active.map((run) => run.botId));
        const runnable = room.members.filter(
          ({ bot }) => responderBotIds.includes(bot.id) && !busy.has(bot.id) && bot.thread,
        );
        const created = [] as Array<{ id: string; botId: string }>;
        for (const member of runnable) {
          const bot = member.bot;
          const task = await deps.prisma.task.create({
            data: {
              workspaceId: context.actor.workspaceId,
              botId: bot.id,
              threadId: bot.thread!.id,
              userId: context.actor.userId,
              prompt: input.text,
              status: "queued",
              groupChatId: room.id,
              groupPromptSeq: message.seq,
            },
          });
          const run = await deps.prisma.run.create({
            data: {
              workspaceId: context.actor.workspaceId,
              botId: bot.id,
              threadId: bot.thread!.id,
              taskId: task.id,
              userId: context.actor.userId,
              status: "queued",
              trigger: "group",
              groupChatId: room.id,
              groupPromptSeq: message.seq,
              clientNonce: input.clientNonce ? `${input.clientNonce}:${bot.id}` : undefined,
            },
          });
          created.push({ id: run.id, botId: bot.id });
        }
        for (const run of created) await deps.jobs.enqueue(runContinueJob(run.id));
        return {
          messageSeq: message.seq,
          responderBotIds,
          busyBotIds: responderBotIds.filter((botId) => busy.has(botId)),
          runIds: created.map((run) => run.id),
        };
      }),
      stop: authed.groupChats.stop.handler(async ({ context, input }) => {
        await groupChatSnapshot(deps, context.actor, input.groupChatId);
        const active = await deps.prisma.run.findMany({
          where: {
            groupChatId: input.groupChatId,
            status: { in: [...ACTIVE_RUN_STATUSES] },
          },
          select: { id: true },
        });
        await deps.prisma.run.updateMany({
          where: { id: { in: active.map((run) => run.id) } },
          data: { status: "cancelled", completedAt: new Date() },
        });
        await deps.prisma.event.deleteMany({
          where: { runId: { in: active.map((run) => run.id) }, type: "thread.progress" },
        });
        return { ok: true as const };
      }),
    },
    threads: {
      get: authed.threads.get.handler(async ({ context, input }) =>
        snapshot(deps, context.actor, input.botId),
      ),
      messages: authed.threads.messages.handler(async ({ context, input }) => {
        const bot = await repos.getBot(context.actor, input.botId);
        if (!bot.thread) throw new IsolationError();
        return loadMessagePage(deps.prisma, bot.thread.id, input.before, THREAD_MESSAGE_PAGE_SIZE);
      }),
      subscribe: authed.threads.subscribe.handler(async function* ({ context, input }) {
        const bot = await repos.getBot(context.actor, input.botId);
        if (!bot.thread) throw new IsolationError();
        for await (const event of deps.events.follow(bot.thread.id, input.cursor, context.signal)) {
          yield event;
        }
      }),
      send: authed.threads.send.handler(async ({ context, input }) => {
        const bot = await repos.getBot(context.actor, input.botId);
        if (!bot.thread) throw new IsolationError();
        if (input.clientNonce) {
          const dup = await deps.prisma.run.findFirst({
            where: { workspaceId: context.actor.workspaceId, clientNonce: input.clientNonce },
          });
          if (dup) return { taskId: dup.taskId, runId: dup.id, seq: 0 };
        }
        const message = await createThreadMessage(deps.prisma, {
          threadId: bot.thread.id,
          role: "user",
          blocks: [{ kind: "text", text: input.text }],
        });
        await deps.events.append({
          workspaceId: context.actor.workspaceId,
          threadId: bot.thread.id,
          botId: bot.id,
          type: "thread.message.created",
          payload: {
            messageId: message.id,
            role: "user",
            blocks: [{ kind: "text", text: input.text }],
          },
        });
        const task = await deps.prisma.task.create({
          data: {
            workspaceId: context.actor.workspaceId,
            botId: bot.id,
            threadId: bot.thread.id,
            userId: context.actor.userId,
            prompt: input.text,
            status: "queued",
          },
        });
        const run = await deps.prisma.run.create({
          data: {
            workspaceId: context.actor.workspaceId,
            botId: bot.id,
            threadId: bot.thread.id,
            taskId: task.id,
            userId: context.actor.userId,
            status: "queued",
            trigger: "user",
            clientNonce: input.clientNonce,
          },
        });
        await deps.prisma.run.updateMany({
          where: {
            botId: bot.id,
            groupChatId: null,
            status: "queued",
            id: { not: run.id },
          },
          data: { status: "cancelled", completedAt: new Date() },
        });
        await deps.jobs.enqueue(runContinueJob(run.id));
        return { taskId: task.id, runId: run.id, seq: message.seq };
      }),
      stop: authed.threads.stop.handler(async ({ context, input }) => {
        const bot = await repos.getBot(context.actor, input.botId);
        const activeRuns = await deps.prisma.run.findMany({
          where: {
            botId: bot.id,
            groupChatId: null,
            status: { in: [...ACTIVE_RUN_STATUSES] },
          },
          select: { id: true },
        });
        await deps.prisma.run.updateMany({
          where: {
            botId: bot.id,
            groupChatId: null,
            status: { in: [...ACTIVE_RUN_STATUSES] },
          },
          data: { status: "cancelled", completedAt: new Date() },
        });
        await deps.prisma.event.deleteMany({
          where: {
            type: "thread.progress",
            runId: { in: activeRuns.map((run) => run.id) },
          },
        });
        return { ok: true as const };
      }),
      followUp: authed.threads.followUp.handler(async ({ context, input }) => {
        const bot = await repos.getBot(context.actor, input.botId);
        if (!bot.thread) throw new IsolationError();
        const message = await createThreadMessage(deps.prisma, {
          threadId: bot.thread.id,
          role: "user",
          blocks: [{ kind: "text", text: input.text }],
        });
        await deps.events.append({
          workspaceId: context.actor.workspaceId,
          threadId: bot.thread.id,
          botId: bot.id,
          type: "thread.message.created",
          payload: {
            messageId: message.id,
            role: "user",
            blocks: [{ kind: "text", text: input.text }],
          },
        });
        const active = await deps.prisma.run.findFirst({
          where: {
            botId: bot.id,
            groupChatId: null,
            status: { in: ["running", "queued", "leased"] },
          },
        });
        if (active) return { ok: true as const };
        const task = await deps.prisma.task.create({
          data: {
            workspaceId: context.actor.workspaceId,
            botId: bot.id,
            threadId: bot.thread.id,
            userId: context.actor.userId,
            prompt: input.text,
            status: "queued",
          },
        });
        const run = await deps.prisma.run.create({
          data: {
            workspaceId: context.actor.workspaceId,
            botId: bot.id,
            threadId: bot.thread.id,
            taskId: task.id,
            userId: context.actor.userId,
            status: "queued",
            trigger: "follow_up",
          },
        });
        await deps.jobs.enqueue(runContinueJob(run.id));
        return { ok: true as const };
      }),
      answer: authed.threads.answer.handler(async ({ context, input }) => {
        await repos.getBot(context.actor, input.botId);
        await deps.prisma.run.update({
          where: { id: input.runId, workspaceId: context.actor.workspaceId },
          data: { status: "queued" },
        });
        await deps.prisma.task.updateMany({
          where: { runs: { some: { id: input.runId } } },
          data: { prompt: input.answer },
        });
        await deps.jobs.enqueue(runContinueJob(input.runId));
        return { ok: true as const };
      }),
    },
    computer: {
      status: authed.computer.status.handler(async ({ context, input }) =>
        computerStatus(deps, context.actor, input.botId),
      ),
      boot: authed.computer.boot.handler(async ({ context, input }) => {
        const bot = await repos.getBot(context.actor, input.botId);
        const ctx = computerContext(context.actor, bot.id, "boot");
        const homePath = resolveAgentHomePath(deps.home, bot.id, process.env.DATA_DIR ?? "./data");
        await mkdir(homePath, { recursive: true });
        await deps.prisma.computer.update({ where: { botId: bot.id }, data: { state: "booting" } });
        let provisioned: ComputerRef | undefined;
        try {
          const ref = await deps.sandbox.provision(
            {
              botId: bot.id,
              homePath,
              providerRef: bot.computer?.providerRef ?? undefined,
              providerKind: bot.computer?.kind as ComputerRef["kind"] | undefined,
            },
            ctx,
          );
          provisioned = ref;
          const replacement =
            ref.fresh === true ||
            !bot.computer?.providerRef ||
            bot.computer.providerRef !== ref.providerRef ||
            bot.computer.kind !== ref.kind;
          if (replacement) {
            await restoreComputerWorkspace(deps.home, deps.sandbox, bot.id, ref, ctx);
          }
          await deps.prisma.computer.update({
            where: { botId: bot.id },
            data: { state: "running", providerRef: ref.providerRef, kind: ref.kind },
          });
          scheduleComputerSleep(deps.jobs, bot.id);
        } catch (error) {
          if (provisioned?.fresh) {
            await deps.sandbox.destroy(provisioned, ctx).catch(() => undefined);
          }
          await deps.prisma.computer.update({ where: { botId: bot.id }, data: { state: "error" } });
          throw error;
        }
        return computerStatus(deps, context.actor, input.botId);
      }),
      stop: authed.computer.stop.handler(async ({ context, input }) => {
        const bot = await repos.getBot(context.actor, input.botId);
        if (bot.computer?.providerRef) {
          const ctx = computerContext(context.actor, bot.id, "stop");
          const ref = computerRef(bot.id, bot.computer);
          await checkpointAndRecordComputerWorkspace(deps, bot.id, ref, ctx);
          await deps.sandbox.stop(ref, ctx);
        }
        await deps.prisma.computer.update({
          where: { botId: bot.id },
          data: { state: "stopped", controlHolder: "none" },
        });
        return computerStatus(deps, context.actor, input.botId);
      }),
      takeover: authed.computer.takeover.handler(async ({ context, input }) => {
        const bot = await repos.getBot(context.actor, input.botId);
        const leaseId = `lease-${bot.id}`;
        await deps.prisma.computer.update({
          where: { botId: bot.id },
          data: { controlHolder: "user", controlLeaseId: leaseId, state: "running" },
        });
        if (bot.thread) {
          await deps.events.append({
            workspaceId: context.actor.workspaceId,
            threadId: bot.thread.id,
            botId: bot.id,
            type: "computer.takeover.granted",
            payload: { leaseId },
          });
        }
        scheduleComputerSleep(deps.jobs, bot.id);
        return { leaseId, expiresAt: new Date(Date.now() + 15 * 60_000).toISOString() };
      }),
      release: authed.computer.release.handler(async ({ context, input }) => {
        const bot = await repos.getBot(context.actor, input.botId);
        await deps.prisma.computer.update({
          where: { botId: bot.id },
          data: { controlHolder: "bot", controlLeaseId: null },
        });
        const waiting = await deps.prisma.run.findFirst({
          where: { botId: bot.id, status: "waiting_takeover" },
          orderBy: { createdAt: "desc" },
        });
        if (waiting) await deps.jobs.enqueue(runContinueJob(waiting.id));
        scheduleComputerSleep(deps.jobs, bot.id);
        return { ok: true as const };
      }),
      input: authed.computer.input.handler(async ({ context, input }) => {
        const bot = await repos.getBot(context.actor, input.botId);
        if (bot.computer?.controlHolder !== "user") throw new ORPCError("FORBIDDEN");
        if (!bot.computer.providerRef) return { ok: true as const };
        const mapped =
          input.kind === "key"
            ? { kind: "key" as const, key: String(input.payload.key ?? "") }
            : input.kind === "clipboard"
              ? { kind: "clipboard" as const, text: String(input.payload.text ?? "") }
              : {
                  kind: "pointer" as const,
                  x: Number(input.payload.x ?? 0),
                  y: Number(input.payload.y ?? 0),
                  button: (input.payload.button as "left" | "right" | undefined) ?? "left",
                  type:
                    (input.payload.type as "move" | "down" | "up" | "click" | undefined) ?? "click",
                };
        await deps.sandbox.sendInput(
          computerRef(bot.id, bot.computer),
          mapped,
          { leaseId: bot.computer.controlLeaseId ?? "lease", holder: "user", fence: 0 },
          computerContext(context.actor, bot.id, "input"),
        );
        await deps.prisma.computer.updateMany({
          where: { botId: bot.id, state: "running" },
          data: { updatedAt: new Date() },
        });
        scheduleComputerSleep(deps.jobs, bot.id);
        return { ok: true as const };
      }),
      files: authed.computer.files.handler(async ({ context, input }) => {
        const bot = await repos.getBot(context.actor, input.botId);
        const ctx = computerContext(context.actor, bot.id, "files");
        if (bot.computer?.state === "running" && bot.computer.providerRef) {
          await deps.prisma.computer.updateMany({
            where: { botId: bot.id, state: "running" },
            data: { updatedAt: new Date() },
          });
          scheduleComputerSleep(deps.jobs, bot.id);
          return deps.sandbox.listFiles(computerRef(bot.id, bot.computer), input.path, ctx);
        }
        return deps.home.list(input.botId, input.path, ctx);
      }),
      readFile: authed.computer.readFile.handler(async ({ context, input }) => {
        const bot = await repos.getBot(context.actor, input.botId);
        const ctx = computerContext(context.actor, bot.id, "read");
        let content: string;
        if (bot.computer?.state === "running" && bot.computer.providerRef) {
          await deps.prisma.computer.updateMany({
            where: { botId: bot.id, state: "running" },
            data: { updatedAt: new Date() },
          });
          scheduleComputerSleep(deps.jobs, bot.id);
          const bytes = await deps.sandbox.readFile(
            computerRef(bot.id, bot.computer),
            input.path,
            ctx,
            { maxBytes: MAX_COMPUTER_TEXT_FILE_BYTES },
          );
          content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        } else {
          try {
            content = await deps.home.readFile(input.botId, input.path, ctx, {
              maxBytes: MAX_COMPUTER_TEXT_FILE_BYTES,
            });
          } catch (error) {
            if (error instanceof Error && error.message.startsWith("agent home file exceeds ")) {
              throw new ORPCError("BAD_REQUEST", { message: "file is too large to preview" });
            }
            throw error;
          }
        }
        return { path: input.path, content };
      }),
      screenUrl: authed.computer.screenUrl.handler(async ({ context, input }) => {
        const bot = await repos.getBot(context.actor, input.botId);
        if (
          !bot.computer?.providerRef ||
          (bot.computer.state !== "running" && bot.computer.state !== "booting")
        ) {
          return { url: null };
        }
        const session = await deps.sandbox.connectScreen(
          computerRef(bot.id, bot.computer),
          { view: "stream" },
          computerContext(context.actor, bot.id, "screen"),
        );
        if (!session.url) return { url: null };
        scheduleComputerSleep(deps.jobs, bot.id);
        const viewUrl = withViewOnly(session.url, bot.computer.controlHolder !== "user");
        return {
          url: addScreenProxyCapability(viewUrl, deps.env.screenProxySecret, deps.env.webOrigin),
        };
      }),
      heartbeat: authed.computer.heartbeat.handler(async ({ context, input }) => {
        const bot = await repos.getBot(context.actor, input.botId);
        if (bot.computer?.state === "running" && bot.computer.providerRef) {
          await deps.prisma.computer.updateMany({
            where: { botId: bot.id, state: "running" },
            data: { updatedAt: new Date() },
          });
          await touchRunningComputer(
            { sandbox: deps.sandbox, jobs: deps.jobs },
            {
              botId: bot.id,
              providerRef: bot.computer.providerRef,
              kind: bot.computer.kind,
            },
          ).catch(() => undefined);
        }
        return { ok: true as const };
      }),
    },
    memory: {
      list: authed.memory.list.handler(async ({ context, input }) => {
        const docs = await deps.prisma.memoryDocument.findMany({
          where: {
            workspaceId: context.actor.workspaceId,
            userId: context.actor.userId,
            ...(input.botId ? { botId: input.botId } : {}),
            ...(input.scope ? { scope: input.scope } : {}),
          },
        });
        return docs.map((doc) => ({
          id: doc.id,
          scope: doc.scope as "bot" | "user",
          botId: doc.botId,
          path: doc.path,
          content: doc.content,
          revision: doc.revision,
          updatedAt: doc.updatedAt.toISOString(),
        }));
      }),
      update: authed.memory.update.handler(async ({ context, input }) => {
        const doc = await deps.prisma.memoryDocument.findFirst({
          where: {
            id: input.documentId,
            workspaceId: context.actor.workspaceId,
            userId: context.actor.userId,
          },
        });
        if (!doc) throw new IsolationError();
        const updated = await deps.memory.commit(
          {
            scope: doc.scope as "bot" | "user",
            botId: doc.botId ?? undefined,
            path: doc.path,
            content: input.content,
          },
          {
            operationId: "mem",
            traceId: "mem",
            workspaceId: context.actor.workspaceId,
            userId: context.actor.userId,
            signal: new AbortController().signal,
          },
        );
        return {
          id: updated.id,
          scope: doc.scope as "bot" | "user",
          botId: doc.botId,
          path: updated.path,
          content: updated.content,
          revision: updated.revision,
          updatedAt: new Date().toISOString(),
        };
      }),
      exportMarkdown: authed.memory.exportMarkdown.handler(async ({ context, input }) => {
        const docs = await deps.prisma.memoryDocument.findMany({
          where: {
            workspaceId: context.actor.workspaceId,
            userId: context.actor.userId,
            ...(input.botId ? { botId: input.botId } : {}),
          },
        });
        return docs.map((d) => `# ${d.path}\n\n${d.content}`).join("\n\n");
      }),
    },
    routines: {
      list: authed.routines.list.handler(async ({ context, input }) => {
        await repos.getBot(context.actor, input.botId);
        const rows = await deps.prisma.routine.findMany({
          where: { botId: input.botId, workspaceId: context.actor.workspaceId },
        });
        return rows.map(mapRoutine);
      }),
      create: authed.routines.create.handler(async ({ context, input }) => {
        const bot = await repos.getBot(context.actor, input.botId);
        const row = await deps.prisma.routine.create({
          data: {
            workspaceId: context.actor.workspaceId,
            botId: input.botId,
            userId: context.actor.userId,
            name: input.name,
            prompt: input.prompt,
            cron: input.cron,
            timezone: input.timezone,
            notify: input.notify,
            active: input.active,
            nextRunAt: input.active ? nextCronDate(input.cron, new Date(), input.timezone) : null,
          },
        });
        if (bot.thread) {
          await deps.events.append({
            workspaceId: context.actor.workspaceId,
            threadId: bot.thread.id,
            botId: bot.id,
            type: "routine.created",
            payload: { name: row.name },
          });
        }
        if (row.active && row.nextRunAt) {
          await deps.jobs.enqueue(routineWakeupJob(row.id, row.nextRunAt));
        }
        return mapRoutine(row);
      }),
      update: authed.routines.update.handler(async ({ context, input }) => {
        const existing = await deps.prisma.routine.findFirst({
          where: {
            id: input.routineId,
            workspaceId: context.actor.workspaceId,
            userId: context.actor.userId,
          },
        });
        if (!existing) throw new IsolationError();
        const active = input.active ?? existing.active;
        const cron = input.cron ?? existing.cron;
        const timezone = input.timezone ?? existing.timezone;
        const scheduleChanged =
          (!existing.active && active) ||
          (input.cron !== undefined && input.cron !== existing.cron) ||
          (input.timezone !== undefined && input.timezone !== existing.timezone);
        const nextRunAt = !active
          ? null
          : scheduleChanged || !existing.nextRunAt
            ? nextCronDate(cron, new Date(), timezone)
            : existing.nextRunAt;
        const row = await deps.prisma.routine.update({
          where: { id: existing.id },
          data: {
            name: input.name,
            prompt: input.prompt,
            cron: input.cron,
            timezone: input.timezone,
            active: input.active,
            notify: input.notify,
            nextRunAt,
          },
        });
        const bot = await repos.getBot(context.actor, row.botId);
        if (bot.thread) {
          await deps.events.append({
            workspaceId: context.actor.workspaceId,
            threadId: bot.thread.id,
            botId: bot.id,
            type: "routine.updated",
            payload: { routineId: row.id, active: row.active },
          });
        }
        const scheduleNeedsSync =
          existing.active !== row.active ||
          scheduleChanged ||
          (!existing.nextRunAt && !!row.nextRunAt);
        if (scheduleNeedsSync) {
          if (row.active && row.nextRunAt) {
            await deps.jobs.enqueue(routineWakeupJob(row.id, row.nextRunAt));
          } else {
            await deps.jobs.cancel(routineJobKey(row.id));
          }
        }
        return mapRoutine(row);
      }),
      remove: authed.routines.remove.handler(async ({ context, input }) => {
        const existing = await deps.prisma.routine.findFirst({
          where: { id: input.routineId, workspaceId: context.actor.workspaceId },
        });
        if (!existing) throw new IsolationError();
        await deps.prisma.routine.delete({ where: { id: existing.id } });
        await deps.jobs.cancel(routineJobKey(existing.id));
        return { ok: true as const };
      }),
      testRun: authed.routines.testRun.handler(async ({ context, input }) => {
        const routine = await deps.prisma.routine.findFirst({
          where: { id: input.routineId, workspaceId: context.actor.workspaceId },
        });
        if (!routine) throw new IsolationError();
        const bot = await repos.getBot(context.actor, routine.botId);
        if (!bot.thread) throw new IsolationError();
        const task = await deps.prisma.task.create({
          data: {
            workspaceId: context.actor.workspaceId,
            botId: bot.id,
            threadId: bot.thread.id,
            userId: context.actor.userId,
            prompt: routine.prompt,
            status: "queued",
          },
        });
        const run = await deps.prisma.run.create({
          data: {
            workspaceId: context.actor.workspaceId,
            botId: bot.id,
            threadId: bot.thread.id,
            taskId: task.id,
            userId: context.actor.userId,
            status: "queued",
            trigger: "routine",
          },
        });
        await deps.jobs.enqueue(runContinueJob(run.id));
        return { runId: run.id };
      }),
    },
    capabilities: {
      list: authed.capabilities.list.handler(async ({ context }) => {
        const rows = await deps.prisma.capabilityInstall.findMany({
          where: { workspaceId: context.actor.workspaceId, userId: context.actor.userId },
        });
        return rows.map((row) => ({
          id: row.id,
          kind: row.kind as "skill" | "plugin" | "mcp" | "connection",
          name: row.name,
          source: row.source,
          version: row.version,
          digest: row.digest,
          config: row.config as Record<string, unknown>,
          createdAt: row.createdAt.toISOString(),
        }));
      }),
      install: authed.capabilities.install.handler(async ({ context, input }) => {
        const row = await deps.prisma.capabilityInstall.create({
          data: {
            workspaceId: context.actor.workspaceId,
            userId: context.actor.userId,
            kind: input.kind,
            name: input.name,
            source: input.source,
            config: input.config as Prisma.InputJsonValue,
            digest: "sha256:local",
            version: "0.0.0",
          },
        });
        return {
          id: row.id,
          kind: row.kind as "skill" | "plugin" | "mcp" | "connection",
          name: row.name,
          source: row.source,
          version: row.version,
          digest: row.digest,
          config: row.config as Record<string, unknown>,
          createdAt: row.createdAt.toISOString(),
        };
      }),
      remove: authed.capabilities.remove.handler(async ({ context, input }) => {
        await deps.prisma.capabilityInstall.deleteMany({
          where: {
            id: input.id,
            workspaceId: context.actor.workspaceId,
            userId: context.actor.userId,
          },
        });
        return { ok: true as const };
      }),
    },
    connections: {
      composioStatus: authed.connections.composioStatus.handler(async ({ context }) => {
        const local = await hasPersistedComposioKey(deps.prisma, context.actor);
        return {
          configured: local || Boolean(deps.env.composioApiKey),
          source: local
            ? ("local" as const)
            : deps.env.composioApiKey
              ? ("environment" as const)
              : ("none" as const),
        };
      }),
      configureComposio: authed.connections.configureComposio.handler(
        async ({ context, input }) => {
          assertHostHarnessAccess(deps, context.actor);
          await savePersistedComposioKey(deps.prisma, deps.secrets, context.actor, input.apiKey);
          deps.composio?.setApiKey(input.apiKey);
          return { configured: true as const };
        },
      ),
      clearComposio: authed.connections.clearComposio.handler(async ({ context }) => {
        assertHostHarnessAccess(deps, context.actor);
        await clearPersistedComposioKey(deps.prisma, context.actor);
        deps.composio?.setApiKey(deps.env.composioApiKey);
        return { ok: true as const };
      }),
      catalog: authed.connections.catalog.handler(async ({ context, input }) => {
        if (!deps.composio?.configured()) return [];
        try {
          return await deps.composio.catalog(context.actor.userId, input.query);
        } catch {
          return [];
        }
      }),
      list: authed.connections.list.handler(async ({ context }) => {
        const rows = await deps.prisma.connection.findMany({
          where: { workspaceId: context.actor.workspaceId, userId: context.actor.userId },
        });
        return rows.map((row) => ({
          id: row.id,
          provider: row.provider,
          displayName: row.displayName,
          status: row.status as "pending" | "connected" | "revoked" | "error",
          capabilities: [],
          createdAt: row.createdAt.toISOString(),
        }));
      }),
      begin: authed.connections.begin.handler(async ({ context, input }) => {
        if (!deps.composio?.configured()) {
          throw new ORPCError("BAD_REQUEST", {
            message: "Configure Composio before connecting apps.",
          });
        }
        const row = await deps.prisma.connection.create({
          data: {
            workspaceId: context.actor.workspaceId,
            userId: context.actor.userId,
            provider: input.provider,
            displayName: input.displayName,
            status: "pending",
          },
        });
        if (!deps.composio) {
          return { connectionId: row.id, authorizationUrl: null };
        }
        try {
          const auth = await deps.composio.begin(
            { provider: input.provider, redirectUrl: `${deps.env.webOrigin}/app` },
            {
              operationId: "connections.begin",
              traceId: "connections.begin",
              workspaceId: context.actor.workspaceId,
              userId: context.actor.userId,
              signal: new AbortController().signal,
            },
          );
          await deps.prisma.connection.update({
            where: { id: row.id },
            data: {
              status: auth.authorizationUrl ? "pending" : "connected",
              providerRef: auth.state || null,
              metadata: { state: auth.state },
            },
          });
          return { connectionId: row.id, authorizationUrl: auth.authorizationUrl };
        } catch (error) {
          await deps.prisma.connection.update({
            where: { id: row.id },
            data: { status: "error" },
          });
          throw new ORPCError("BAD_REQUEST", { message: sanitizeComposioError(error) });
        }
      }),
      complete: authed.connections.complete.handler(async ({ context, input }) => {
        const existing = await deps.prisma.connection.findFirst({
          where: {
            id: input.connectionId,
            workspaceId: context.actor.workspaceId,
            userId: context.actor.userId,
          },
        });
        if (!existing) throw new IsolationError();
        if (deps.composio?.configured()) {
          const ready = await deps.composio.connectionReady(
            context.actor.userId,
            existing.provider,
          );
          if (ready) {
            await deps.prisma.connection.update({
              where: { id: existing.id },
              data: { status: "connected" },
            });
          }
        } else {
          await deps.prisma.connection.update({
            where: { id: existing.id },
            data: { status: "connected" },
          });
        }
        const row = await deps.prisma.connection.findFirstOrThrow({ where: { id: existing.id } });
        return {
          id: row.id,
          provider: row.provider,
          displayName: row.displayName,
          status: row.status as "pending" | "connected" | "revoked" | "error",
          capabilities: [],
          createdAt: row.createdAt.toISOString(),
        };
      }),
      revoke: authed.connections.revoke.handler(async ({ context, input }) => {
        const row = await deps.prisma.connection.findFirst({
          where: {
            id: input.connectionId,
            workspaceId: context.actor.workspaceId,
            userId: context.actor.userId,
          },
        });
        if (row && deps.composio?.configured()) {
          await deps.composio.revoke(row.provider, {
            operationId: "connections.revoke",
            traceId: "connections.revoke",
            workspaceId: context.actor.workspaceId,
            userId: context.actor.userId,
            signal: new AbortController().signal,
          });
        }
        await deps.prisma.connection.updateMany({
          where: { id: input.connectionId, workspaceId: context.actor.workspaceId },
          data: { status: "revoked" },
        });
        return { ok: true as const };
      }),
    },
    artifacts: {
      list: authed.artifacts.list.handler(async ({ context, input }) => {
        await repos.getBot(context.actor, input.botId);
        const rows = await deps.prisma.artifact.findMany({
          where: { botId: input.botId, workspaceId: context.actor.workspaceId },
        });
        return rows.map((row) => ({
          id: row.id,
          botId: row.botId,
          runId: row.runId,
          name: row.name,
          mimeType: row.mimeType,
          size: row.size,
          createdAt: row.createdAt.toISOString(),
        }));
      }),
    },
    usage: {
      list: authed.usage.list.handler(async ({ context }) => {
        const rows = await deps.prisma.usageRecord.findMany({
          where: { workspaceId: context.actor.workspaceId, userId: context.actor.userId },
          orderBy: { createdAt: "desc" },
          take: 100,
        });
        return rows.map((row) => ({
          id: row.id,
          botId: row.botId,
          runId: row.runId,
          provider: row.provider,
          model: row.model,
          inputTokens: row.inputTokens,
          outputTokens: row.outputTokens,
          createdAt: row.createdAt.toISOString(),
        }));
      }),
      summary: authed.usage.summary.handler(async ({ context }) => {
        const result = await deps.prisma.usageRecord.aggregate({
          where: { workspaceId: context.actor.workspaceId, userId: context.actor.userId },
          _sum: { inputTokens: true, outputTokens: true },
          _count: { _all: true },
        });
        return {
          inputTokens: result._sum.inputTokens ?? 0,
          outputTokens: result._sum.outputTokens ?? 0,
          runs: result._count._all,
        };
      }),
    },
    export: {
      bot: authed.export.bot.handler(async ({ context, input }) => {
        const bot = await repos.getBot(context.actor, input.botId);
        if (!bot.thread) throw new IsolationError();
        const exportContext = {
          operationId: "export",
          traceId: "export",
          workspaceId: context.actor.workspaceId,
          userId: context.actor.userId,
          signal: new AbortController().signal,
        };
        const [memory, routines, files, history] = await Promise.all([
          deps.prisma.memoryDocument.findMany({
            where: { botId: input.botId, workspaceId: context.actor.workspaceId },
          }),
          deps.prisma.routine.findMany({
            where: { botId: input.botId, workspaceId: context.actor.workspaceId },
          }),
          (async () => {
            const exported: Array<{ path: string; content: string }> = [];
            for await (const file of deps.home.exportHome(input.botId, exportContext)) {
              exported.push({
                path: file.path,
                content: new TextDecoder().decode(file.content),
              });
            }
            return exported;
          })(),
          loadAllMessages(deps.prisma, bot.thread.id, EXPORT_MESSAGE_PAGE_SIZE),
        ]);
        return {
          version: 1 as const,
          exportedAt: new Date().toISOString(),
          bot: {
            name: bot.name,
            title: bot.title,
            description: bot.description,
            instructions: bot.instructions,
          },
          memory: memory.map((m) => ({ path: m.path, content: m.content })),
          routines: routines.map((r) => ({
            name: r.name,
            prompt: r.prompt,
            cron: r.cron,
            timezone: r.timezone,
          })),
          files,
          history,
        };
      }),
    },
    notifications: {
      registerPush: authed.notifications.registerPush.handler(async ({ context, input }) => {
        await savePushToken(deps.dataDir, context.actor.userId, input.token);
        return { ok: true as const };
      }),
    },
  });
}

async function requireGroupBots(deps: RouterDeps, actor: Actor, botIds: string[]) {
  const unique = [...new Set(botIds)];
  if (unique.length < 2 || unique.length > 12) {
    throw new ORPCError("BAD_REQUEST", { message: "Group chats require 2–12 unique bots." });
  }
  const rows = await deps.prisma.bot.findMany({
    where: {
      id: { in: unique },
      workspaceId: actor.workspaceId,
      userId: actor.userId,
    },
    include: { thread: true },
  });
  if (rows.length !== unique.length) throw new IsolationError();
  const byId = new Map(rows.map((bot) => [bot.id, bot]));
  const ordered = unique
    .map((id) => byId.get(id))
    .filter((bot): bot is NonNullable<typeof bot> => !!bot);
  if (ordered.some((bot) => !botParticipatesInFlow(bot.instructions))) {
    throw new ORPCError("BAD_REQUEST", {
      message:
        "Separated bots cannot join a group chat until they are reconnected to the Shared Flow.",
    });
  }
  return ordered;
}

async function groupChatSummaries(deps: RouterDeps, actor: Actor): Promise<GroupChatSummary[]> {
  const rooms = await deps.prisma.groupChat.findMany({
    where: { workspaceId: actor.workspaceId, userId: actor.userId },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  });
  const snapshots = await Promise.all(rooms.map((room) => groupChatSnapshot(deps, actor, room.id)));
  return snapshots.map((room) => ({
    id: room.id,
    name: room.name,
    members: room.members,
    preview: groupMessagePreview(room.messages.at(-1)?.blocks ?? []),
    activeCount: room.activeRuns.length,
    createdAt: room.createdAt,
    updatedAt: room.updatedAt,
  }));
}

async function groupChatSnapshot(
  deps: RouterDeps,
  actor: Actor,
  groupChatId: string,
): Promise<GroupChatSnapshot> {
  const room = await deps.prisma.groupChat.findFirst({
    where: { id: groupChatId, workspaceId: actor.workspaceId, userId: actor.userId },
    include: {
      members: { orderBy: { position: "asc" }, include: { bot: true } },
      messages: { orderBy: { seq: "asc" }, take: 500 },
    },
  });
  if (!room) throw new IsolationError();
  const activeRuns = await deps.prisma.run.findMany({
    where: { groupChatId: room.id, status: { in: [...ACTIVE_RUN_STATUSES] } },
    orderBy: { createdAt: "asc" },
    include: { bot: true },
  });
  const activeRunIds = activeRuns.map((run) => run.id);
  const toolEvents = activeRunIds.length
    ? await deps.prisma.event.findMany({
        where: { runId: { in: activeRunIds }, type: "agent.tool.called" },
        orderBy: { seq: "asc" },
        select: { runId: true, payload: true },
      })
    : [];
  const lastTool = new Map<string, string>();
  for (const event of toolEvents) {
    if (!event.runId) continue;
    const payload = event.payload as Record<string, unknown>;
    lastTool.set(event.runId, String(payload.name ?? ""));
  }
  const activeByBot = new Map(activeRuns.map((run) => [run.botId, run.status]));
  return {
    id: room.id,
    name: room.name,
    members: room.members.map(({ bot, position }) => ({
      botId: bot.id,
      name: bot.name,
      title: bot.title,
      description: bot.description,
      color: bot.color,
      status: activeByBot.get(bot.id) ?? "idle",
      position,
    })),
    messages: room.messages.map((message) => ({
      id: message.id,
      groupChatId: message.groupChatId,
      seq: message.seq,
      authorKind: message.authorKind as "user" | "bot" | "system",
      botId: message.botId,
      authorName: message.authorName,
      authorColor: message.authorColor,
      blocks: message.blocks as GroupChatSnapshot["messages"][number]["blocks"],
      runId: message.runId,
      createdAt: message.createdAt.toISOString(),
    })),
    activeRuns: activeRuns.map((run) => ({
      runId: run.id,
      botId: run.botId,
      botName: run.bot.name,
      botColor: run.bot.color,
      status: run.status,
      lastTool: lastTool.get(run.id) || null,
      startedAt: run.startedAt?.toISOString() ?? null,
    })),
    createdAt: room.createdAt.toISOString(),
    updatedAt: room.updatedAt.toISOString(),
  };
}

function groupMessagePreview(blocks: GroupChatSnapshot["messages"][number]["blocks"]): string {
  for (const block of blocks) {
    if (block.kind === "text" && block.text.trim()) return block.text.trim().slice(0, 160);
    if (block.kind === "file") return `Shared ${block.name}`;
  }
  return "";
}

async function snapshot(deps: RouterDeps, actor: Actor, botId: string): Promise<ThreadSnapshot> {
  const bot = await createRepos(deps.prisma).getBot(actor, botId);
  if (!bot.thread) throw new IsolationError();
  const [messagePage, run, last, home] = await Promise.all([
    loadMessagePage(deps.prisma, bot.thread.id, undefined, THREAD_MESSAGE_PAGE_SIZE),
    deps.prisma.run.findFirst({
      where: {
        botId,
        groupChatId: null,
        status: { in: [...ACTIVE_RUN_STATUSES] },
      },
      orderBy: { createdAt: "desc" },
    }),
    deps.prisma.event.findFirst({
      where: { threadId: bot.thread.id },
      orderBy: { seq: "desc" },
      select: { seq: true },
    }),
    deps.prisma.agentHome.findUnique({ where: { botId }, select: { revision: true } }),
  ]);
  const liveEvents = run
    ? await deps.prisma.event.findMany({
        where: {
          threadId: bot.thread.id,
          runId: run.id,
          type: { in: ["thread.progress", "thread.subagent"] },
        },
        orderBy: { seq: "asc" },
      })
    : [];
  const projected = projectMessages(liveEvents);
  const persisted = messagePage.messages;
  const live = projected.filter((message) => {
    if (message.blocks.some((block) => block.kind === "progress")) return true;
    if (!message.id.startsWith("subagent:")) return false;
    return !persisted.some((row) =>
      row.blocks.some(
        (block) => block.kind === "subagent" && message.id === `subagent:${block.agentId}`,
      ),
    );
  });
  const messages = [...persisted, ...live];
  return {
    botId,
    threadId: bot.thread.id,
    cursor: last?.seq ?? -1,
    messages,
    olderCursor: messagePage.olderCursor,
    run: run
      ? {
          id: run.id,
          botId: run.botId,
          threadId: run.threadId,
          taskId: run.taskId,
          status: run.status as never,
          trigger: run.trigger as never,
          modelProvider: run.modelProvider,
          modelId: run.modelId,
          error: run.error,
          startedAt: run.startedAt?.toISOString() ?? null,
          completedAt: run.completedAt?.toISOString() ?? null,
        }
      : null,
    computer: toComputerStatus(botId, bot.computer, home?.revision ?? null),
  };
}

async function computerStatus(
  deps: RouterDeps,
  actor: Actor,
  botId: string,
): Promise<ComputerStatus> {
  const bot = await createRepos(deps.prisma).getBot(actor, botId);
  const home = await deps.prisma.agentHome.findUnique({
    where: { botId },
    select: { revision: true },
  });
  return toComputerStatus(botId, bot.computer, home?.revision ?? null);
}

function toComputerStatus(
  botId: string,
  computer: { kind: string; state: string; controlHolder: string } | null,
  homeRevision: string | null,
): ComputerStatus {
  return {
    botId,
    kind: (computer?.kind ?? "fake") as ComputerStatus["kind"],
    state: (computer?.state ?? "stopped") as ComputerStatus["state"],
    controlHolder: (computer?.controlHolder ?? "none") as ComputerStatus["controlHolder"],
    screenAvailable: computer?.state === "running" || computer?.state === "booting",
    homeRevision,
  };
}

async function deploymentDto(prisma: PrismaClient, sandboxProvider: string) {
  const settings = await prisma.deploymentSettings.findUnique({ where: { id: "default" } });
  return {
    ownerUserId: settings?.ownerUserId ?? null,
    signupsEnabled: settings?.signupsEnabled ?? true,
    signupAllowlist: settings?.signupAllowlist
      ? settings.signupAllowlist.split(",").filter(Boolean)
      : [],
    hasDeploymentModelCredential: Boolean(settings?.deploymentModelCredentialCipher),
    defaultProvider: settings?.defaultModelProvider ?? null,
    defaultModel: settings?.defaultModelId ?? null,
    computerHost: computerHostFor(settings?.computerHost, sandboxProvider),
    canChooseHostComputer: sandboxProvider === "docker",
  };
}

function computerHostFor(
  stored: string | null | undefined,
  sandboxProvider: string,
): "docker" | "this-mac" | null {
  if (sandboxProvider === "desktop") return "this-mac";
  if (sandboxProvider !== "docker") return null;
  if (stored === "this-mac" || stored === "docker") return stored;
  return null;
}

function assertHostHarnessAccess(deps: RouterDeps, actor: Actor): void {
  if (!deps.env.hostHarnessesEnabled || !actor.isDeploymentOwner) {
    throw new ORPCError("FORBIDDEN", {
      message: "Host CLI harnesses are only available in an explicitly enabled local workspace.",
    });
  }
}

function firstNonEmptyLine(value: string): string | undefined {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
}

async function persistModelCredential(
  deps: RouterDeps,
  actor: Actor,
  input: { provider: string; plaintext: string; label?: string; modelId?: string },
) {
  const stored = await deps.secrets.put(input.plaintext, {
    operationId: "cred",
    traceId: "cred",
    workspaceId: actor.workspaceId,
    userId: actor.userId,
    signal: new AbortController().signal,
  });
  const secret = await deps.prisma.secret.create({
    data: {
      id: stored.id,
      userId: actor.userId,
      workspaceId: actor.workspaceId,
      kind: "model",
      ciphertext: stored.ciphertext,
    },
  });
  const cred = await deps.prisma.$transaction(async (tx) => {
    await tx.userModelCredential.updateMany({
      where: { userId: actor.userId, workspaceId: actor.workspaceId },
      data: { isDefault: false },
    });
    return tx.userModelCredential.create({
      data: {
        userId: actor.userId,
        workspaceId: actor.workspaceId,
        provider: input.provider,
        label: input.label ?? input.provider,
        secretId: secret.id,
        isDefault: true,
        defaultModel: input.modelId ?? deps.env.defaultModel,
      },
    });
  });
  return {
    id: cred.id,
    provider: cred.provider,
    label: cred.label,
    hasKey: true,
    isDefault: true,
  };
}

function mapRoutine(row: {
  id: string;
  botId: string;
  name: string;
  prompt: string;
  cron: string;
  timezone: string;
  active: boolean;
  notify: boolean;
  lastRunAt: Date | null;
  nextRunAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: row.id,
    botId: row.botId,
    name: row.name,
    prompt: row.prompt,
    cron: row.cron,
    timezone: row.timezone,
    active: row.active,
    notify: row.notify,
    lastRunAt: row.lastRunAt?.toISOString() ?? null,
    nextRunAt: row.nextRunAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function withViewOnly(url: string, viewOnly: boolean) {
  try {
    const parsed = new URL(url);
    parsed.searchParams.set("view_only", viewOnly ? "true" : "false");
    return parsed.toString();
  } catch {
    const join = url.includes("?") ? "&" : "?";
    return `${url}${join}view_only=${viewOnly ? "true" : "false"}`;
  }
}
