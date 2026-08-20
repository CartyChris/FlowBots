CREATE TABLE "message_reactions" (
  "id" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "actorKey" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "message_reactions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "message_reactions_messageId_fkey"
    FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "message_reactions_messageId_actorKey_kind_key"
  ON "message_reactions"("messageId", "actorKey", "kind");
CREATE INDEX "message_reactions_messageId_idx" ON "message_reactions"("messageId");
CREATE INDEX "message_reactions_workspaceId_idx" ON "message_reactions"("workspaceId");
