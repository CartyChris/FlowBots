# Flow Awareness + Research Verification V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make connected FlowBots automatically know and consult one another, add explicit Flow isolation, harden current/deep research against stale contradictions, and add semantic research/team/build animations.

**Architecture:** Keep the existing peer connector, steering-marker, keyless web, and avatar systems. Add small focused modules for Flow membership/roster and research verification, inject their policies at executor runtime, enforce Flow isolation in peer resolution, and derive richer avatar states from existing tool activity events. No new authority or connector permissions are introduced.

**Tech Stack:** TypeScript, Vitest, Prisma/PostgreSQL, React, Playwright, existing FlowBots adapter/core/contracts/UI packages.

**Spec:** `docs/superpowers/specs/2026-08-26-flow-awareness-research-v2-design.md`

## Global Constraints

- Default Flow membership is `connected`.
- Flow roster stays inside the same `workspaceId` + `userId`.
- `isolated` is two-way for automatic teammate awareness/collaboration.
- Research evidence is untrusted and current-person/office/election/death claims require contradiction checks.
- Existing peer send/hop bounds remain unchanged.
- Animation respects reduced-motion and never changes permissions.
- RED tests land and are observed failing before production implementation.

---

### Task 1: Flow membership and roster contracts

**Files:**
- Create: `packages/adapters/src/flow-awareness.test.ts`
- Create: `packages/adapters/src/flow-awareness.ts`
- Modify: `packages/adapters/src/index.ts`

**Interfaces:**
- Produces `FlowMembership`, `flowMembershipFromInstructions`, `applyFlowMembership`, `buildFlowRoster`, `flowAwarenessInstruction`, `botParticipatesInFlow`.

- [ ] **Step 1: Write failing tests** for connected default, marker round-trip, isolated filtering, bounded same-user roster, and teammate-first instruction.
- [ ] **Step 2: Run** `pnpm --filter @rakazo/adapters test -- flow-awareness.test.ts` and confirm RED because the module/exports do not exist.
- [ ] **Step 3: Implement** deterministic membership markers and roster formatting; preserve unrelated instruction text.
- [ ] **Step 4: Re-run focused test** and require PASS.
- [ ] **Step 5: Commit** `feat: add shared flow awareness`.

### Task 2: Flow-aware peer collaboration

**Files:**
- Modify: `packages/adapters/src/peer-connector.ts`
- Modify: `packages/adapters/src/peer-connector.test.ts`

**Interfaces:**
- Consumes `botParticipatesInFlow(instructions)`.
- Preserves `MAX_PEER_SENDS_PER_RUN = 4` and `MAX_PEER_HOPS = 2`.

- [ ] **Step 1: Add failing connector tests** proving connected bots can resolve each other, isolated targets are rejected, and an isolated source cannot auto-target connected peers.
- [ ] **Step 2: Run** `pnpm --filter @rakazo/adapters test -- peer-connector.test.ts` and confirm RED only on new isolation contracts.
- [ ] **Step 3: Implement** membership checks in source/target peer resolution without weakening workspace/user checks.
- [ ] **Step 4: Re-run peer tests** and require PASS.
- [ ] **Step 5: Commit** `feat: enforce flow collaboration boundaries`.

### Task 3: Research verification policy and tool

**Files:**
- Create: `packages/adapters/src/research-verification.test.ts`
- Create: `packages/adapters/src/research-verification.ts`
- Modify: `packages/adapters/src/builtin-tools.ts`
- Modify: `packages/adapters/src/peer-connector.ts`
- Modify: `packages/adapters/src/agent-evolution-integration.test.ts`
- Modify: `packages/adapters/src/index.ts`

**Interfaces:**
- Produces `ResearchVerificationLevel = "none" | "standard-current" | "volatile-entity" | "deep-research"`.
- Produces `classifyResearchVerificationNeed(prompt)`, `researchVerificationInstruction(level, currentDate)`, and `buildVerificationQueries({claim, entity, currentDate})`.
- Adds built-in `verify_current_claim({claim, entity?, recency_days?})`.

- [ ] **Step 1: Add failing tests** for volatile/deep classification, contradiction query bundles, and built-in tool exposure.
- [ ] **Step 2: Run focused adapter tests** and confirm RED.
- [ ] **Step 3: Implement** deterministic policy/query helpers and peer connector execution using bounded `keylessWebSearch` calls.
- [ ] **Step 4: Re-run focused tests** and require PASS.
- [ ] **Step 5: Commit** `feat: add current-claim verification`.

### Task 4: Executor teammate-first context + research policy

**Files:**
- Modify: `packages/adapters/src/executor.ts`
- Modify: `packages/adapters/src/agent-evolution-integration.test.ts`

**Interfaces:**
- Consumes `buildFlowRoster`, `flowAwarenessInstruction`, `classifyResearchVerificationNeed`, `researchVerificationInstruction`.

- [ ] **Step 1: Add failing integration assertions** that runtime instructions include Susie-like teammate identity by exact name/id, explicitly tell the model to use `read_bot_updates` before web search for teammate-work questions, omit isolated bots, and require contradiction checks for volatile current claims.
- [ ] **Step 2: Run** focused integration test and observe RED.
- [ ] **Step 3: Fetch same-user/workspace bots during run setup**, build bounded roster, inject Flow instruction and V2 research instruction.
- [ ] **Step 4: Re-run focused integration tests** and require PASS.
- [ ] **Step 5: Commit** `feat: inject flow roster into agent context`.

### Task 5: Shared Flow control in Steering Studio

**Files:**
- Modify: `apps/web/src/pages/SteeringStudio.tsx`
- Modify: `apps/web/src/pages/CreativeRuntimeHost.tsx`
- Modify: `apps/web/e2e/creative-runtime.spec.ts`

**Interfaces:**
- `SteeringStudio.onSave(profile, membership)` persists both profile and membership through existing bot instructions update path.

- [ ] **Step 1: Add failing Playwright contract** that Shared Flow defaults to Connected, can be set to Separated, saved, and remains Separated after reopen.
- [ ] **Step 2: Run** `pnpm --filter @rakazo/web test:e2e -- creative-runtime.spec.ts` (or project E2E command) and confirm RED.
- [ ] **Step 3: Implement** compact membership control using `flowMembershipFromInstructions` + `applyFlowMembership` while preserving steering markers.
- [ ] **Step 4: Re-run E2E** and require PASS.
- [ ] **Step 5: Commit** `feat: add shared flow membership control`.

### Task 6: Semantic work animations

**Files:**
- Create: `packages/ui-web/src/bot-work-state.test.ts`
- Create: `packages/ui-web/src/bot-work-state.ts`
- Modify: `packages/ui-web/src/bot-avatar.tsx`
- Modify: `packages/ui-web/src/styles.css`
- Modify: `packages/ui-web/src/index.ts`
- Modify: `apps/web/src/pages/Shell.tsx`

**Interfaces:**
- Expands `BotAvatarState` with `researching | verifying | collaborating | building`.
- Produces `botWorkStateForTool(toolName)` returning one of those semantic states or `undefined`.

- [ ] **Step 1: Add failing unit tests** mapping `web_search/web_fetch → researching`, `verify_current_claim → verifying`, peer/delegation tools → collaborating, file/shell/computer tools → building.
- [ ] **Step 2: Run UI package tests** and confirm RED.
- [ ] **Step 3: Implement state helper and distinct avatar emote/orbit treatments**, including CSS reduced-motion overrides.
- [ ] **Step 4: In Shell subscription**, set a short-lived semantic active-tool state from `agent.tool.called`; fall back to run status afterward.
- [ ] **Step 5: Re-run UI tests and web typecheck/E2E** and require PASS.
- [ ] **Step 6: Commit** `feat: animate semantic bot work states`.

### Task 7: Full verification and release artifact

**Files:**
- Modify only if verification finds a real regression.

- [ ] **Step 1: Run full lint, typecheck, unit, Postgres journeys, Web E2E, production build/Electron smoke on exact PR head.**
- [ ] **Step 2: Build universal macOS DMG, mount it, verify arm64+x86_64 native payloads, and survive packaged startup smoke.**
- [ ] **Step 3: Review the exact diff for scope/safety and confirm no secret/private data is present.**
- [ ] **Step 4: Mark PR ready and merge with expected-head SHA only after all gates are green.**
- [ ] **Step 5: Verify `main` contains the exact merged head and run post-merge CI/package verification.**
- [ ] **Step 6: Download the post-merge DMG, verify its SHA-256 locally, and deliver it.**
