# FlowBots Local Social Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the FlowBots macOS app independently local-first, internet/browser capable, model/CLI aware, expressive, collaborative, and shippable as a verified universal DMG.

**Architecture:** Preserve the existing app/runtime boundaries and reuse the already-present Ollama, CLI, Prime Agent, MCP, sandbox, connector, and child-bot machinery. Add capabilities at shared adapter/router boundaries, expose them through small focused UI components, and selectively port upstream Rakazo behavior rather than blind-merging the histories. Keep host-powerful actions opt-in and explicitly bounded.

**Tech Stack:** TypeScript, React, Electron, Hono/oRPC, Prisma/PGlite, pi-ai, Vitest, Playwright, GitHub Actions, electron-builder.

**Spec:** `docs/superpowers/specs/2026-08-18-flowbots-local-social-agent.md`

## Global Constraints

- Packaged desktop must not require Rakazo sign-in or Rakazo-hosted services.
- No new dependency when existing platform/runtime code can cover the requirement.
- Production behavior changes follow RED → GREEN → refactor.
- Host-destructive or privilege-changing actions require explicit user approval.
- URL tools must block private/loopback/link-local/credentialed/non-HTTP(S) targets, including redirects.
- CLI execution stays `shell: false` and output/timeout bounded.
- UI animation must respect `prefers-reduced-motion`.
- Do not invent provider model IDs; discover/refresh or allow manual IDs.

---

### Task 1: Capability manifest + safe web fetch

**Files:**
- Modify: `packages/adapters/src/builtin-tools.ts`
- Create: `packages/adapters/src/web-fetch.ts`
- Create: `packages/adapters/src/web-fetch.test.ts`
- Modify: `packages/adapters/src/index.ts`
- Modify: `packages/adapters/src/executor.ts`

**Interfaces:**
- Produces: `safeWebFetch(input, opts)` returning `{ url, status, contentType, text, truncated }`.
- Produces runtime tool: `web_fetch({ url, max_chars? })`.

- [ ] Write tests that reject `localhost`, loopback/private IPv4, IPv6 loopback/ULA/link-local, embedded credentials, non-http(s), and redirect-to-private targets.
- [ ] Write a passing-network-fixture test for bounded public text output and truncation.
- [ ] Verify RED in CI/unit test output.
- [ ] Implement URL validation + DNS resolution checks using Node built-ins only.
- [ ] Wire `web_fetch` into built-in tools and executor; add an explicit capability instruction that says when web fetch/browser/connectors are actually available.
- [ ] Verify GREEN and regression suite.

### Task 2: Local identity and no-login desktop boot

**Files:**
- Create: `apps/local-runtime/src/local-identity.ts`
- Create: `apps/local-runtime/src/local-identity.test.ts`
- Modify: `apps/local-runtime/src/index.ts`
- Create: `apps/web/src/lib/local-desktop.ts`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/pages/Shell.tsx`
- Modify: `apps/desktop/src/preload.cjs`
- Modify: `apps/desktop/src/main.ts`

**Interfaces:**
- Produces: local desktop bridge flag `isLocalDesktop`.
- Produces: idempotent local user/workspace bootstrap and local session establishment.

- [ ] Add a failing local-runtime test proving first boot creates/reuses exactly one local user/workspace.
- [ ] Add a failing web routing test proving local-desktop mode reaches onboarding/app without manual sign-in.
- [ ] Implement idempotent local identity bootstrap at local runtime startup.
- [ ] Expose only a boolean/local runtime signal through preload; do not expose secrets.
- [ ] Route local desktop straight into local onboarding/app and remove the visible Log out path in local mode.
- [ ] Verify normal hosted auth behavior is unchanged outside local desktop mode.

### Task 3: Dynamic Ollama + refreshable model catalog

**Files:**
- Modify: `packages/adapters/src/ollama-provider.ts`
- Modify: `packages/adapters/src/pi-models.ts`
- Create: `packages/adapters/src/model-catalog.ts`
- Create: `packages/adapters/src/model-catalog.test.ts`
- Modify: `apps/api/src/router.ts`
- Modify: model-management UI component(s) discovered in the current tree.

**Interfaces:**
- Produces: `listModelCatalog({ refresh, signal })` including discovered Ollama entries.
- RPC model list accepts/uses refresh semantics without a process-lifetime stale cache.

- [ ] RED: emulate Ollama `/api/tags`; assert every tag appears and subsequent refresh reflects changed tags.
- [ ] GREEN: reuse `ollamaModelIds` and replace module-lifetime immutable catalog caching with refreshable cache.
- [ ] Add UI Refresh button and visible local-provider status.
- [ ] Preserve manual provider/model ID entry as fallback.

### Task 4: CLI / harness center

**Files:**
- Modify: `packages/adapters/src/cli-agent.ts`
- Modify: `packages/adapters/src/harness-registry.ts`
- Create or modify: Gemini CLI adapter/test.
- Modify: API contracts/router to list probes.
- Create: `apps/web/src/pages/HarnessesOverlay.tsx`
- Modify: `apps/web/src/pages/Shell.tsx`

**Interfaces:**
- RPC returns harness definitions + availability/version/capabilities.
- User can launch bounded headless tasks through supported harness definitions.

- [ ] RED: Gemini CLI invocation/probe and representative available/unavailable harness snapshots.
- [ ] GREEN: add Gemini to existing registry; preserve Claude/Codex/Kimi/OpenCode/Prime boundaries.
- [ ] Surface Harnesses in UI without copying CLI OAuth tokens.
- [ ] Add custom CLI form with explicit executable + argv fields, never a shell command string.

### Task 5: Local Composio + MCP connection center

**Files:**
- Modify: `apps/local-runtime/src/index.ts`
- Modify: local secret/config storage module(s).
- Modify: `apps/web/src/pages/PluginsOverlay.tsx`
- Create: `apps/web/src/pages/McpOverlay.tsx`
- Modify: router/contracts for local Composio key + MCP definitions/test.
- Reuse: `packages/adapters/src/mcp-client.ts`.

- [ ] RED: local runtime configured Composio key reaches connector stack; absent key leaves catalog clearly disabled.
- [ ] RED: stored MCP stdio/HTTP definition can be tested and returns tools.
- [ ] GREEN: encrypted local config path and connection UI.
- [ ] Port upstream Connected/All plugin tab behavior and connection state handling.

### Task 6: Build-my-cloud / Docker computer flow

**Files:**
- Reuse/modify: `packages/adapters/src/execution-targets.ts`
- Reuse/modify: `packages/adapters/src/sandbox-factory.ts`
- Port relevant upstream Team/Private computer code.
- Create: `apps/web/src/pages/ComputerSetupOverlay.tsx`
- Modify: `apps/web/src/pages/Shell.tsx`

- [ ] RED: Docker probe reports unavailable/available deterministically and setup never runs without approval token/state.
- [ ] GREEN: expose setup wizard with This Mac vs Docker-backed computer, Team vs Private when supported.
- [ ] Verify Docker setup using post-start probe, not only `docker compose up` exit code.

### Task 7: Bot peer messaging + bounded collaboration

**Files:**
- Modify contracts/schema/migrations for peer message/reaction metadata only where existing message/event tables cannot represent it cleanly.
- Modify: `packages/adapters/src/builtin-tools.ts`
- Modify: `packages/adapters/src/executor.ts`
- Modify API router.
- Modify: `apps/web/src/pages/Shell.tsx`

**Interfaces:**
- Runtime tool: `message_bot({ bot_id, message })`.
- Guard: bounded per-run peer sends and no automatic recursive re-trigger chain beyond configured hop limit.

- [ ] RED: peer message reaches target thread/activity and recursive ping-pong is stopped by hop/send budget.
- [ ] GREEN: implement through existing thread/event/job primitives.
- [ ] Surface peer-origin context in message blocks and activity UI.

### Task 8: Reactions and social activity

**Files:**
- Add minimal reaction persistence/API or reuse message block metadata if it can support durable reactions safely.
- Create: `apps/web/src/components/MessageReactions.tsx`
- Modify: `apps/web/src/pages/Shell.tsx`

- [ ] RED: add/remove/toggle reaction behavior; same actor+emoji is idempotent.
- [ ] GREEN: heart/like/eyes reactions, hover affordance, counts, keyboard labels.
- [ ] Allow bot-authored reactions only through bounded explicit tool behavior, never autonomous reaction storms.

### Task 9: Personality presets + expressive agent instructions

**Files:**
- Create: `packages/core/src/bot-personality.ts`
- Create: `packages/core/src/bot-personality.test.ts`
- Modify bot contracts/schema if persistence fields are needed.
- Modify: `packages/adapters/src/executor.ts`
- Modify bot create/settings UI.

- [ ] RED: each preset resolves to stable behavioral guidance without changing permissions.
- [ ] GREEN: presets Developer, Researcher, Employee, Friend, Coach, Custom.
- [ ] Runtime instructions explicitly encourage initiative, concrete next actions, and tool use while forbidding fabricated completion claims.

### Task 10: Animated selectable bot faces

**Files:**
- Modify: `packages/ui-web/src/bot-avatar.tsx`
- Create: `packages/ui-web/src/bot-avatar.test.tsx` if package test setup exists; otherwise smallest available component/unit test location.
- Modify bot settings/create UI to select face style.

- [ ] RED: working/thinking state produces status semantic and reduced-motion disables continuous gaze/micro-expression timers.
- [ ] GREEN: CSS/React-native animation using existing dependencies only; blinking, gaze, lids/mouth/visor expression variants, random-but-bounded micro-expression cadence.
- [ ] Keep visual animation lightweight enough for many sidebar bots.

### Task 11: Fix composer `+` with real actions

**Files:**
- Modify: `apps/desktop/src/preload.cjs`
- Modify: `apps/desktop/src/main.ts`
- Create: `apps/web/src/components/ComposerActions.tsx`
- Modify: `apps/web/src/pages/Shell.tsx`
- Add web/desktop regression tests.

- [ ] RED: clicking/keyboard-activating `+` opens a menu; current static span fails this test.
- [ ] Add safe IPC file/folder chooser(s) returning approved paths/metadata only.
- [ ] GREEN: file, folder/workspace, screenshot/computer context, connections/tools actions.
- [ ] Verify menu closes on Escape/outside click and remains keyboard accessible.

### Task 12: Selective upstream parity

**Files:**
- Port only confirmed relevant upstream diffs: model management, Team/Private Computer, routine edit/delete, Composio UX, startup/reliability fixes.
- Update tests alongside each port.

- [ ] Create a 30-commit upstream parity matrix with status: already superseded / port / intentionally not applicable.
- [ ] For each `port`, reproduce upstream test or equivalent before behavior change.
- [ ] No blind merge of upstream main into the fork.

### Task 13: Fable judge + product gate rewrite pass

**Files:**
- Create: `docs/superpowers/reviews/2026-08-18-flowbots-local-social-agent-judge.md`

- [ ] Judge against: fun, breadth of workflows, personable/social/collaborative behavior, internet usefulness, local independence, safety, performance.
- [ ] Every confirmed deficiency must trace to a test/source before being flagged.
- [ ] Fix confirmed deficiencies, rerun invalidated checks, then update judge result.

### Task 14: Final CI + universal macOS DMG acceptance

**Files:**
- Modify: `.github/workflows/package-flowbots-macos.yml` only as needed to cover the new acceptance gates.

- [ ] Run PR CI: lint, typecheck, production build, unit, integration, web E2E.
- [ ] Run package workflow on feature branch.
- [ ] Mount DMG; verify resources, bundle name, x86_64 + arm64 app binary, node-pty architecture split.
- [ ] Launch packaged executable for smoke window and fail on fatal main-process errors.
- [ ] Upload universal DMG artifact and record SHA-256.
- [ ] Download the exact passing artifact for delivery.
