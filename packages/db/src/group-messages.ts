import type { MessageBlock } from "@rakazo/contracts";
import type { Prisma, PrismaClient } from "./client.js";

export type GroupMessageAuthorKind = "user" | "bot" | "system";

export interface CreateGroupMessageInput {
  groupChatId: string;
  authorKind: GroupMessageAuthorKind;
  botId?: string | null;
  authorName?: string | null;
  authorColor?: string | null;
  blocks: MessageBlock[];
  runId?: string | null;
  clientNonce?: string | null;
}

export async function createGroupMessage(prisma: PrismaClient, input: CreateGroupMessageInput) {
  return prisma.$transaction((tx) => createGroupMessageInTransaction(tx, input));
}

export async function createGroupMessageInTransaction(
  tx: Prisma.TransactionClient,
  input: CreateGroupMessageInput,
) {
  const room = await tx.groupChat.update({
    where: { id: input.groupChatId },
    data: { nextMessageSeq: { increment: 1 } },
    select: { nextMessageSeq: true },
  });
  return tx.groupMessage.create({
    data: {
      groupChatId: input.groupChatId,
      seq: room.nextMessageSeq - 1,
      authorKind: input.authorKind,
      botId: input.botId ?? null,
      authorName: input.authorName ?? null,
      authorColor: input.authorColor ?? null,
      blocks: input.blocks as Prisma.InputJsonValue,
      runId: input.runId ?? null,
      clientNonce: input.clientNonce ?? null,
    },
  });
}
