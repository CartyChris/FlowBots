import { mkdir } from "node:fs/promises";
import { implement, ORPCError } from "@orpc/server";
import type {
  AgentHomeStore,
  AgentRuntime,
  MemoryStore,
  SandboxProvider,
  WakeupDriver,
} from "@rakazo/adapter-kit";
import {
  type ComposioConnector,
  destroyBot,
  detectEnvCredentials,
  detectLocalModelServers,
  ENV_CREDENTIAL_SOURCES,
  type EncryptedSecretStore,
  listPiCatalog,
  OLLAMA_PROVIDER_ID,
  ollamaBaseUrl,
  ollamaModelIds,
  type PiOAuthLogins,
  resolveAgentHomePath,
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
  type LoungeSession,
  type Me,
  type ThreadSnapshot,
} from "@rakazo/contracts";
import {
  ambientNudge,
  formatLoungeTranscript,
  isReactionKind,
  LOUNGE_TOPICS,
  loungeTopic,
  nextCronDate,
  normalizePersona,
  PERSONAS,
  personaDefinition,
  personaSystemPrompt,
  projectMessages,
  projectPresence,
} from "@rakazo/core";
import {
  appendEvent,
  createRepos,
  eventsAfter,
  followThreadEvents,
  IsolationError,
  type Pool,
  type Prisma,
  type PrismaClient,
  requireMembership,
} from "@rakazo/db";
import { addScreenProxyCapability } from "./screen-proxy.js";

export interface RouterDeps {
  prisma: PrismaClient;
  auth: Auth;
  wakeup: WakeupDriver;
  sandbox: SandboxProvider;
  memory: MemoryStore;
  home: AgentHomeStore;
  secrets: EncryptedSecretStore;
  oauthLogins: PiOAuthLogins;
  composio?: ComposioConnector;
  runtime?: AgentRuntime;
  dataDir: string;
  pool?: Pool;
  env: {
    defaultProvider: string;
    defaultModel: string;
    openRouterKey?: string;
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
        where: { userId: actor.userId, isDefault: true },
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
      list: authed.models.list.handler(async ({ signal }) => {
        const entries = [...listPiCatalog(), scriptedCatalogEntry];
        try {
          const local = await ollamaModelIds(ollamaBaseUrl(), { signal });
          for (const id of local) {
            entries.push({
              provider: OLLAMA_PROVIDER_ID,
              providerName: "Ollama (local)",
              id,
              label: `Ollama · ${id}`,
              billing: "Runs locally on this machine. No key, no meter, no cloud.",
              auth: "api-key" as const,
              subscription: false,
            });
          }
        } catch {
          // Ollama is not running; the provider simply does not appear.
        }
        return entries;
      }),
      credentials: authed.models.credentials.handler(async ({ context }) => {
        const rows = await deps.prisma.userModelCredential.findMany({
          where: { userId: context.actor.userId, workspaceId: context.actor.workspaceId },
        });
        return rows.map((row) => ({
          id: row.id,
          provider: row.provider,
          label: row.label,
          hasKey: true,
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
        await deps.prisma.userModelCredential.updateMany({
          where: { userId: context.actor.userId, provider: input.provider },
          data: { defaultModel: input.modelId, isDefault: true },
        });
        return { ok: true as const };
      }),
    },
    bots: {
      list: authed.bots.list.handler(async ({ context }) => repos.listBots(context.actor)),
      get: authed.bots.get.handler(async ({ context, input }) => {
        const bot = await repos.getBot(context.actor, input.botId);
        const [mapped] = await repos.listBots(context.actor);
        const found = (await repos.listBots(context.actor)).find((b) => b.id === bot.id);
        if (!found) throw new IsolationError();
        return found ?? mapped;
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
            persona: input.persona
              ? JSON.parse(JSON.stringify(normalizePersona(input.persona)))
              : undefined,
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
    threads: {
      get: authed.threads.get.handler(async ({ context, input }) =>
        snapshot(deps, context.actor, input.botId, input.afterSeq ?? -1),
      ),
      subscribe: authed.threads.subscribe.handler(async function* ({ context, input }) {
        const bot = await repos.getBot(context.actor, input.botId);
        if (!bot.thread) throw new IsolationError();
        for await (const event of followThreadEvents(
          deps.prisma,
          bot.thread.id,
          input.cursor,
          deps.pool,
          context.signal,
        )) {
          yield {
            id: event.id,
            workspaceId: event.workspaceId,
            threadId: event.threadId,
            botId: event.botId,
            seq: event.seq,
            type: event.type as never,
            runId: event.runId ?? undefined,
            createdAt: event.createdAt.toISOString(),
            payload: event.payload as Record<string, unknown>,
          };
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
        const last = await deps.prisma.message.findFirst({
          where: { threadId: bot.thread.id },
          orderBy: { seq: "desc" },
        });
        const seq = (last?.seq ?? -1) + 1;
        await deps.prisma.message.create({
          data: {
            threadId: bot.thread.id,
            seq,
            role: "user",
            blocks: [{ kind: "text", text: input.text }],
          },
        });
        await appendEvent(deps.prisma, {
          workspaceId: context.actor.workspaceId,
          threadId: bot.thread.id,
          botId: bot.id,
          type: "thread.message.created",
          payload: { role: "user", blocks: [{ kind: "text", text: input.text }] },
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
            status: "queued",
            id: { not: run.id },
          },
          data: { status: "cancelled", completedAt: new Date() },
        });
        await deps.wakeup.enqueue({ name: "run.continue", payload: { runId: run.id } });
        return { taskId: task.id, runId: run.id, seq };
      }),
      stop: authed.threads.stop.handler(async ({ context, input }) => {
        const bot = await repos.getBot(context.actor, input.botId);
        await deps.prisma.run.updateMany({
          where: {
            botId: bot.id,
            status: { in: ["queued", "leased", "running", "waiting_input", "waiting_takeover"] },
          },
          data: { status: "cancelled", completedAt: new Date() },
        });
        return { ok: true as const };
      }),
      followUp: authed.threads.followUp.handler(async ({ context, input }) => {
        const bot = await repos.getBot(context.actor, input.botId);
        if (!bot.thread) throw new IsolationError();
        const last = await deps.prisma.message.findFirst({
          where: { threadId: bot.thread.id },
          orderBy: { seq: "desc" },
        });
        await deps.prisma.message.create({
          data: {
            threadId: bot.thread.id,
            seq: (last?.seq ?? -1) + 1,
            role: "user",
            blocks: [{ kind: "text", text: input.text }],
          },
        });
        await appendEvent(deps.prisma, {
          workspaceId: context.actor.workspaceId,
          threadId: bot.thread.id,
          botId: bot.id,
          type: "thread.message.created",
          payload: { role: "user", blocks: [{ kind: "text", text: input.text }] },
        });
        const active = await deps.prisma.run.findFirst({
          where: { botId: bot.id, status: { in: ["running", "queued", "leased"] } },
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
        await deps.wakeup.enqueue({ name: "run.continue", payload: { runId: run.id } });
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
        await deps.wakeup.enqueue({ name: "run.continue", payload: { runId: input.runId } });
        return { ok: true as const };
      }),
    },
    computer: {
      status: authed.computer.status.handler(async ({ context, input }) =>
        computerStatus(deps, context.actor, input.botId),
      ),
      boot: authed.computer.boot.handler(async ({ context, input }) => {
        const bot = await repos.getBot(context.actor, input.botId);
        const ctx = {
          operationId: "boot",
          traceId: "boot",
          workspaceId: context.actor.workspaceId,
          userId: context.actor.userId,
          botId: bot.id,
          signal: new AbortController().signal,
        };
        const homePath = resolveAgentHomePath(deps.home, bot.id, process.env.DATA_DIR ?? "./data");
        await mkdir(homePath, { recursive: true });
        await deps.prisma.computer.update({ where: { botId: bot.id }, data: { state: "booting" } });
        try {
          const ref = await deps.sandbox.provision(
            {
              botId: bot.id,
              homePath,
              providerRef: bot.computer?.providerRef ?? undefined,
            },
            ctx,
          );
          await deps.prisma.computer.update({
            where: { botId: bot.id },
            data: { state: "running", providerRef: ref.providerRef, kind: ref.kind },
          });
          scheduleComputerSleep(deps.wakeup, bot.id);
        } catch (error) {
          await deps.prisma.computer.update({ where: { botId: bot.id }, data: { state: "error" } });
          throw error;
        }
        return computerStatus(deps, context.actor, input.botId);
      }),
      stop: authed.computer.stop.handler(async ({ context, input }) => {
        const bot = await repos.getBot(context.actor, input.botId);
        if (bot.computer?.providerRef) {
          await deps.sandbox.stop(
            {
              id: bot.computer.providerRef,
              botId: bot.id,
              kind: bot.computer.kind as never,
              providerRef: bot.computer.providerRef,
            },
            {
              operationId: "stop",
              traceId: "stop",
              workspaceId: context.actor.workspaceId,
              userId: context.actor.userId,
              signal: new AbortController().signal,
            },
          );
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
          await appendEvent(deps.prisma, {
            workspaceId: context.actor.workspaceId,
            threadId: bot.thread.id,
            botId: bot.id,
            type: "computer.takeover.granted",
            payload: { leaseId },
          });
        }
        const waiting = await deps.prisma.run.findFirst({
          where: { botId: bot.id, status: "waiting_takeover" },
          orderBy: { createdAt: "desc" },
        });
        if (waiting)
          await deps.wakeup.enqueue({ name: "run.continue", payload: { runId: waiting.id } });
        scheduleComputerSleep(deps.wakeup, bot.id);
        return { leaseId, expiresAt: new Date(Date.now() + 15 * 60_000).toISOString() };
      }),
      release: authed.computer.release.handler(async ({ context, input }) => {
        const bot = await repos.getBot(context.actor, input.botId);
        await deps.prisma.computer.update({
          where: { botId: bot.id },
          data: { controlHolder: "bot", controlLeaseId: null },
        });
        scheduleComputerSleep(deps.wakeup, bot.id);
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
          {
            id: bot.computer.providerRef,
            botId: bot.id,
            kind: bot.computer.kind as never,
            providerRef: bot.computer.providerRef,
          },
          mapped,
          { leaseId: bot.computer.controlLeaseId ?? "lease", holder: "user", fence: 0 },
          {
            operationId: "input",
            traceId: "input",
            workspaceId: context.actor.workspaceId,
            userId: context.actor.userId,
            signal: new AbortController().signal,
          },
        );
        scheduleComputerSleep(deps.wakeup, bot.id);
        return { ok: true as const };
      }),
      files: authed.computer.files.handler(async ({ context, input }) => {
        await repos.getBot(context.actor, input.botId);
        return deps.home.list(input.botId, input.path, {
          operationId: "files",
          traceId: "files",
          workspaceId: context.actor.workspaceId,
          userId: context.actor.userId,
          signal: new AbortController().signal,
        });
      }),
      readFile: authed.computer.readFile.handler(async ({ context, input }) => {
        await repos.getBot(context.actor, input.botId);
        const content = await deps.home.readFile(input.botId, input.path, {
          operationId: "read",
          traceId: "read",
          workspaceId: context.actor.workspaceId,
          userId: context.actor.userId,
          signal: new AbortController().signal,
        });
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
          {
            id: bot.computer.providerRef,
            botId: bot.id,
            kind: bot.computer.kind as never,
            providerRef: bot.computer.providerRef,
          },
          { view: "stream" },
          {
            operationId: "screen",
            traceId: "screen",
            workspaceId: context.actor.workspaceId,
            userId: context.actor.userId,
            signal: new AbortController().signal,
          },
        );
        if (!session.url) return { url: null };
        scheduleComputerSleep(deps.wakeup, bot.id);
        const viewUrl = withViewOnly(session.url, bot.computer.controlHolder !== "user");
        return {
          url: addScreenProxyCapability(viewUrl, deps.env.screenProxySecret, deps.env.webOrigin),
        };
      }),
      heartbeat: authed.computer.heartbeat.handler(async ({ context, input }) => {
        const bot = await repos.getBot(context.actor, input.botId);
        if (bot.computer?.state === "running" && bot.computer.providerRef) {
          await touchRunningComputer(
            { sandbox: deps.sandbox, wakeup: deps.wakeup },
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
        await repos.getBot(context.actor, input.botId);
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
        const bot = await repos.getBot(context.actor, input.botId);
        if (bot.thread) {
          await appendEvent(deps.prisma, {
            workspaceId: context.actor.workspaceId,
            threadId: bot.thread.id,
            botId: bot.id,
            type: "routine.created",
            payload: { name: row.name },
          });
        }
        if (row.active && row.nextRunAt) {
          await deps.wakeup.enqueue({
            name: "routine.wakeup",
            payload: { routineId: row.id },
            runAt: row.nextRunAt,
            jobKey: `routine:${row.id}`,
          });
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
        const row = await deps.prisma.routine.update({
          where: { id: existing.id },
          data: {
            name: input.name,
            prompt: input.prompt,
            cron: input.cron,
            timezone: input.timezone,
            active: input.active,
            notify: input.notify,
          },
        });
        return mapRoutine(row);
      }),
      remove: authed.routines.remove.handler(async ({ context, input }) => {
        const existing = await deps.prisma.routine.findFirst({
          where: { id: input.routineId, workspaceId: context.actor.workspaceId },
        });
        if (!existing) throw new IsolationError();
        await deps.prisma.routine.delete({ where: { id: existing.id } });
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
        await deps.wakeup.enqueue({ name: "run.continue", payload: { runId: run.id } });
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
      catalog: authed.connections.catalog.handler(async ({ context, input }) => {
        if (!deps.composio) return [];
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
        if (deps.composio) {
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
        if (row && deps.composio) {
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
        const rows = await deps.prisma.usageRecord.findMany({
          where: { workspaceId: context.actor.workspaceId, userId: context.actor.userId },
        });
        return {
          inputTokens: rows.reduce((a, r) => a + r.inputTokens, 0),
          outputTokens: rows.reduce((a, r) => a + r.outputTokens, 0),
          runs: rows.length,
        };
      }),
    },
    export: {
      bot: authed.export.bot.handler(async ({ context, input }) => {
        const bots = await repos.listBots(context.actor);
        const bot = bots.find((b) => b.id === input.botId);
        if (!bot) throw new IsolationError();
        const snap = await snapshot(deps, context.actor, input.botId, -1);
        const memory = await deps.prisma.memoryDocument.findMany({
          where: { botId: input.botId, workspaceId: context.actor.workspaceId },
        });
        const routines = await deps.prisma.routine.findMany({
          where: { botId: input.botId, workspaceId: context.actor.workspaceId },
        });
        const files: Array<{ path: string; content: string }> = [];
        for await (const file of deps.home.exportHome(input.botId, {
          operationId: "export",
          traceId: "export",
          workspaceId: context.actor.workspaceId,
          userId: context.actor.userId,
          signal: new AbortController().signal,
        })) {
          files.push({ path: file.path, content: new TextDecoder().decode(file.content) });
        }
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
          history: snap.messages,
        };
      }),
    },
    personas: {
      list: authed.personas.list.handler(async () =>
        PERSONAS.map((persona) => ({
          id: persona.id,
          name: persona.name,
          emoji: persona.emoji,
          color: persona.color,
          tagline: persona.tagline,
          sliders: persona.sliders,
          swearing: persona.swearing,
          presenceTag: persona.presenceTag,
          catchphrases: persona.catchphrases,
        })),
      ),
    },
    social: {
      presence: authed.social.presence.handler(async ({ context }) => {
        const bots = await repos.listBots(context.actor);
        return bots.map((bot) =>
          projectPresence({
            botId: bot.id,
            name: bot.name,
            color: bot.color,
            persona: bot.persona,
            status: bot.status,
            updatedAt: bot.updatedAt,
          }),
        );
      }),
      buzz: authed.social.buzz.handler(async ({ context, input }) => {
        const rows = await deps.prisma.event.findMany({
          where: { workspaceId: context.actor.workspaceId, type: "buzz.posted" },
          orderBy: { createdAt: "desc" },
          take: input.limit,
        });
        return rows.map((row) => {
          const payload = row.payload as Record<string, unknown>;
          return {
            id: row.id,
            botId: row.botId,
            botName: String(payload.botName ?? "Bot"),
            botColor: String(payload.botColor ?? "#85858A"),
            personaId: String(payload.personaId ?? "witty"),
            personaEmoji: String(payload.personaEmoji ?? "😏"),
            kind: String(payload.kind ?? "nudge"),
            text: String(payload.text ?? ""),
            createdAt: row.createdAt.toISOString(),
          };
        });
      }),
      react: authed.social.react.handler(async ({ context, input }) => {
        const bot = await repos.getBot(context.actor, input.botId);
        if (!bot.thread) throw new IsolationError();
        if (!isReactionKind(input.kind)) throw new ORPCError("BAD_REQUEST");
        const message = await deps.prisma.message.findFirst({
          where: { id: input.messageId, threadId: bot.thread.id },
        });
        if (!message) throw new ORPCError("NOT_FOUND", { message: "Message not found." });
        await appendEvent(deps.prisma, {
          workspaceId: context.actor.workspaceId,
          threadId: bot.thread.id,
          botId: bot.id,
          type: "message.reaction",
          payload: { messageId: input.messageId, kind: input.kind, userId: context.actor.userId },
        });
        const events = await eventsAfter(deps.prisma, bot.thread.id, -1);
        const counts = reactionCounts(events, input.messageId);
        const merged = mergeReactionsBlock(
          message.blocks as Array<Record<string, unknown>>,
          counts,
          input.messageId,
        );
        await deps.prisma.message.update({
          where: { id: message.id },
          data: { blocks: JSON.parse(JSON.stringify(merged)) },
        });
        await appendEvent(deps.prisma, {
          workspaceId: context.actor.workspaceId,
          threadId: bot.thread.id,
          botId: bot.id,
          type: "thread.message.created",
          payload: { messageId: message.id, role: message.role, blocks: merged },
        });
        return { counts };
      }),
      nudge: authed.social.nudge.handler(async ({ context, input }) => {
        const bot = await repos.getBot(context.actor, input.botId);
        if (!bot.thread) throw new IsolationError();
        const persona = normalizePersona(bot.persona);
        const definition = personaDefinition(persona.id);
        const text = ambientNudge(persona, bot.name, `${bot.id}:${Date.now()}`);
        await appendEvent(deps.prisma, {
          workspaceId: context.actor.workspaceId,
          threadId: bot.thread.id,
          botId: bot.id,
          type: "buzz.posted",
          payload: {
            botName: bot.name,
            botColor: bot.color,
            personaId: definition.id,
            personaEmoji: definition.emoji,
            kind: "nudge",
            text,
          },
        });
        const message = await publishSystemMessage(deps, context.actor, bot.thread.id, bot.id, [
          { kind: "nudge", emoji: definition.emoji, text: `${bot.name}: ${text}` },
        ]);
        void message;
        return { ok: true as const, text };
      }),
    },
    lounge: {
      topics: authed.lounge.topics.handler(async () => LOUNGE_TOPICS),
      start: authed.lounge.start.handler(async ({ context, input }) => {
        const bots = (await repos.listBots(context.actor)).filter((bot) =>
          input.botIds.includes(bot.id),
        );
        if (bots.length < 2) {
          throw new ORPCError("BAD_REQUEST", {
            message: "Pick at least two bots for a lounge session.",
          });
        }
        const topic = loungeTopic(input.topicId);
        const credential = await deps.prisma.userModelCredential.findFirst({
          where: {
            userId: context.actor.userId,
            workspaceId: context.actor.workspaceId,
            isDefault: true,
          },
        });
        const settings = await deps.prisma.deploymentSettings.findUnique({
          where: { id: "default" },
        });
        const model = {
          provider: credential?.provider ?? settings?.defaultModelProvider ?? "scripted",
          id: credential?.defaultModel ?? settings?.defaultModelId ?? "scripted",
        };
        const lines: LoungeSession["lines"] = [];
        const transcript: Array<{
          name: string;
          persona: (typeof bots)[number]["persona"];
          reply: string;
        }> = [];
        for (let round = 0; round < input.rounds; round += 1) {
          for (const bot of bots) {
            const persona = bot.persona;
            const definition = personaDefinition(persona.id);
            const soFar = formatLoungeTranscript(transcript);
            const prompt = [
              `Lounge topic: ${topic.label}.`,
              topic.prompt,
              soFar ? `\nThe room so far:\n${soFar}` : "",
              `\nReply as ${bot.name} in one or two short lines, in character. No preamble.`,
            ].join("\n");
            const reply = await runLoungeTurn(deps, {
              botName: bot.name,
              persona,
              model,
              prompt,
              userId: context.actor.userId,
              workspaceId: context.actor.workspaceId,
            });
            transcript.push({ name: bot.name, persona, reply });
            lines.push({
              botId: bot.id,
              name: bot.name,
              emoji: definition.emoji,
              personaId: definition.id,
              reply,
            });
          }
        }
        const first = bots[0]!;
        const firstThread = await deps.prisma.thread.findUnique({ where: { botId: first.id } });
        const hostThread = firstThread ?? (await repos.getBot(context.actor, first.id)).thread;
        const summary = formatLoungeTranscript(transcript);
        let id = `lounge-${Date.now()}`;
        if (hostThread) {
          const event = await appendEvent(deps.prisma, {
            workspaceId: context.actor.workspaceId,
            threadId: hostThread.id,
            botId: first.id,
            type: "buzz.posted",
            payload: {
              botName: first.name,
              botColor: first.color,
              personaId: first.persona.id,
              personaEmoji: personaDefinition(first.persona.id).emoji,
              kind: "lounge",
              text: `Lounge · ${topic.label}\n\n${summary}`,
            },
          });
          id = event.id;
          await publishSystemMessage(deps, context.actor, hostThread.id, first.id, [
            { kind: "text", text: `🛋️ **Lounge — ${topic.label}**\n\n${summary}` },
          ]);
        }
        return {
          id,
          topicId: topic.id,
          topicLabel: topic.label,
          createdAt: new Date().toISOString(),
          lines,
        };
      }),
      list: authed.lounge.list.handler(async ({ context, input }) => {
        const rows = await deps.prisma.event.findMany({
          where: { workspaceId: context.actor.workspaceId, type: "buzz.posted" },
          orderBy: { createdAt: "desc" },
          take: Math.min(input.limit * 4, 200),
        });
        const sessions: LoungeSession[] = [];
        for (const row of rows) {
          const payload = row.payload as Record<string, unknown>;
          if (payload.kind !== "lounge") continue;
          const text = String(payload.text ?? "");
          const [, ...body] = text.split("\n\n");
          sessions.push({
            id: row.id,
            topicId: "lounge",
            topicLabel: text.split("\n")[0]?.replace("Lounge · ", "") ?? "Lounge",
            createdAt: row.createdAt.toISOString(),
            lines: body
              .join("\n\n")
              .split("\n\n")
              .map((line) => ({
                botId: row.botId,
                name: line.replace(/^.*\*\*(.+?)\*\*.*/, "$1"),
                emoji: "",
                personaId: String(payload.personaId ?? "witty"),
                reply: line.replace(/^.*\*\*.+?\*\* — /, ""),
              })),
          });
          if (sessions.length >= input.limit) break;
        }
        return sessions;
      }),
    },
    sync: {
      scan: authed.sync.scan.handler(async ({ context, signal }) => {
        const hints = detectEnvCredentials(process.env);
        const existing = await deps.prisma.userModelCredential.findMany({
          where: { userId: context.actor.userId, workspaceId: context.actor.workspaceId },
          select: { provider: true, label: true },
        });
        const importedKeys = new Set(existing.map((row) => `${row.provider}:${row.label}`));
        const localServers = await detectLocalModelServers({
          baseUrl: ollamaBaseUrl(),
          signal,
        });
        return {
          envKeys: hints.map((hint) => ({
            provider: hint.provider,
            label: hint.label,
            envVar: hint.envVar,
            modelId: hint.modelId ?? null,
            imported: importedKeys.has(`${hint.provider}:${hint.label}`),
          })),
          localServers: localServers.map((server) => ({
            provider: server.provider,
            baseUrl: server.baseUrl,
            running: server.running,
            models: server.models,
            error: server.error ?? null,
          })),
        };
      }),
      importEnv: authed.sync.importEnv.handler(async ({ context, input }) => {
        const hints = detectEnvCredentials(process.env).filter((hint) =>
          input.envVars.includes(hint.envVar),
        );
        const allowed = new Set(ENV_CREDENTIAL_SOURCES.map((source) => source.envVar));
        const imported: Array<{ provider: string; label: string }> = [];
        for (const hint of hints) {
          if (!allowed.has(hint.envVar)) continue;
          const existing = await deps.prisma.userModelCredential.findFirst({
            where: {
              userId: context.actor.userId,
              workspaceId: context.actor.workspaceId,
              provider: hint.provider,
              label: hint.label,
            },
          });
          if (existing) continue;
          await persistModelCredential(deps, context.actor, {
            provider: hint.provider,
            plaintext: hint.apiKey,
            label: hint.label,
            modelId: hint.modelId,
          });
          imported.push({ provider: hint.provider, label: hint.label });
        }
        return { imported };
      }),
      connectLocal: authed.sync.connectLocal.handler(async ({ context, input, signal }) => {
        const baseUrl = (input.baseUrl ?? ollamaBaseUrl()).replace(/\/+$/, "");
        const models = await ollamaModelIds(baseUrl, { signal: signal ?? undefined }).catch(
          () => [] as string[],
        );
        if (!models.includes(input.modelId)) {
          throw new ORPCError("BAD_REQUEST", {
            message: `Ollama at ${baseUrl} has no model "${input.modelId}". Pull it first (ollama pull ${input.modelId}).`,
          });
        }
        return persistModelCredential(deps, context.actor, {
          provider: OLLAMA_PROVIDER_ID,
          plaintext: "ollama",
          label: "Ollama (local)",
          modelId: input.modelId,
        });
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

function reactionCounts(
  events: Array<{ type: string; payload: unknown }>,
  messageId: string,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const event of events) {
    if (event.type !== "message.reaction") continue;
    const payload = event.payload as Record<string, unknown>;
    if (payload.messageId !== messageId) continue;
    const kind = String(payload.kind ?? "");
    if (!isReactionKind(kind)) continue;
    counts[kind] = (counts[kind] ?? 0) + 1;
  }
  return counts;
}

function mergeReactionsBlock(
  blocks: Array<Record<string, unknown>>,
  counts: Record<string, number>,
  messageId: string,
): Array<Record<string, unknown>> {
  const rest = blocks.filter((block) => block.kind !== "reactions");
  if (Object.keys(counts).length === 0) return rest;
  return [...rest, { kind: "reactions", messageId, counts }];
}

async function publishSystemMessage(
  deps: RouterDeps,
  actor: Actor,
  threadId: string,
  botId: string,
  blocks: Array<Record<string, unknown>>,
) {
  const last = await deps.prisma.message.findFirst({
    where: { threadId },
    orderBy: { seq: "desc" },
  });
  const seq = (last?.seq ?? -1) + 1;
  const message = await deps.prisma.message.create({
    data: {
      threadId,
      seq,
      role: "bot",
      blocks: JSON.parse(JSON.stringify(blocks)),
    },
  });
  await appendEvent(deps.prisma, {
    workspaceId: actor.workspaceId,
    threadId,
    botId,
    type: "thread.message.created",
    payload: { messageId: message.id, role: "bot", blocks },
  });
  return message;
}

async function runLoungeTurn(
  deps: RouterDeps,
  input: {
    botName: string;
    persona: ReturnType<typeof normalizePersona>;
    model: { provider: string; id: string };
    prompt: string;
    userId: string;
    workspaceId: string;
  },
): Promise<string> {
  if (!deps.runtime) return "…";
  const credential = await deps.prisma.userModelCredential.findFirst({
    where: { userId: input.userId, workspaceId: input.workspaceId, isDefault: true },
  });
  let apiKey: string | undefined;
  if (credential) {
    const row = await deps.prisma.secret.findUnique({ where: { id: credential.secretId } });
    if (row) apiKey = deps.secrets.load(row.ciphertext);
  }
  let text = "";
  try {
    for await (const event of deps.runtime.run(
      {
        botId: `lounge-${input.botName}`,
        threadId: "lounge",
        runId: `lounge-${Date.now()}`,
        prompt: input.prompt,
        instructions: personaSystemPrompt(input.persona, input.botName),
        history: [],
        tools: [],
        model: { ...input.model, apiKey },
      },
      {
        operationId: "lounge",
        traceId: "lounge",
        workspaceId: input.workspaceId,
        userId: input.userId,
        signal: AbortSignal.timeout(45_000),
      },
    )) {
      if (event.type === "text") text += event.text;
      if (event.type === "done") break;
    }
  } catch {
    return text.trim() || "…";
  }
  return text.trim() || "…";
}

async function snapshot(
  deps: RouterDeps,
  actor: Actor,
  botId: string,
  afterSeq: number,
): Promise<ThreadSnapshot> {
  const bot = await createRepos(deps.prisma).getBot(actor, botId);
  if (!bot.thread) throw new IsolationError();
  const events = await eventsAfter(deps.prisma, bot.thread.id, afterSeq);
  const projected = projectMessages(events);
  const rows = await deps.prisma.message.findMany({
    where: { threadId: bot.thread.id, seq: { gt: afterSeq } },
    orderBy: { seq: "asc" },
  });
  const persisted = rows.map((row) => ({
    id: row.id,
    threadId: row.threadId,
    seq: row.seq,
    role: row.role as "user" | "bot" | "system",
    blocks: row.blocks as ThreadSnapshot["messages"][number]["blocks"],
    runId: row.runId ?? undefined,
    createdAt: row.createdAt.toISOString(),
  }));
  const live = projected.filter((message) => {
    if (message.blocks.some((block) => block.kind === "progress")) return true;
    if (!message.id.startsWith("subagent:")) return false;
    return !persisted.some((row) =>
      row.blocks.some(
        (block) => block.kind === "subagent" && message.id === `subagent:${block.agentId}`,
      ),
    );
  });
  const messages = persisted.length || live.length ? [...persisted, ...live] : projected;
  const run = await deps.prisma.run.findFirst({
    where: {
      botId,
      status: { in: ["queued", "leased", "running", "waiting_input", "waiting_takeover"] },
    },
    orderBy: { createdAt: "desc" },
  });
  const last = await deps.prisma.event.findFirst({
    where: { threadId: bot.thread.id },
    orderBy: { seq: "desc" },
  });
  return {
    botId,
    threadId: bot.thread.id,
    cursor: last?.seq ?? -1,
    messages,
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
    computer: await computerStatus(deps, actor, botId),
  };
}

async function computerStatus(
  deps: RouterDeps,
  actor: Actor,
  botId: string,
): Promise<ComputerStatus> {
  const bot = await createRepos(deps.prisma).getBot(actor, botId);
  const computer = bot.computer;
  const home = await deps.prisma.agentHome.findUnique({ where: { botId } });
  return {
    botId,
    kind: (computer?.kind ?? "fake") as ComputerStatus["kind"],
    state: (computer?.state ?? "stopped") as ComputerStatus["state"],
    controlHolder: (computer?.controlHolder ?? "none") as ComputerStatus["controlHolder"],
    screenAvailable: computer?.state === "running" || computer?.state === "booting",
    homeRevision: home?.revision ?? null,
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
  await deps.prisma.userModelCredential.updateMany({
    where: { userId: actor.userId },
    data: { isDefault: false },
  });
  const cred = await deps.prisma.userModelCredential.create({
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

export { requireMembership };
