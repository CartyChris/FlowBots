# Interactive Group Chats Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix sticky bot selection and add persistent, true multi-bot group chats without polluting private 1:1 histories.

**Architecture:** Keep individual bot threads unchanged. Add separate group-chat persistence plus optional group metadata on existing Task/Run so the current executor can run real bots with their normal memory/tools while reading/writing the shared room instead of private Message history. UI gets a dedicated group route with persistent rooms, mentions, bounded smart routing, and active responder state.

**Tech Stack:** TypeScript, Prisma/PostgreSQL, ORPC/Zod, React, Vitest, Playwright, GitHub Actions, Electron Builder.

**Spec:** `docs/superpowers/specs/2026-08-26-interactive-group-chats-design.md`

## Global Constraints

- Individual bot private Message history must not receive group user/bot messages.
- Group entities must be scoped to the authenticated `workspaceId` + `userId`.
- Only connected Flow bots may be members/responders.
- Room size 2–12; at most 4 automatic responders per user turn.
- A bot with another active run is busy and must not be double-run.
- Existing run lease/fence/effect/tool/permission controls remain authoritative.
- Automatic recursive bot-to-bot group runs are forbidden.
- Deliver exact verified branch DMG before merging/releasing to `main`.

---

### Task 1: Reproduce and fix sticky bot selection

**Files:**
- Modify: `apps/web/src/pages/Shell.tsx`
- Modify: `apps/web/e2e/creative-runtime.spec.ts`

**Interfaces:**
- Consumes: `useParams().botId`, existing 4-second `refreshBots()` poll.
- Produces: route-current bot-id ref used by background refresh decisions.

- [ ] **Step 1: Add RED Playwright regression** that creates/selects a non-first bot, waits 8.5 seconds, and requires URL/header/composer to remain on that bot.
- [ ] **Step 2: Run the single E2E test** and require failure caused by redirect to the first bot.
- [ ] **Step 3: Add `currentBotIdRef`** whose `.current` is refreshed every render and make `refreshBots()` validate that current value instead of the mount-time closure.
- [ ] **Step 4: Re-run the selection E2E** and require PASS across two poll cycles.
- [ ] **Step 5: Run existing web unit/E2E selection-sensitive tests** and keep them green.

### Task 2: Add group-chat persistence and migration

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/0008_group_chats/migration.sql`
- Modify: `packages/contracts/src/domain.ts`
- Modify: `packages/contracts/src/rpc.ts`
- Create: `packages/core/src/group-chat-routing.ts`
- Modify: `packages/core/src/index.ts`
- Create: `packages/core/src/group-chat-routing.test.ts`

**Interfaces:**
- Produces `GroupChat`, `GroupChatMember`, `GroupMessage` Prisma models.
- Adds nullable `groupChatId` and `groupPromptSeq` to `Task` and `Run`.
- Produces contract types `GroupChatSummary`, `GroupChatSnapshot`, `GroupChatMessage`, `GroupChatActiveRun`.
- Produces `resolveGroupResponders(prompt, members)` and `extractGroupMentions(prompt, members)`.

- [ ] **Step 1: Add RED unit contracts** for explicit `@Bot`, `@all`, relevance routing, fallback, max-4 bound, and case-insensitive name matching.
- [ ] **Step 2: Run focused core test** and confirm missing module/API RED.
- [ ] **Step 3: Add Prisma models/relations** and explicit SQL migration with all FKs/indexes/unique sequence constraint.
- [ ] **Step 4: Add Zod/domain/RPC schemas** for list/get/create/update/remove/send/stop.
- [ ] **Step 5: Implement deterministic responder routing** with isolated membership filtering supplied by caller.
- [ ] **Step 6: Run `pnpm db:generate`, focused contract tests, and typecheck** for the new schema surface.

### Task 3: Add atomic group message helpers and group-run finalization

**Files:**
- Create: `packages/db/src/group-messages.ts`
- Create: `packages/db/src/group-messages.test.ts`
- Modify: `packages/db/src/index.ts`
- Create: `packages/adapters/src/group-run.ts`
- Create: `packages/adapters/src/group-run.test.ts`

**Interfaces:**
- Produces `createGroupMessage(prisma, input)` using atomic room sequence increment.
- Produces `finalizeGroupRun(prisma, input)` mirroring normal lease/fence/task/attempt terminal guarantees while creating a `GroupMessage` on completion.

- [ ] **Step 1: RED tests** for monotonic group sequence and group finalization not creating private `Message` rows.
- [ ] **Step 2: Run focused tests** and confirm missing helpers RED.
- [ ] **Step 3: Implement group message transaction** using `GroupChat.nextMessageSeq` increment + unique `(groupChatId, seq)`.
- [ ] **Step 4: Implement group finalizer** guarded by run id/workspace/thread/bot/task/status/lease owner/fence and update Run/Attempt/Task atomically.
- [ ] **Step 5: Re-run focused tests** and require GREEN.

### Task 4: Make executor group-aware without weakening bot runtime

**Files:**
- Modify: `packages/adapters/src/executor.ts`
- Create: `packages/adapters/src/group-executor.test.ts`

**Interfaces:**
- Consumes `Run.groupChatId/groupPromptSeq`.
- For group runs, loads recent `GroupMessage` rows and formats author-labeled runtime history.
- Adds a group-room system instruction and routes terminal persistence through `finalizeGroupRun`.

- [ ] **Step 1: RED executor test**: a group run must expose room history to the runtime and complete into GroupMessage while private Message count is unchanged.
- [ ] **Step 2: Run focused test** and confirm existing executor writes private thread / lacks group history.
- [ ] **Step 3: Add group-history loader/formatter** bounded to 200 messages and preserving user/bot authorship labels.
- [ ] **Step 4: Add group system instruction** naming room/members and prohibiting impersonation/repetition/recursive automatic handoff.
- [ ] **Step 5: Branch terminal success/failure through group finalizer** when `run.groupChatId` is set; retain normal events/run lifecycle otherwise.
- [ ] **Step 6: Re-run executor tests and full adapter unit tests**.

### Task 5: Add authenticated group-chat RPC handlers and bounded orchestration

**Files:**
- Modify: `apps/api/src/router.ts`
- Create: `apps/api/src/group-chats.test.ts`

**Interfaces:**
- Implements `groupChats.list/get/create/update/remove/send/stop`.
- `send` persists one user GroupMessage, validates membership, resolves up to four responders, skips busy bots, creates Task/Run rows with group metadata, and enqueues `runContinueJob`.

- [ ] **Step 1: RED API tests** for workspace isolation, minimum/maximum members, separated Flow rejection, mentions, busy-bot skipping, and send persistence.
- [ ] **Step 2: Run focused API tests** and confirm contract handlers missing.
- [ ] **Step 3: Implement room CRUD** with `workspaceId/userId` predicates on every read/write.
- [ ] **Step 4: Implement send orchestration** using `resolveGroupResponders`, active-run checks, and group metadata on Task/Run.
- [ ] **Step 5: Implement stop/remove** so only group runs are cancelled and room deletion cancels active group runs first.
- [ ] **Step 6: Run focused API + Postgres tests**.

### Task 6: Build persistent interactive group-chat UI

**Files:**
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/pages/Shell.tsx`
- Create: `apps/web/src/pages/GroupChat.tsx`
- Create: `apps/web/src/pages/GroupChatCreate.tsx` or inline modal component if smaller
- Modify: `apps/web/e2e/creative-runtime.spec.ts`

**Interfaces:**
- Route `/groups/:groupChatId`.
- Sidebar loads `rpc.groupChats.list()` alongside bots.
- New Group Chat flow picks 2–12 connected bots and names room.
- Group page polls snapshot ~800 ms while active / ~2 s idle, shows authored messages and active responder chips.

- [ ] **Step 1: RED Playwright group test**: create room with two scripted bots, send `@all`, require two distinct bot-authored replies, refresh/reopen, require persistence.
- [ ] **Step 2: Run group E2E** and confirm missing UI/API RED.
- [ ] **Step 3: Add group room sidebar rows + create control** without changing existing bot-click behavior.
- [ ] **Step 4: Add group create UI** filtering out `Separated from Flow` bots and requiring 2–12 selections.
- [ ] **Step 5: Add GroupChat page** with avatar/name author labels, message blocks/files, activity chips, `@all` helper and composer/stop.
- [ ] **Step 6: Add mention assistance** by inserting `@BotName` from member chips.
- [ ] **Step 7: Re-run selection and group E2E**.

### Task 7: Full verification and branch-only DMG delivery

**Files:**
- No production behavior changes unless a verification failure identifies a real defect.

- [ ] **Step 1:** `pnpm lint` — 0 errors.
- [ ] **Step 2:** `pnpm check` — 0 type errors.
- [ ] **Step 3:** `pnpm test` — all non-environment-gated tests pass.
- [ ] **Step 4:** `pnpm test:integration` — Postgres journeys pass with migration.
- [ ] **Step 5:** `pnpm test:e2e` — includes sticky selection >8 s and persistent multi-bot room.
- [ ] **Step 6:** `pnpm build` + Electron smoke.
- [ ] **Step 7:** Build `FlowBots-0.1.0-universal.dmg`, mount it, verify `x86_64 arm64`, validate native `node-pty` slices, launch smoke.
- [ ] **Step 8:** Upload branch artifact; download exact artifact; independently SHA-256 the extracted DMG.
- [ ] **Step 9:** Deliver DMG to user and stop. Do **not** merge to `main` or publish a release in this task.
