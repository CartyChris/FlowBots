import type {
  AdapterContext,
  ConnectorCall,
  ConnectorEvent,
  ConnectorProvider,
  ConnectorTool,
  JobPublisher,
} from "@rakazo/adapter-kit";
import { runContinueJob } from "@rakazo/adapter-kit";
import type { MessageBlock } from "@rakazo/contracts";
import {
  createThreadMessage,
  type PrismaClient,
  type ThreadEvents,
} from "@rakazo/db";

export const MAX_PEER_SENDS_PER_RUN = 4;
export const MAX_PEER_HOPS = 2;
const MAX_PEER_MESSAGE_CHARS = 20_000;
const PEER_EFFECT_KINDS = ["message_bot", "delegate_to_bot"] as const;
const PEER_TOOL_NAMES = new Set(["message_bot", "delegate_to_bot", "read_bot_updates"]);

type WriteMessage = typeof createThreadMessage;

export function peerHopHeader(hop: number, sourceBotId: string): string {
  return `[flowbots-peer hop=${Math.max(0, Math.trunc(hop))} source=${sourceBotId}]`;
}

export function peerHopFromPrompt(prompt: string): number {
  const match = /^\[flowbots-peer\s+hop=(\d+)\s+source=[^\]]+\]/i.exec(prompt.trimStart());
  if (!match) return 0;
  const hop = Number.parseInt(match[1] ?? "0", 10);
  return Number.isFinite(hop) ? Math.max(0, hop) : 0;
}

export function isPeerTool(name: string): boolean {
  return PEER_TOOL_NAMES.has(name);
}

export class PeerConnector implements ConnectorProvider {
  constructor(
    private readonly deps: {
      prisma: PrismaClient;
      jobs: JobPublisher;
      events: ThreadEvents;
      writeMessage?: WriteMessage;
    },
  ) {}

  describe() {
    return {
      id: "peer-bots",
      contractVersion: "1",
      adapterVersion: "0.1.0",
      capabilities: { discover: true, oauth: false, secretsBrokered: false },
    };
  }

  async discoverTools(_context: AdapterContext): Promise<ConnectorTool[]> {
    return [
      {
        name: "message_bot",
        description:
          "Send a concise message to another persistent bot in your workspace. This starts one bounded follow-up run for that bot. Do not use it for repeated polling or ping-pong conversation.",
        inputSchema: {
          type: "object",
          properties: {
            bot_id: { type: "string", description: "Target bot ID. Prefer an exact ID." },
            name: { type: "string", description: "Exact target bot name when ID is unavailable." },
            message: { type: "string", description: "Message for the target bot." },
          },
          required: ["message"],
        },
      },
      {
        name: "delegate_to_bot",
        description:
          "Delegate one bounded task to another persistent bot in your workspace. The task appears in that bot's thread and starts one follow-up run.",
        inputSchema: {
          type: "object",
          properties: {
            bot_id: { type: "string" },
            name: { type: "string" },
            task: { type: "string" },
          },
          required: ["task"],
        },
      },
      {
        name: "read_bot_updates",
        description:
          "Read recent thread updates from another persistent bot without waking it or starting another run.",
        inputSchema: {
          type: "object",
          properties: {
            bot_id: { type: "string" },
            name: { type: "string" },
            limit: { type: "integer", minimum: 1, maximum: 20 },
          },
        },
      },
    ];
  }

  async *execute(call: ConnectorCall, context: AdapterContext): AsyncIterable<ConnectorEvent> {
    if (!isPeerTool(call.tool)) {
      yield { type: "error", message: `Unknown peer tool: ${call.tool}` };
      return;
    }
    try {
      const source = await this.sourceBot(context);
      const target = await this.targetBot(call.args, context);
      if (target.id === source.id) {
        yield { type: "error", message: "A bot cannot send a peer task to itself." };
        return;
      }

      if (call.tool === "read_bot_updates") {
        const limit = Math.min(20, Math.max(1, Number(call.args.limit ?? 8) || 8));
        const rows = await this.deps.prisma.message.findMany({
          where: { threadId: target.thread.id },
          orderBy: { seq: "desc" },
          take: limit,
          select: { role: true, blocks: true, createdAt: true },
        });
        yield {
          type: "result",
          data: {
            ok: true,
            botId: target.id,
            name: target.name,
            messages: rows.reverse().map((row) => ({
              role: row.role,
              text: blocksToText(row.blocks as MessageBlock[]),
              createdAt: row.createdAt.toISOString(),
            })),
          },
        };
        return;
      }

      if (!context.runId) {
        yield { type: "error", message: "Peer messaging requires an active source run." };
        return;
      }
      const used = await this.deps.prisma.externalEffect.count({
        where: { runId: context.runId, kind: { in: [...PEER_EFFECT_KINDS] } },
      });
      if (used > MAX_PEER_SENDS_PER_RUN) {
        yield {
          type: "error",
          message: `Peer send budget exhausted for this run (${MAX_PEER_SENDS_PER_RUN} sends maximum).`,
        };
        return;
      }

      const sourceRun = await this.deps.prisma.run.findUnique({
        where: { id: context.runId },
        include: { task: true },
      });
      const hop = peerHopFromPrompt(sourceRun?.task.prompt ?? "");
      if (hop >= MAX_PEER_HOPS) {
        yield {
          type: "error",
          message: `Peer hop limit reached (${MAX_PEER_HOPS}); continue in the current bot instead of recursively waking another bot.`,
        };
        return;
      }

      const rawText = call.tool === "delegate_to_bot" ? call.args.task : call.args.message;
      const text = String(rawText ?? "").trim().slice(0, MAX_PEER_MESSAGE_CHARS);
      if (!text) {
        yield {
          type: "error",
          message: call.tool === "delegate_to_bot" ? "Delegated task is empty." : "Peer message is empty.",
        };
        return;
      }

      const blocks: MessageBlock[] = [
        { kind: "meta", text: `From ${source.name} · peer message` },
        { kind: "text", text },
      ];
      const writeMessage = this.deps.writeMessage ?? createThreadMessage;
      const message = await writeMessage(this.deps.prisma, {
        threadId: target.thread.id,
        role: "system",
        blocks,
      });
      await this.deps.events.append({
        workspaceId: context.workspaceId,
        threadId: target.thread.id,
        botId: target.id,
        type: "thread.message.created",
        payload: {
          messageId: message.id,
          role: "system",
          blocks,
          peer: true,
          sourceBotId: source.id,
          sourceBotName: source.name,
        },
      });

      const nextHop = hop + 1;
      const taskPrompt = [
        peerHopHeader(nextHop, source.id),
        `Peer message from ${source.name}:`,
        text,
      ].join("\n");
      const task = await this.deps.prisma.task.create({
        data: {
          workspaceId: context.workspaceId,
          botId: target.id,
          threadId: target.thread.id,
          userId: context.userId,
          prompt: taskPrompt,
          status: "queued",
        },
      });
      const run = await this.deps.prisma.run.create({
        data: {
          workspaceId: context.workspaceId,
          botId: target.id,
          threadId: target.thread.id,
          taskId: task.id,
          userId: context.userId,
          status: "queued",
          trigger: "follow_up",
        },
      });
      await this.deps.jobs.enqueue(runContinueJob(run.id));
      yield {
        type: "result",
        data: {
          ok: true,
          botId: target.id,
          name: target.name,
          messageId: message.id,
          runId: run.id,
          hop: nextHop,
        },
      };
    } catch (error) {
      yield {
        type: "error",
        message: error instanceof Error ? error.message : "Peer collaboration failed.",
      };
    }
  }

  private async sourceBot(context: AdapterContext) {
    if (!context.botId) throw new Error("Peer collaboration requires a source bot.");
    const source = await this.deps.prisma.bot.findUnique({
      where: { id: context.botId },
      include: { thread: true },
    });
    if (!source || source.workspaceId !== context.workspaceId || source.userId !== context.userId) {
      throw new Error("Source bot is not available in this workspace.");
    }
    if (!source.thread) throw new Error("Source bot has no thread.");
    return source;
  }

  private async targetBot(args: Record<string, unknown>, context: AdapterContext) {
    const botId = String(args.bot_id ?? args.botId ?? "").trim();
    const name = String(args.name ?? "").trim();
    if (!botId && !name) throw new Error("Pass bot_id or an exact bot name.");
    const rows = await this.deps.prisma.bot.findMany({
      where: {
        workspaceId: context.workspaceId,
        userId: context.userId,
        ...(botId ? { id: botId } : { name }),
      },
      include: { thread: true },
      take: 2,
    });
    if (rows.length === 0) throw new Error("Target bot was not found in this workspace.");
    if (rows.length > 1) throw new Error(`More than one bot is named "${name}"; use bot_id.`);
    const target = rows[0]!;
    if (!target.thread) throw new Error("Target bot has no thread.");
    return target;
  }
}

function blocksToText(blocks: MessageBlock[]): string {
  return blocks
    .map((block) => {
      if ("text" in block && typeof block.text === "string") return block.text;
      if (block.kind === "meta") return block.text;
      return JSON.stringify(block);
    })
    .filter(Boolean)
    .join("\n");
}
