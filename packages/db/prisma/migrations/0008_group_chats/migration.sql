-- CreateTable
CREATE TABLE "group_chats" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nextMessageSeq" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "group_chats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_chat_members" (
    "groupChatId" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_chat_members_pkey" PRIMARY KEY ("groupChatId","botId")
);

-- CreateTable
CREATE TABLE "group_messages" (
    "id" TEXT NOT NULL,
    "groupChatId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "authorKind" TEXT NOT NULL,
    "botId" TEXT,
    "authorName" TEXT,
    "authorColor" TEXT,
    "blocks" JSONB NOT NULL,
    "runId" TEXT,
    "clientNonce" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_messages_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN "groupChatId" TEXT,
ADD COLUMN "groupPromptSeq" INTEGER;

-- AlterTable
ALTER TABLE "runs" ADD COLUMN "groupChatId" TEXT,
ADD COLUMN "groupPromptSeq" INTEGER;

-- CreateIndex
CREATE INDEX "group_chats_workspaceId_userId_updatedAt_idx" ON "group_chats"("workspaceId", "userId", "updatedAt");

-- CreateIndex
CREATE INDEX "group_chat_members_botId_idx" ON "group_chat_members"("botId");

-- CreateIndex
CREATE UNIQUE INDEX "group_messages_groupChatId_seq_key" ON "group_messages"("groupChatId", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "group_messages_groupChatId_clientNonce_key" ON "group_messages"("groupChatId", "clientNonce");

-- CreateIndex
CREATE INDEX "group_messages_groupChatId_seq_idx" ON "group_messages"("groupChatId", "seq");

-- CreateIndex
CREATE INDEX "group_messages_botId_createdAt_idx" ON "group_messages"("botId", "createdAt");

-- CreateIndex
CREATE INDEX "group_messages_runId_idx" ON "group_messages"("runId");

-- CreateIndex
CREATE INDEX "tasks_groupChatId_groupPromptSeq_idx" ON "tasks"("groupChatId", "groupPromptSeq");

-- CreateIndex
CREATE INDEX "runs_groupChatId_status_idx" ON "runs"("groupChatId", "status");

-- AddForeignKey
ALTER TABLE "group_chats" ADD CONSTRAINT "group_chats_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_chat_members" ADD CONSTRAINT "group_chat_members_groupChatId_fkey" FOREIGN KEY ("groupChatId") REFERENCES "group_chats"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_chat_members" ADD CONSTRAINT "group_chat_members_botId_fkey" FOREIGN KEY ("botId") REFERENCES "bots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_messages" ADD CONSTRAINT "group_messages_groupChatId_fkey" FOREIGN KEY ("groupChatId") REFERENCES "group_chats"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_messages" ADD CONSTRAINT "group_messages_botId_fkey" FOREIGN KEY ("botId") REFERENCES "bots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_messages" ADD CONSTRAINT "group_messages_runId_fkey" FOREIGN KEY ("runId") REFERENCES "runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_groupChatId_fkey" FOREIGN KEY ("groupChatId") REFERENCES "group_chats"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "runs" ADD CONSTRAINT "runs_groupChatId_fkey" FOREIGN KEY ("groupChatId") REFERENCES "group_chats"("id") ON DELETE SET NULL ON UPDATE CASCADE;
