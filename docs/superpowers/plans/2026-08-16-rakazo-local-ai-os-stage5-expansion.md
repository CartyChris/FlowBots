# Rakazo Local AI OS — Stage 5 Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the already-green Lite / Full Local / Remote desktop foundation into a multi-runtime, multi-harness AI operating surface with optional Docker, Prime Agent, OpenHands, Hermes/MoA, Grok Build, Paperclip, Glass Pane, Terminal, Brain v2, durable research drafts, and verifier-gated Dreaming.

**Architecture:** Keep one Rakazo control plane and add optional execution targets/adapters. Reuse `packages/adapters`, `packages/core`, `packages/memory`, existing event/run concepts, Electron main-process authority, and the existing API/router rather than introducing competing control planes. All agent/model/tool activity normalizes into a shared activity span model; Brain and Dreaming remain staged and verifier-gated.

**Tech Stack:** TypeScript, Node 22+, pnpm workspaces, Electron, React/Vite, Vitest, ORPC, Prisma/Postgres/PGlite, child_process/PTY adapter boundary, HTTP/WebSocket/JSONL/ACP/RPC integrations, optional Docker/Paperclip/OpenHands external processes.

## Global Constraints

- Lite must continue to work without Docker, Postgres service, Terminal, or any external harness installed.
- Docker is optional but first-class and may run concurrently as an execution fabric.
- No subscription token extraction; use official CLI/login/session mechanisms.
- Direct argv spawning; no generated shell interpolation for CLI adapters.
- Managed mutations cannot self-approve; objective verifier owns promotion.
- Brain accepted state is auditable Markdown; research drafts and Dreaming candidates are distinct staging state.
- Secret redaction occurs before persistence or Glass Pane display.
- Existing Stage 1–4 tests remain green after every accepted unit.

---

### Task 1: Fork capability reconciliation — personalities/social/Ollama

**Files:**
- Create/port: `packages/core/src/personality.ts`, `packages/core/src/personality.test.ts`, `packages/core/src/social.ts`, `packages/core/src/social.test.ts`
- Modify: `packages/core/src/index.ts`
- Create/port: `packages/adapters/src/ollama-provider.ts`, `packages/adapters/src/ollama-provider.test.ts`, `packages/adapters/src/sync.ts`, `packages/adapters/src/sync.test.ts`
- Modify: `packages/adapters/src/index.ts`, `packages/adapters/src/pi-runtime.ts`, `packages/adapters/src/pi-models.ts`
- Modify: contracts/API/DB/UI files only after pure modules are green.

**Interfaces:**
- Produces persona normalization/system-prompt helpers, social projection helpers, Ollama endpoint/model discovery, and environment credential discovery.

- [ ] Add old-fork focused tests first and run them to confirm missing-module/behavior RED.
- [ ] Port the smallest current-compatible pure implementations from main commit `3f0417e...`.
- [ ] Run focused core/adapter tests; preserve current upstream security/runtime behavior.
- [ ] Integrate contracts/DB/API and web/mobile UI in separate commits with focused tests.
- [ ] Verify custom `OLLAMA_BASE_URL` remains authoritative end to end.

### Task 2: Runtime Fabric and schedule policy

**Files:**
- Create: `packages/core/src/runtime-fabric.ts`, `packages/core/src/runtime-fabric.test.ts`
- Create: `packages/core/src/service-schedule.ts`, `packages/core/src/service-schedule.test.ts`
- Create: `packages/adapters/src/execution-targets.ts`, `packages/adapters/src/execution-targets.test.ts`
- Modify: desktop/runtime settings and API contracts only after pure policy tests are green.

**Interfaces:**
- `RuntimeTargetDefinition`, `RuntimeTargetState`, `ServiceSchedule`, `desiredScheduledState(now, rules)`.
- `ExecutionTargetAdapter.probe/start/stop` with idempotent lifecycle.

- [ ] RED: prove Lite can coexist with a Docker target and scheduling does not mutate the control-plane profile.
- [ ] GREEN: implement target registry + schedule evaluator with timezone-aware explicit inputs.
- [ ] Add Docker probe/start/stop adapter using direct argv (`docker info`, compose/project commands) and explicit user consent.
- [ ] Verify window exit does not kill interactive work unless policy is `terminate-active`.

### Task 3: Universal Harness Registry

**Files:**
- Create: `packages/adapters/src/harness-registry.ts`, `packages/adapters/src/harness-registry.test.ts`
- Create: `packages/adapters/src/structured-process.ts`, `packages/adapters/src/structured-process.test.ts`
- Extend existing adapter-kit contracts only where a shared boundary is absent.

**Interfaces:**
- `HarnessDefinition`, `HarnessProbe`, `HarnessSession`, `HarnessEvent`, `HarnessLaunchRequest`.
- Session methods: `send`, `steer?`, `followUp?`, `abort`, `stop`, `events`.

- [ ] RED: missing binary, argv safety, timeout/cancel, parent-child correlation, and redaction tests.
- [ ] GREEN: implement registry/discovery and bounded child process primitive.
- [ ] Ensure one broken harness cannot block `probeAll()`.

### Task 4: Prime Agent adapter

**Files:**
- Create: `packages/adapters/src/prime-agent.ts`, `packages/adapters/src/prime-agent.test.ts`

**Interfaces:**
- Launch `prime-agent --mode rpc` as JSONL subprocess.
- Map prompt/steer/follow_up/abort/get_state/get_session_stats/observe/schedule events into Harness Registry.

- [ ] RED: JSONL framing must split LF only and preserve U+2028/U+2029 inside JSON strings.
- [ ] GREEN: RPC request correlation, event stream, abort/stop and process reaping.
- [ ] Add capability probes for daemon/status/RPC availability.
- [ ] Map external Prime child/session IDs into Rakazo trace parent-child relationships.
- [ ] Keep Prime refinement as a proposal event; never auto-promote shared Brain/harness state.

### Task 5: OpenHands adapter family

**Files:**
- Create: `packages/adapters/src/openhands.ts`, `packages/adapters/src/openhands.test.ts`

**Interfaces:**
- CLI headless JSON/ACP launch path plus Agent Server HTTP/WebSocket path.

- [ ] RED: CLI discovery, JSON parsing, missing binary, cancel, and Agent Server health/event mapping.
- [ ] GREEN: implement CLI adapter and server adapter under one definition family.
- [ ] Preserve workspace mode/security policy metadata rather than flattening to plain command output.

### Task 6: Hermes + MoA adapter

**Files:**
- Create: `packages/adapters/src/hermes.ts`, `packages/adapters/src/hermes.test.ts`
- Extend model/provider catalog types when required.

**Interfaces:**
- Hermes harness discovery/session launch.
- `HermesMoaPreset` mapped to virtual provider entries with aggregator + references.

- [ ] RED: MoA preset parsing and provider listing; subagent/tool/status event mapping.
- [ ] GREEN: discover Hermes config/presets without copying secrets; expose MoA as selectable virtual models.
- [ ] Keep Hermes memory separate until explicit Brain promotion.

### Task 7: Grok Build / ACP and generic CLI profiles

**Files:**
- Create: `packages/adapters/src/acp-agent.ts`, `packages/adapters/src/acp-agent.test.ts`
- Add Grok/Oh-My-Pi/Kimi/Claude/Codex/OpenCode profiles to harness registry.

**Interfaces:**
- Generic ACP stdio session for agents that support ACP.
- Generic headless process profile for agents that do not.

- [ ] RED: ACP JSON-RPC framing/session/tool update/cancel tests using a fake server.
- [ ] GREEN: Grok `agent ... stdio` profile; fallback `grok -p` profile.
- [ ] Probe exact executable/version/origin for ambiguous tools such as Oh My Pi.

### Task 8: Paperclip managed bridge

**Files:**
- Create: `packages/adapters/src/paperclip.ts`, `packages/adapters/src/paperclip.test.ts`
- Add API contracts for connection/status/companies/agents/tasks/runs only after adapter tests pass.

**Interfaces:**
- Connect to an existing Paperclip URL or managed local sidecar.
- Health/version probe, start/stop, REST calls, run/event correlation.

- [ ] RED: unavailable server/actionable error, safe managed launch argv, health/version, run correlation.
- [ ] GREEN: adapter plus optional managed local setup metadata.
- [ ] Do not embed/fork Paperclip DB into Rakazo.

### Task 9: Glass Pane activity model

**Files:**
- Create: `packages/core/src/activity.ts`, `packages/core/src/activity.test.ts`
- Create: `packages/adapters/src/activity-bus.ts`, `packages/adapters/src/activity-bus.test.ts`
- Add durable DB representation only if existing Event/Run records cannot encode the required query model.

**Interfaces:**
- `ActivitySpan { traceId, spanId, parentSpanId?, coverage, state, harnessId?, provider?, model?, targetId?, usage?, cost?, safeMetadata }`.

- [ ] RED: concurrent child spans retain parents; secret-bearing metadata is redacted; cancellation routes only to managed sessions.
- [ ] GREEN: shared event bus + projection.
- [ ] Add optional process-observed discovery with explicit limited-coverage label.

### Task 10: Integrated Terminal

**Files:**
- Create focused desktop main-process terminal session manager/tests.
- Add web terminal panel/components only after lifecycle tests pass.

**Interfaces:**
- create/write/resize/interrupt/close/attach to managed harness session.

- [ ] RED: process cleanup, resize/input, working-directory policy, no shell injection.
- [ ] GREEN: PTY implementation using an already-installed dependency if present; otherwise add the minimum maintained dependency only after proving Node/Electron cannot supply the required PTY behavior.
- [ ] Every terminal session emits Glass Pane activity.

### Task 11: Brain v2 lifecycle

**Files:**
- Extend: `packages/memory/src/brain-folders.ts` and tests, or split lifecycle into `brain-nodes.ts` if the existing file would become unclear.

**Interfaces:**
- Node states: `accepted | wip | temporary | mistake | candidate`.
- Frontmatter parsing/serialization, expiry, recurrence/mistake matching, provenance.

- [ ] RED: expired nodes excluded, WIP visibly provisional, mistake lookup keyed to task/error signatures, traversal/symlink protections remain intact.
- [ ] GREEN: lifecycle parser/index/retrieval.
- [ ] Require evidence + corrected outcome before a candidate can become a `mistake` rule.

### Task 12: Durable Research Sessions

**Files:**
- Add small durable schema/repository + API contracts.
- Modify Research UI and History UI.

**Interfaces:**
- Research session create/update/reopen/list/clear/promote-selected.

- [ ] RED: route change/reload retains active results; creating a new search does not delete old sessions; clearing does.
- [ ] GREEN: persistent research drafts distinct from Brain.
- [ ] Group History by query/session and preserve captured source metadata.

### Task 13: Dreaming engine

**Files:**
- Create: `packages/core/src/dreaming.ts`, `packages/core/src/dreaming.test.ts`
- Add adapter orchestration integration and Brain staging writer after policy tests pass.

**Interfaces:**
- `DreamingPlan`, role assignments, candidate tree, score/evidence, prune/promote decisions.

- [ ] RED: scouts/synthesizers/critics/verifier roles; rejected branches cannot mutate Brain; budget exhaustion stops cleanly.
- [ ] GREEN: deterministic orchestration state machine over Harness Registry.
- [ ] Add manual trigger and schedule rule.
- [ ] Add source collector registry for HN/Anthropic/Karpathy/ML/X-web/user feeds; every promoted claim retains source/time.
- [ ] Promotion requires verifier + optional user approval policy.

### Task 14: Stage-5 UI convergence

**Files:**
- Add web routes/pages/components for Glass Pane, Terminal, Runtime Center extensions, Harnesses, Paperclip, Brain states, Dreaming, Research History.
- Reconcile existing Buzz/Lounge/persona pages from fork.

- [ ] RED: component/state tests for disconnected/empty states and settings round-trip.
- [ ] GREEN: integrate routes and navigation without removing Chat/Buzz/Lounge.
- [ ] Ensure model picker can choose API/local models, Hermes MoA, and compatible harness-backed sessions.

### Task 15: Stage-5 acceptance gate

**Files:**
- Expand `.github/workflows/local-ai-os.yml` focused checks.
- Update work log and immutable feature manifest only through verifier-owned pass changes.

- [ ] Run focused suites for every Task 1–14 unit.
- [ ] Run `pnpm lint`, `pnpm check`, `pnpm test` and applicable integration/e2e checks.
- [ ] Confirm Lite smoke still passes with Docker absent.
- [ ] Confirm Docker/Prime/OpenHands/Hermes/Paperclip absent states are actionable, not fatal.
- [ ] Skeptical review: search for secret leaks, shell interpolation, orphan child processes, split-brain state, fake activity coverage, and self-approval paths.
- [ ] Record objective evidence in `docs/superpowers/progress/2026-08-16-rakazo-local-ai-os.log.md` before advancing to the later Provider Hub / orchestration / eval / packaging stages.
