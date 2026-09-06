CREATE TABLE "bot_action_policies" (
  "botId" TEXT NOT NULL PRIMARY KEY REFERENCES "bots"("id") ON DELETE CASCADE,
  "workspaceId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "config" JSONB NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "bot_action_policies_workspaceId_userId_idx" ON "bot_action_policies"("workspaceId", "userId");

CREATE TABLE "action_approvals" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "botId" TEXT NOT NULL REFERENCES "bots"("id") ON DELETE CASCADE,
  "workspaceId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "runId" TEXT NOT NULL REFERENCES "runs"("id") ON DELETE CASCADE,
  "threadId" TEXT NOT NULL,
  "executionId" TEXT NOT NULL,
  "leaseOwner" TEXT NOT NULL,
  "leaseFence" INTEGER NOT NULL,
  "tool" TEXT NOT NULL,
  "computerKind" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "request" JSONB NOT NULL,
  "preview" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "decision" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "resolvedAt" TIMESTAMP(3)
);
CREATE UNIQUE INDEX "action_approvals_runId_executionId_key" ON "action_approvals"("runId", "executionId");
CREATE INDEX "action_approvals_workspaceId_userId_status_createdAt_idx" ON "action_approvals"("workspaceId", "userId", "status", "createdAt");
