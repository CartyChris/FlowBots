from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one exact anchor, found {count}")
    return text.replace(old, new, 1)


schema_path = Path("packages/db/prisma/schema.prisma")
schema = schema_path.read_text()
schema = replace_once(
    schema,
    '''  provider     String
  label        String
  secretId     String
  isDefault    Boolean  @default(false)''',
    '''  provider     String
  label        String
  secretId     String?
  isDefault    Boolean  @default(false)''',
    "nullable local model secret",
)
schema_path.write_text(schema)

router_path = Path("apps/api/src/router.ts")
router = router_path.read_text()
router = replace_once(
    router,
    '''        if (!selected) {
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
          await tx.userModelCredential.update({
            where: { id: selected.id },
            data: { defaultModel: input.modelId, isDefault: true },
          });
        });''',
    '''        if (!selected && input.provider !== "ollama") {
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
        });''',
    "credentialless Ollama default",
)
router = replace_once(
    router,
    '''        if (xaiCredential) {
          const secret = await deps.prisma.secret.findFirst({
            where: {
              id: xaiCredential.secretId,''',
    '''        if (xaiCredential?.secretId) {
          const secret = await deps.prisma.secret.findFirst({
            where: {
              id: xaiCredential.secretId,''',
    "nullable xai model-list secret",
)
router_path.write_text(router)

executor_path = Path("packages/adapters/src/executor.ts")
executor = executor_path.read_text()
executor = replace_once(
    executor,
    '''  credential: { secretId: string; provider: string } | null | undefined,''',
    '''  credential: { secretId: string | null; provider: string } | null | undefined,''',
    "nullable executor credential",
)
executor = replace_once(
    executor,
    '''  if (credential) {
    if (!deps.secretStore) {
      throw new Error(`Missing encrypted credential store for ${credential.provider}.`);
    }
    const record = await deps.prisma.secret.findFirst({''',
    '''  if (credential) {
    if (credential.provider === "ollama" && !credential.secretId) {
      return { apiKey: undefined, redact: [] };
    }
    if (!credential.secretId) {
      throw new Error(`Missing encrypted credential for ${credential.provider}.`);
    }
    if (!deps.secretStore) {
      throw new Error(`Missing encrypted credential store for ${credential.provider}.`);
    }
    const record = await deps.prisma.secret.findFirst({''',
    "credentialless Ollama runtime key",
)
executor_path.write_text(executor)

reaction_path = Path("packages/adapters/src/reaction-store.ts")
reaction = reaction_path.read_text()
reaction = replace_once(
    reaction,
    '''export interface ReactionActor {
  workspaceId: string;
  userId: string;
}''',
    '''export interface ReactionActor {
  workspaceId: string;
  userId: string;
  actorKey?: string;
}''',
    "reaction actor identity",
)
reaction = replace_once(
    reaction,
    '''  const actorKey = `user:${actor.userId}`;''',
    '''  const actorKey = actor.actorKey ?? `user:${actor.userId}`;''',
    "reaction write actor key",
)
reaction = replace_once(
    reaction,
    '''  const mine = `user:${actor.userId}`;''',
    '''  const mine = actor.actorKey ?? `user:${actor.userId}`;''',
    "reaction summary actor key",
)
reaction_path.write_text(reaction)

peer_path = Path("packages/adapters/src/peer-connector.ts")
peer = peer_path.read_text()
peer = replace_once(
    peer,
    '''import type { MessageBlock } from "@rakazo/contracts";''',
    '''import type { MessageBlock } from "@rakazo/contracts";
import { isReactionKind } from "@rakazo/core";''',
    "peer reaction kind import",
)
peer = replace_once(
    peer,
    '''import {
  createThreadMessage,
  type PrismaClient,
  type ThreadEvents,
} from "@rakazo/db";''',
    '''import {
  createThreadMessage,
  type PrismaClient,
  type ThreadEvents,
} from "@rakazo/db";
import { setMessageReaction } from "./reaction-store.js";''',
    "peer reaction store import",
)
peer = replace_once(
    peer,
    '''export const MAX_PEER_SENDS_PER_RUN = 4;
export const MAX_PEER_HOPS = 2;''',
    '''export const MAX_PEER_SENDS_PER_RUN = 4;
export const MAX_PEER_REACTIONS_PER_RUN = 4;
export const MAX_PEER_HOPS = 2;''',
    "peer reaction budget constant",
)
peer = replace_once(
    peer,
    '''const PEER_TOOL_NAMES = new Set(["message_bot", "delegate_to_bot", "read_bot_updates"]);''',
    '''const PEER_TOOL_NAMES = new Set([
  "message_bot",
  "delegate_to_bot",
  "read_bot_updates",
  "react_to_message",
]);''',
    "peer reaction tool name",
)
peer = replace_once(
    peer,
    '''      {
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
      },''',
    '''      {
        name: "read_bot_updates",
        description:
          "Read recent thread updates from another persistent bot without waking it or starting another run. Returned messages include messageId so you can react explicitly.",
        inputSchema: {
          type: "object",
          properties: {
            bot_id: { type: "string" },
            name: { type: "string" },
            limit: { type: "integer", minimum: 1, maximum: 20 },
          },
        },
      },
      {
        name: "react_to_message",
        description:
          "Add or remove one lightweight reaction on a message as this bot. Reactions are bounded per run and never wake another bot.",
        inputSchema: {
          type: "object",
          properties: {
            message_id: { type: "string" },
            kind: { type: "string", enum: ["fire", "skull", "joy", "eyes"] },
            active: { type: "boolean" },
          },
          required: ["message_id", "kind"],
        },
      },''',
    "discover reaction tool",
)
peer = replace_once(
    peer,
    '''      const source = await this.sourceBot(context);
      const target = await this.targetBot(call.args, context);
      if (target.id === source.id) {''',
    '''      const source = await this.sourceBot(context);
      if (call.tool === "react_to_message") {
        if (!context.runId) {
          yield { type: "error", message: "Bot reactions require an active source run." };
          return;
        }
        const used = await this.deps.prisma.externalEffect.count({
          where: { runId: context.runId, kind: "react_to_message" },
        });
        if (used > MAX_PEER_REACTIONS_PER_RUN) {
          yield {
            type: "error",
            message: `Reaction budget exhausted for this run (${MAX_PEER_REACTIONS_PER_RUN} reactions maximum).`,
          };
          return;
        }
        const messageId = String(call.args.message_id ?? call.args.messageId ?? "").trim();
        const kind = String(call.args.kind ?? "").trim();
        if (!messageId) {
          yield { type: "error", message: "Reaction message id is required." };
          return;
        }
        if (!isReactionKind(kind)) {
          yield { type: "error", message: `Unsupported reaction: ${kind}` };
          return;
        }
        const active = call.args.active !== false;
        const reactions = await setMessageReaction(
          this.deps.prisma,
          {
            workspaceId: context.workspaceId,
            userId: context.userId,
            actorKey: `bot:${source.id}`,
          },
          { messageId, kind, active },
        );
        yield {
          type: "result",
          data: { ok: true, messageId, kind, active, reactions },
        };
        return;
      }

      const target = await this.targetBot(call.args, context);
      if (target.id === source.id) {''',
    "execute bot reaction before target resolution",
)
peer = replace_once(
    peer,
    '''          select: { role: true, blocks: true, createdAt: true },''',
    '''          select: { id: true, role: true, blocks: true, createdAt: true },''',
    "peer update message id select",
)
peer = replace_once(
    peer,
    '''            messages: rows.reverse().map((row) => ({
              role: row.role,''',
    '''            messages: rows.reverse().map((row) => ({
              messageId: row.id,
              role: row.role,''',
    "peer update message id output",
)
peer_path.write_text(peer)

model_path = Path("apps/web/src/pages/ModelSettingsOverlay.tsx")
model = model_path.read_text()
model = replace_once(
    model,
    '''  async function makeDefault() {
    if (!selected || !providerCredential) return;''',
    '''  async function makeDefault() {
    if (!selected || (!providerCredential && selected.provider !== "ollama")) return;''',
    "allow local default without credential",
)
model = replace_once(
    model,
    '''                ) : selected.provider === "ollama" ? (
                  <p className="text-[13.5px] leading-6 text-[#8C8C92]">
                    Ollama runs locally and does not need an API key. Refresh discovers the tags
                    installed on this computer. A credential-backed remote default remains the
                    runtime fallback until local model preference storage is added.
                  </p>
                ) : (''',
    '''                ) : selected.provider === "ollama" ? (
                  <div>
                    <p className="text-[13.5px] leading-6 text-[#8C8C92]">
                      Ollama runs locally and does not need an API key. Refresh discovers the tags
                      installed on this computer, and the selected local model is stored as this
                      workspace's default without creating a secret.
                    </p>
                    <Button type="button" className="mt-3" disabled={pending} onClick={() => void makeDefault()}>
                      {current.provider === "ollama" && current.model === selected.id
                        ? "Default"
                        : "Set default"}
                    </Button>
                  </div>
                ) : (''',
    "local model default UI",
)
model_path.write_text(model)
