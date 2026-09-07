ALTER TABLE "tasks"
  ADD COLUMN "parentTaskId" TEXT,
  ADD COLUMN "rootTaskId" TEXT,
  ADD COLUMN "collaborationKey" TEXT,
  ADD COLUMN "contextPacket" JSONB;

ALTER TABLE "tasks" ADD CONSTRAINT "tasks_parentTaskId_fkey"
  FOREIGN KEY ("parentTaskId") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE UNIQUE INDEX "tasks_parentTaskId_collaborationKey_key" ON "tasks"("parentTaskId", "collaborationKey");
CREATE INDEX "tasks_rootTaskId_idx" ON "tasks"("rootTaskId");

CREATE TABLE "collaboration_requests" (
  "parentTaskId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "collaboration_requests_pkey" PRIMARY KEY ("parentTaskId", "requestId"),
  CONSTRAINT "collaboration_requests_parentTaskId_fkey" FOREIGN KEY ("parentTaskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
