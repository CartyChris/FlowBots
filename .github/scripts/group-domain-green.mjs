import { readFileSync, writeFileSync, unlinkSync } from "node:fs";

function replaceOnce(path, before, after) {
  const source = readFileSync(path, "utf8");
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${path}: expected unique anchor, found ${count}`);
  writeFileSync(path, source.replace(before, after));
}

replaceOnce(
  "packages/db/prisma/schema.prisma",
  "  externalEffects ExternalEffect[]\n\n  @@unique([slug])",
  "  externalEffects ExternalEffect[]\n  groupChats GroupChat[]\n\n  @@unique([slug])",
);
replaceOnce(
  "packages/db/prisma/schema.prisma",
  "  tasks          Task[]\n  runs           Run[]\n\n  @@index([workspaceId, userId])",
  "  tasks          Task[]\n  runs           Run[]\n  groupChatMemberships GroupChatMember[]\n  groupMessages GroupMessage[]\n\n  @@index([workspaceId, userId])",
);
replaceOnce(
  "packages/db/prisma/schema.prisma",
  `model Event {`,
  `model GroupChat {
  id             String   @id @default(cuid())
  workspaceId    String
  workspace      Organization @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  userId         String
  name           String
  nextMessageSeq Int      @default(0)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  members        GroupChatMember[]
  messages       GroupMessage[]
  tasks          Task[]
  runs           Run[]

  @@index([workspaceId, userId, updatedAt])
  @@map("group_chats")
}

model GroupChatMember {
  groupChatId String
  groupChat   GroupChat @relation(fields: [groupChatId], references: [id], onDelete: Cascade)
  botId       String
  bot         Bot       @relation(fields: [botId], references: [id], onDelete: Cascade)
  position    Int       @default(0)
  joinedAt    DateTime  @default(now())

  @@id([groupChatId, botId])
  @@index([botId])
  @@map("group_chat_members")
}

model GroupMessage {
  id          String   @id @default(cuid())
  groupChatId String
  groupChat   GroupChat @relation(fields: [groupChatId], references: [id], onDelete: Cascade)
  seq         Int
  authorKind  String
  botId       String?
  bot         Bot?     @relation(fields: [botId], references: [id], onDelete: SetNull)
  authorName  String?
  authorColor String?
  blocks      Json
  runId       String?
  run         Run?     @relation(fields: [runId], references: [id], onDelete: SetNull)
  clientNonce String?
  createdAt   DateTime @default(now())

  @@unique([groupChatId, seq])
  @@unique([groupChatId, clientNonce])
  @@index([groupChatId, seq])
  @@index([botId, createdAt])
  @@index([runId])
  @@map("group_messages")
}

model Event {`,
);
replaceOnce(
  "packages/db/prisma/schema.prisma",
  `  userId      String
  prompt      String
  status      String
  createdAt   DateTime @default(now())`,
  `  userId      String
  prompt      String
  status      String
  groupChatId String?
  groupChat   GroupChat? @relation(fields: [groupChatId], references: [id], onDelete: SetNull)
  groupPromptSeq Int?
  createdAt   DateTime @default(now())`,
);
replaceOnce(
  "packages/db/prisma/schema.prisma",
  `  @@index([workspaceId, botId])
  @@map("tasks")`,
  `  @@index([workspaceId, botId])
  @@index([groupChatId, groupPromptSeq])
  @@map("tasks")`,
);
replaceOnce(
  "packages/db/prisma/schema.prisma",
  `  userId        String
  status        String
  trigger       String
  modelProvider String?`,
  `  userId        String
  status        String
  trigger       String
  groupChatId   String?
  groupChat     GroupChat? @relation(fields: [groupChatId], references: [id], onDelete: SetNull)
  groupPromptSeq Int?
  modelProvider String?`,
);
replaceOnce(
  "packages/db/prisma/schema.prisma",
  `  usageRecords  UsageRecord[]

  @@unique([workspaceId, clientNonce])`,
  `  usageRecords  UsageRecord[]
  groupMessages GroupMessage[]

  @@unique([workspaceId, clientNonce])`,
);
replaceOnce(
  "packages/db/prisma/schema.prisma",
  `  @@index([workspaceId, botId])
  @@map("runs")`,
  `  @@index([workspaceId, botId])
  @@index([groupChatId, status])
  @@map("runs")`,
);

replaceOnce(
  "packages/db/src/index.ts",
  `export * from "./events.js";\nexport * from "./messages.js";`,
  `export * from "./events.js";\nexport * from "./group-messages.js";\nexport * from "./group-runs.js";\nexport * from "./messages.js";`,
);

replaceOnce(
  "packages/contracts/src/domain.ts",
  `import { ThreadMessageSchema } from "./events.js";`,
  `import { MessageBlock, ThreadMessageSchema } from "./events.js";`,
);
replaceOnce(
  "packages/contracts/src/domain.ts",
  `export type ThreadSnapshot = z.infer<typeof ThreadSnapshotSchema>;\n\nexport const ModelCredentialSchema`,
  `export type ThreadSnapshot = z.infer<typeof ThreadSnapshotSchema>;

export const GroupChatMemberSchema = z.object({
  botId: Id,
  name: z.string(),
  title: z.string(),
  description: z.string(),
  color: z.string(),
  status: z.string(),
  position: z.number().int().nonnegative(),
});
export type GroupChatMember = z.infer<typeof GroupChatMemberSchema>;

export const GroupChatMessageSchema = z.object({
  id: Id,
  groupChatId: Id,
  seq: z.number().int().nonnegative(),
  authorKind: z.enum(["user", "bot", "system"]),
  botId: Id.nullable(),
  authorName: z.string().nullable(),
  authorColor: z.string().nullable(),
  blocks: z.array(MessageBlock),
  runId: Id.nullable(),
  createdAt: z.string(),
});
export type GroupChatMessage = z.infer<typeof GroupChatMessageSchema>;

export const GroupChatActiveRunSchema = z.object({
  runId: Id,
  botId: Id,
  botName: z.string(),
  botColor: z.string(),
  status: z.string(),
  lastTool: z.string().nullable(),
  startedAt: z.string().nullable(),
});
export type GroupChatActiveRun = z.infer<typeof GroupChatActiveRunSchema>;

export const GroupChatSummarySchema = z.object({
  id: Id,
  name: z.string(),
  members: z.array(GroupChatMemberSchema),
  preview: z.string(),
  activeCount: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type GroupChatSummary = z.infer<typeof GroupChatSummarySchema>;

export const GroupChatSnapshotSchema = z.object({
  id: Id,
  name: z.string(),
  members: z.array(GroupChatMemberSchema),
  messages: z.array(GroupChatMessageSchema),
  activeRuns: z.array(GroupChatActiveRunSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type GroupChatSnapshot = z.infer<typeof GroupChatSnapshotSchema>;

export const ModelCredentialSchema`,
);

replaceOnce(
  "packages/contracts/src/rpc.ts",
  `  ExportManifestSchema,\n  MemoryDocumentSchema,`,
  `  ExportManifestSchema,\n  GroupChatSnapshotSchema,\n  GroupChatSummarySchema,\n  MemoryDocumentSchema,`,
);
replaceOnce(
  "packages/contracts/src/rpc.ts",
  `  bots: {\n    list: oc.output(z.array(BotSchema)),\n    get: oc.input(botId).output(BotSchema),\n    create: oc.input(CreateBotInput).output(BotSchema),\n    update: oc.input(UpdateBotInput).output(BotSchema),\n    remove: oc.input(botId).output(z.object({ ok: z.literal(true) })),\n  },\n  threads: {`,
  `  bots: {
    list: oc.output(z.array(BotSchema)),
    get: oc.input(botId).output(BotSchema),
    create: oc.input(CreateBotInput).output(BotSchema),
    update: oc.input(UpdateBotInput).output(BotSchema),
    remove: oc.input(botId).output(z.object({ ok: z.literal(true) })),
  },
  groupChats: {
    list: oc.output(z.array(GroupChatSummarySchema)),
    get: oc.input(z.object({ groupChatId: Id })).output(GroupChatSnapshotSchema),
    create: oc
      .input(z.object({ name: z.string().trim().min(1).max(80), botIds: z.array(Id).min(2).max(12) }))
      .output(GroupChatSnapshotSchema),
    update: oc
      .input(
        z.object({
          groupChatId: Id,
          name: z.string().trim().min(1).max(80).optional(),
          botIds: z.array(Id).min(2).max(12).optional(),
        }),
      )
      .output(GroupChatSnapshotSchema),
    remove: oc.input(z.object({ groupChatId: Id })).output(z.object({ ok: z.literal(true) })),
    send: oc
      .input(
        z.object({
          groupChatId: Id,
          text: z.string().min(1),
          clientNonce: z.string().max(160).optional(),
        }),
      )
      .output(
        z.object({
          messageSeq: z.number().int().nonnegative(),
          responderBotIds: z.array(Id),
          busyBotIds: z.array(Id),
          runIds: z.array(Id),
        }),
      ),
    stop: oc.input(z.object({ groupChatId: Id })).output(z.object({ ok: z.literal(true) })),
  },
  threads: {`,
);

unlinkSync(".github/scripts/group-domain-green.mjs");
unlinkSync(".github/workflows/group-domain-green.yml");
