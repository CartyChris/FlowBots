# Rakazo Local AI OS — Implementation Plan

> **Execution rule:** use TDD for behavioral changes. A stage is accepted only after a failable external check. Do not weaken the approved design or acceptance criteria to make a stage pass.

**Goal:** Deliver a self-contained macOS-first Rakazo with Lite / Full Local / Remote modes plus provider freedom, CLI/MCP bridges, Markdown brains, hierarchical orchestration, feedback-driven growth, verification gates, tracing/evals, and cost controls while reconciling the fork with current upstream.

**Architecture:** Build on upstream `f3ca2353...`; port the fork's valuable persona/social/Ollama/desktop work forward. Lite reuses upstream `createApp`, Pi runtime, executor, in-memory jobs/realtime, and DesktopSandboxProvider. Embedded PGlite supplies persistent PostgreSQL semantics through one local `pg` connection; Full/Remote retain existing topology.

## Stage map and failable outputs

### Stage 1 — Freeze target and reconcile base
**Output:** approved design, immutable manifest, feature branch based on current upstream, fork feature inventory.
**Pass:** manifest exists, every item initially `passes:false`, branch base is upstream head, no acceptance criterion is agent-editable by runtime code.

### Stage 2 — Lite database/runtime RED
**Output:** failing tests for embedded runtime lifecycle, migration application, restart persistence, memory jobs, loopback health.
**Pass:** CI fails specifically because LocalRuntime APIs do not yet exist.

### Stage 3 — Lite database/runtime GREEN
**Output:** embedded PGlite single-connection runtime, local migration ledger, API start/stop, memory jobs/realtime.
**Pass:** no Docker/Postgres service is started; smoke creates data, stops, restarts, reads same data; `/health` says lite/memory/desktop.

### Stage 4 — Desktop runtime launcher RED/GREEN
**Output:** first-run Lite/Full/Remote profile and recovery/connection center.
**Pass:** tests prove first launch defaults to launcher; Lite launches embedded runtime; Full/Remote never silently start Lite; unhealthy origin yields actionable recovery instead of blank screen.

### Stage 5 — Fork capability reconciliation
**Output:** port personas, social/Buzz/Lounge, onboarding, Ollama/custom endpoint fix, connection-center improvements, package workflow on top of current upstream.
**Pass:** upstream tests stay green plus focused persona/social/Ollama/desktop tests.

### Stage 6 — Provider & Model Hub
**Output:** provider registry + model catalog union (defaults/synced/custom), arbitrary OpenAI-compatible endpoints, capability metadata, provider sync status.
**Pass:** custom model survives failed/successful sync and is immediately routable; one dead provider does not block sync-all; unknown capabilities are null, not guessed.

### Stage 7 — CLI Agent Bridge
**Output:** discovery and safe invocation adapters for Claude Code, Codex, Kimi Code, OpenCode, Prime Agent/custom command.
**Pass:** argv construction tests show no shell interpolation; timeout/cancel reaps child; missing binary returns actionable error; read-only and workspace-write policy mapping is explicit; fake CLI integration streams structured events.

### Stage 8 — MCP Hub
**Output:** stdio + Streamable HTTP MCP client registry and tool gating.
**Pass:** real throwaway MCP server initializes, lists tools, computes 40+2=42, malformed/missing binary is actionable, child is reaped, HTTP JSON and SSE replies both parse.

### Stage 9 — Brain Folders
**Output:** canonical Markdown roots, scanner/index, cited retrieval, policy-bound diff writes, growth/failure/preference conventions.
**Pass:** traversal and symlink escapes rejected; source path/heading returned; changed file reindexes; proposed write does not mutate until approved; frozen eval roots cannot be attached writable.

### Stage 10 — Agent Studio and hierarchy
**Output:** role profiles, relationship/personality customization, autonomy/tool/brain/model policies; persona integration preserved.
**Pass:** orchestrator can assign two different roles to different providers; role override is visible in events; disallowed tool/brain root stays unavailable.

### Stage 11 — Long-horizon harness
**Output:** immutable feature manifest, one-feature rounds, append-only progress, checkpoints, independent verifier/pass gate, handoffs.
**Pass:** builder output saying `passes:true` cannot change pass state; a candidate with high judge score + one objective runtime error fails; accepted feature creates checkpoint; restart reconstructs current feature from log.

### Stage 12 — Local-model safety operator
**Output:** bounded local-worker tasks, context/temperature/concurrency settings, staged mutation, external verifier/escalation.
**Pass:** local worker's unverified edit cannot reach promoted workspace; failed verification rolls back; verifier or independent model required; empty/invalid local response triggers handoff rather than false success.

### Stage 13 — Observability + cost controls
**Output:** hierarchical model/tool spans, usage/cached/reasoning accounting, local quality heuristics, budgets, CPCT metrics, optional OTLP exporter.
**Pass:** concurrent child spans retain correct parents; positive/negative heuristic controls; hard pre-call budget stops; abandoned spend included in CPCT.

### Stage 14 — Golden traces, feedback, improvement loop
**Output:** goldens, user grading, compact standing-feedback block, functional behavior voting, safe self-improvement proposal/eval/promotion ledger.
**Pass:** new high-severity regression beats cost win; negative feedback is reused; sampling bypasses response cache; agent cannot write frozen eval; losing experiment is not promoted.

### Stage 15 — Social growth integration
**Output:** accepted lessons/preferences/fixes written to Brain Markdown; agents can ask rate-limited feedback; Buzz/Lounge surfaces reflect evolving roles without fabricating persistent memories.
**Pass:** feedback cadence can be disabled; accepted feedback creates auditable Markdown update; rejection leaves brain unchanged.

### Stage 16 — UI integration
**Output:** Runtime Center, Provider Hub, CLI Agents, MCP Hub, Brain Folders, Agent Studio, Orchestration/Trace/Cost/Evals panels while retaining Chat/Buzz/Lounge.
**Pass:** no blank states for disconnected/zero-provider/zero-brain cases; keyboard access and narrow-window smoke; all settings round-trip.

### Stage 17 — Full regression and packaging
**Output:** complete CI, universal macOS DMG, changelog/readme/self-host docs, clean PR.
**Pass:** lint/check/test/integration/e2e applicable gates green; Lite smoke green without Docker; DMG artifact exists; review finds no confirmed blocker.

## Implementation work units

### 1. Branch/base reconciliation
- Base feature branch on upstream current head.
- Reintroduce fork-added files only when they remain valuable.
- For overlapping files, merge behavior rather than replacing upstream reliability/security improvements.
- Re-number custom DB migrations after current upstream migrations.

### 2. New local runtime
Files expected:
- `apps/local-runtime/package.json`
- `apps/local-runtime/tsconfig.json`
- `apps/local-runtime/src/index.ts`
- `apps/local-runtime/src/migrations.ts`
- `apps/local-runtime/src/runtime.test.ts`
- changes to `apps/api/package.json` to export `createApp`
- changes to DB client helpers only if needed

Design:
- PGlite persists under desktop userData.
- PGlite socket binds 127.0.0.1; Prisma's existing `@prisma/adapter-pg` consumes a `pg.Pool` constrained to one connection.
- LocalRuntime passes external Prisma into `createApp`, `wakeupDriver:'memory'`, `sandboxProvider:'desktop'`.
- LocalRuntime owns all lifecycle resources and shuts them down in reverse order.
- migration SQL is read from bundled migration resources and a Lite migration ledger prevents re-application.

### 3. Desktop
- Preserve sandboxed BrowserWindow renderer.
- Main process owns runtime selection and local process capabilities; renderer gets only narrow IPC.
- Settings stored under Electron userData.
- packaged resources include web build and migrations.
- Lite health gate before navigation.
- Runtime Center allows changing mode intentionally.

### 4. Adapter registries
Prefer extending `packages/adapters` rather than creating one package per feature:
- `provider-registry.ts`
- `cli-agent.ts`
- `mcp-client.ts`
- `orchestration.ts`
- `run-trace.ts`
- `evaluation.ts`

Use existing `adapter-kit` contracts when a generic interface already exists; add contracts only at shared boundaries.

### 5. Memory/brain
Extend `packages/memory` for filesystem-backed brain roots and retrieval. Keep DB/JSON index metadata disposable. Markdown remains canonical.

### 6. Schema
Add only durable entities that need cross-mode/server persistence, likely:
- Bot persona/relationship/autonomy/profile fields (reconciled from fork)
- ProviderProfile / model custom metadata as needed
- BrainRoot metadata
- AgentFeedback
- RunSpan or compact RunTrace metadata
- GoldenRun
- LongTaskManifest/Feature/Progress if not representable in existing Task/Run/Event models

Prefer existing `Connection`, `CapabilityInstall`, `MemoryDocument`, `UsageRecord`, `Event`, `Task`, and `Run` structures over new tables when their semantics fit.

### 7. Provider routing
- Preserve Pi provider catalog/OAuth from upstream.
- Port fork Ollama provider and configured-base-URL regression.
- Introduce user-defined OpenAI-compatible provider config.
- Live model discovery is advisory; manual model IDs are authoritative user input.

### 8. CLI safety
- direct argv spawn
- canonical cwd and allowed roots
- explicit read-only/workspace-write mode
- no raw subscription-token extraction
- command/version capability probes
- timeout/cancel/output limits
- structured event normalization

### 9. Orchestration safety
- immutable criteria hash
- builder receives criteria read-only
- verifier owns pass transition
- checkpoint before/after candidate mutations
- role-level budgets and tool policies
- local worker output staged separately

### 10. Prompt/context architecture
Stable blocks first:
1. system/product safety
2. agent identity/persona
3. user-approved standing feedback
4. role/skill instructions
5. relevant brain context
Then volatile:
6. task/current feature
7. recent events/tool state

Do not store or surface hidden chain-of-thought. Use plans/reasoning summaries/tool evidence as handoff artifacts.

### 11. Evaluation
- objective executable criteria first
- regressions second
- independent judge as tiebreaker
- cost/latency comparison after correctness
- functional behavior keys for best-of-N
- frozen eval directory outside writable roots

## Verification commands / CI gates

Use the current upstream command family:

```bash
pnpm lint
pnpm check
pnpm test
pnpm test:integration
pnpm test:e2e
```

Focused tests run first on each RED/GREEN cycle. macOS packaging runs after full green.

## Rollback policy

Every accepted stage is a known-good commit/checkpoint. A failed stage stays unmerged. If a new optimization worsens correctness or CPCT beyond the configured noise band, delete the losing experiment rather than accumulating dead feature flags.

## Final self-review checklist

- [ ] No user requirement silently dropped
- [ ] Lite has zero Docker/Postgres/Terminal prerequisite
- [ ] Full Local and Remote still work
- [ ] subscription-backed CLI integrations invoke supported clients rather than stealing credentials
- [ ] arbitrary provider/model escape hatch exists
- [ ] local models cannot self-approve mutations
- [ ] brain files are canonical and diff-auditable
- [ ] frozen evals are non-writable by agents
- [ ] objective failures override judge prose
- [ ] costs/tokens/abandoned work are visible
- [ ] MCP/CLI process lifecycle is bounded and secure
- [ ] personality/social features remain first-class
- [ ] upstream security/reliability improvements were preserved
- [ ] universal macOS artifact built from the final reviewed commit
