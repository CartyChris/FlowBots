# Rakazo Local AI OS — Design

Date: 2026-08-16
Status: Approved by user; implementation target
Base: `elie222/rakazo@f3ca2353fb46af0ace71a7868255994c63aef50d`

## Goal

Turn Rakazo into a self-contained macOS-first “Agentic Slack / Grok Bots” application with three runtime modes while preserving the upstream server architecture and maximizing provider freedom, agent capability, personalization, verifiability, and long-horizon effectiveness.

The product must be useful without Docker or a separately installed PostgreSQL server, but Full Local and Remote must retain the existing production-grade paths. The application must not create a weaker “Lite app” with a separate intelligence stack. All modes share the same core executor, agent runtime, contracts, provider abstractions, memory semantics, and UI wherever practical.

## Non-negotiable design rules

1. **Three runtime modes**
   - `lite` is the default first-run recommendation. It requires no Docker, no separately installed PostgreSQL, and no Terminal setup.
   - `full-local` connects to or manages a normal local Rakazo deployment using PostgreSQL + Graphile Worker + Docker/E2B/Desktop provider as configured.
   - `remote` connects the desktop client to an arbitrary trusted Rakazo HTTPS origin.
2. **Provider freedom**
   - shipped provider/model defaults, live provider model sync, and user-entered custom model IDs are unioned; sync never deletes custom IDs.
   - OpenAI-compatible custom endpoints are first-class.
   - API-key, OAuth/subscription-backed Pi providers, local Ollama, and authenticated local CLI agents may coexist.
   - subscription credentials are never scraped from another CLI. Rakazo invokes the authenticated CLI or uses that provider's supported OAuth path.
3. **Agent hierarchy**
   - a run may use explicit roles: orchestrator, architect, manager, researcher, builder, reviewer, judge, verifier, mentor, specialist, and worker.
   - role -> provider/model/tool policy is user-configurable.
   - auto-routing may choose models only from user-enabled candidates and must surface why the route was chosen.
4. **Local-model safety**
   - local/small models may analyze, draft, and propose.
   - any system/project mutation from an untrusted/local worker must pass an external verification gate before it is accepted.
   - the writer never marks its own work passing. Pass/fail is derived from executable checks, policy, and optionally an independent judge.
5. **Continuous improvement without self-corruption**
   - feedback, failures, fixes, preferences, and successful practices may become proposed brain updates.
   - frozen evaluations and acceptance criteria are outside agent-writable roots.
   - self-improvement applies to a copy/checkpoint first; promotion requires frozen eval pass and no safety regression.
6. **Markdown is canonical memory**
   - user-selected Brain Folders contain ordinary `.md` files that remain usable in Finder, editors, Obsidian, Claude Code, Codex, etc.
   - indexes are disposable acceleration layers, never the canonical truth.
   - writes are diff-based and approval-gated by default.
7. **Measured efficiency**
   - route/evaluation decisions use cost-per-completed-task (CPCT), first-pass yield, latency, call count, and regressions—not token price alone.
   - abandoned spend remains in the numerator.
8. **Observable long-horizon work**
   - model and tool calls form parent/child spans.
   - runs expose progress, current feature/stage, costs, verification state, retries, handoffs, and failures.
   - high-severity observable failures override favorable judge prose or cost wins.
9. **Security is never simplified for convenience**
   - local process/CLI/MCP execution uses argv spawning, explicit working roots, timeouts, output caps, and no implicit shell interpolation.
   - dangerous capabilities are user-controlled, scoped, and visible.
   - Streamable HTTP MCP validates origin/auth; local listeners bind loopback.
10. **Upstream compatibility**
   - Full Local/Remote retain current PostgreSQL/Graphile topology.
   - new functionality lands behind existing adapter/contracts boundaries where possible.
   - do not fork core product behavior into two implementations merely to make Lite work.

## Runtime architecture

### Lite mode

`Electron -> LocalRuntime -> PGlite -> Prisma -> createApp() -> Pi/executor -> DesktopSandboxProvider`

Lite intentionally does **not** run Graphile Worker. Upstream already supports `InMemoryJobQueue`, and `createApp()` runs the background handlers itself when `WAKEUP_DRIVER=memory`. Realtime is in-memory when an externally created Prisma client is supplied. This is the correct single-user boundary.

PGlite is used as embedded PostgreSQL storage, not as a fake SQL compatibility layer. A single `pg.Pool` connection talks to the loopback PGlite socket and feeds the existing `PrismaPg` adapter; this avoids relying on PGlite's multi-connection multiplexer for the normal Lite path. Migrations are applied directly from Rakazo migration SQL before Prisma starts and recorded in a Lite migration ledger. PGlite is an implementation detail of Lite; Full Local remains real PostgreSQL.

The packaged desktop app includes the built web frontend and DB migrations as resources. The LocalRuntime serves API/RPC/auth and static frontend from the same loopback origin. Electron waits for a health check before navigating to it.

### Full Local mode

The desktop app connects to a full local server origin, default `http://127.0.0.1:5173`, and provides diagnostics for missing/unhealthy dependencies. The actual full topology remains PostgreSQL + API + worker + configured sandbox provider. Rakazo does not silently weaken isolation if Docker/E2B was selected.

### Remote mode

The desktop app stores a user-entered HTTPS origin (localhost HTTP remains allowed for development), validates `/health`, and connects as a client. Switching origin clears origin-bound session state as necessary.

## First-run launcher

If no desktop runtime profile exists, show a local first-run launcher before loading Rakazo:

- **Lite — Recommended:** “Runs entirely on this Mac. No Docker or Postgres setup.”
- **Full Local:** “Connect to your full local Rakazo stack.”
- **Remote:** “Connect to a Rakazo server.”

The launcher also becomes a reusable Connection Center reachable from the desktop menu/settings. It reports the selected mode, target origin, health, and actionable recovery steps.

## Provider and Model Hub

A provider definition contains:

- id, label, API shape (`openai-compatible`, native Pi/OAuth, local, CLI)
- base URL
- optional credential reference
- shipped models
- last synced models + metadata + timestamp/error
- custom user-entered model IDs
- capability metadata: context, output ceiling, reasoning controls, tools, vision, pricing, locality

Catalog = `defaults UNION synced UNION custom`. A user-entered ID is never rejected merely because `/models` did not list it.

Provider/model family behavior is pattern/capability based rather than an allowlist so new model IDs work without a Rakazo release.

### Supported routes

- OpenRouter and direct Pi providers
- arbitrary OpenAI-compatible API
- Ollama/local OpenAI-compatible servers
- supported Pi OAuth providers including `openai-codex`
- authenticated local CLI bridges: Claude Code, Codex, Kimi Code, OpenCode, Prime Agent/custom commands
- Z.ai Coding Plan only through officially supported coding tools unless Z.ai explicitly supports direct generic use; direct Z.ai API remains a separate provider route

## CLI Agent Bridge

CLI bridges are capability adapters, not token extractors.

Each bridge declares:

- command discovery/version probe
- supported noninteractive invocation
- structured output mode when available
- plan/read-only vs workspace-write ability
- workspace/additional-directory semantics
- max-turn/time/output controls
- whether the CLI owns its own sandbox/approval layer

Built-in adapters:

- Claude Code: `claude -p`, structured JSON/stream JSON, plan mode for analysis, explicit tool restrictions
- Codex: `codex exec`, JSON mode, `read-only` / `workspace-write` sandbox; use the user's normal authenticated Codex state
- Kimi Code: `kimi -p --output-format stream-json`, working-directory scope and static deny rules
- OpenCode: discovered CLI adapter using its supported noninteractive interface
- Prime Agent: optional external workflow adapter for adversarial review when installed

All child processes have timeouts, cancellation, bounded output, captured stderr, and exact argv spawning. Missing CLIs produce actionable diagnostics instead of generic failures.

## MCP Hub

Support both standard MCP transports:

- stdio: Rakazo launches the child process, performs initialize -> `notifications/initialized` -> tools/list, drains newline-framed JSON, reaps the child on all exit paths.
- Streamable HTTP: POST/GET endpoint, JSON or SSE response handling, session/protocol headers, origin/auth security.

Tool exposure is read-heavy by default. Individual write/destructive tools must be explicitly enabled per server or role. Tool errors return to the model as tool results so an agent can recover without killing the whole run.

## Brain Folders

A user can attach one or more filesystem roots. Each root has:

- display name
- canonical path
- read/write policy
- role/bot visibility
- indexing state

The scanner ingests Markdown metadata/headings/chunks and file hashes. The canonical file is always the source of truth. Search combines lexical/full-text relevance with optional embeddings when the user enables them. Every retrieved fact includes its source path/heading.

Suggested conventions are supported but not required:

- `SOUL.md` — persona/values/style
- `USER.md` — explicit user preferences
- `MEMORY.md` — durable learned context
- `GROWTH.md` — accepted improvements and lessons
- `FAILURES.md` — verified failures + remedies
- `PROJECTS.md` or `projects/*.md`
- `people/*.md`, `research/*.md`, `skills/*.md`

Writes are proposals represented as diffs. Auto-write can be enabled by root and risk class but may never include frozen eval storage.

## Agent identity, personality, and growth

Each bot retains normal Rakazo name/title/color/persona while gaining optional:

- relationship role: friend, mentor, manager, researcher, engineer, critic, coach, custom
- communication traits and sliders
- autonomy level
- preferred role/model routing
- skills/brain access
- feedback cadence
- improvement policy

Feedback records include positive/negative signal, optional note, task/model/run metrics, and active checks. Corrections are weighted more heavily than generic approval when constructing a compact stable preference block.

Agents may periodically ask for general feedback, but this is rate-limited, user-toggleable, and never interrupts an active long-horizon task. Accepted feedback becomes explicit Markdown growth notes; raw silent personality mutation is not allowed.

## Long-Horizon Orchestrator

A long task is initialized into an immutable feature manifest with observable criteria. Every feature starts failing.

Per round:

1. choose exactly one currently failing feature/stage (unless an explicitly parallelizable research fan-out is safe)
2. select role/model using user rules + capability + measured history
3. run work in a copy/worktree/checkpoint
4. run executable verification
5. optional independent judge/critic
6. harness computes pass/fail
7. on pass, checkpoint and append progress; on fail, retain failure evidence and change strategy

The builder cannot modify acceptance criteria or frozen evals, and cannot write its own `passes=true` value.

### Hierarchical roles

- Orchestrator: owns task graph and budgets
- Architect: architecture/spec decisions
- Manager: decomposes and assigns
- Researcher: evidence gathering
- Builder: implementation/content production
- Specialist: domain-specific worker
- Reviewer/Critic: finds concrete issues
- Judge: scores against criteria
- Verifier: runs objective checks and controls pass gate
- Mentor/Friend: conversational/social role outside task execution

A small local model is a valid worker for bounded edits/summarization but is not trusted to approve its own mutations. Frontier models can fill higher-level roles when selected. Roles are functions, not hardcoded vendors.

## Reasoning and handoff policy

Rakazo stores and transports **user-visible plans, provider-supported reasoning summaries, tool traces, and execution artifacts**, not hidden private chain-of-thought. Provider-native opaque/structured reasoning tokens are handled only as permitted by the provider/runtime and are not surfaced as private reasoning text.

For planner -> builder handoff, the preferred artifact is a structured plan/decision record. If a local worker fails or returns an empty/invalid result, the orchestrator may hand its partial user-visible output and tool state to a stronger model, recording the handoff and actual producing model.

## Local-model operator policy

For small/local models:

- one bounded change at a time
- explicit context window and low edit temperature
- no implicit multi-file free-for-all
- unique edit anchors or workspace copy
- verification after each mutation
- `<think>` blocks must never be written into files as code
- failure => revert/checkpoint + narrower task or escalate; do not repeatedly ask the same model to repair its own unverified corruption

## Verification and mutation gate

Mutations are classified:

- read-only: may run automatically within allowed roots
- reversible workspace edit: allowed by user policy but must be verified before promotion
- shell/network/tool side effect: permission/policy governed
- destructive/system/global: explicit user approval unless a narrowly defined pre-approved rule exists

A candidate change may be produced by any enabled model/CLI. Promotion requires:

`objective checks PASS AND no high-severity policy/trace regression AND required human gate satisfied`

Judge prose can break ties; it cannot override runtime errors or failed executable criteria.

## Observability

Instrument at the executor/model/tool choke points. Every span records:

- parent/run/role/agent/model/provider/tool
- start/end/duration
- input/output/reasoning-accounting token counts when available
- cached token counts when available
- estimated/actual cost
- prompt/context size
- status/error
- fallback/handoff provenance

Trace heuristics locally flag circular repetition, empty expensive steps, abrupt context loss, runaway depth, and repeated error cascades. Every heuristic gets a positive and negative test.

Optional OTLP export provides interoperability with external observability systems without requiring them for local use.

## Cost and token control

Per user/workspace/role/run:

- max input/output/reasoning tokens
- per-call spend limit
- per-run spend limit
- daily spend limit
- max model calls/agent rounds/subagents
- local-first or frontier-first routing preference

Budget checks happen before a call and produce an incomplete/partial result rather than claiming success.

Stable prompt content is ordered before volatile run data to preserve provider prompt caching. Exact response caching is allowed only for safe idempotent non-agentic requests; similarity caching is optional and never used for best-of-N sampling or mutation decisions without a verification layer.

Primary optimization metric: cost per completed *verified* task (CPCT), with abandoned spend included.

## Golden traces and evaluation

A user may promote a successful real run to a golden. Store shape + totals + checks + output artifact references, not a giant private transcript.

Comparisons include:

- objective task pass
- new regressions
- cost delta
- token delta
- call delta
- latency delta
- trace-quality flags

Functional voting groups candidates by executed behavior/output checks rather than prose agreement. Workspace/checkpoint state is restored between candidates.

## Self-improvement loop

Improvement proposals may tune routing, prompts, skill selection, feedback blocks, and workflow policy. They cannot directly modify the frozen eval set or safety gates.

Flow:

`proposal -> disposable copy/checkpoint -> frozen eval -> harness comparison -> approval/policy gate -> promotion -> GROWTH.md ledger`

Losing experiments are removed and recorded with the measured result so future agents do not retry them blindly.

## UI surfaces

- First-run Runtime Launcher / Connection Center
- Provider & Model Hub
- CLI Agents panel
- MCP Hub
- Brain Folders panel
- Agent Studio (personality, relationship, skills, autonomy, role routing)
- Run/Orchestration view with hierarchy and current stage
- Trace & Cost inspector
- Evals/Goldens/Feedback view
- existing Chat, Buzz and Lounge remain first-class social surfaces

## Upgradeability

Provider, CLI, MCP, role, verifier, memory-index, and sandbox capabilities use registries/interfaces. Built-in defaults remain small, and new model IDs/endpoints must not require editing a central allowlist. Unknown optional integrations fail closed and report capability status instead of breaking startup.

## Security boundaries

- secrets remain encrypted at rest through Rakazo's existing secret store
- no tokens in logs, traces, brain files, git, or RPC metadata
- desktop local listeners bind loopback
- path resolution checks real/canonical roots and rejects traversal
- child process argv is not passed through a shell unless an explicitly user-approved shell tool is being invoked
- frozen eval directory and safety policy directory are excluded from agent-writable roots
- brain write proposals display exact target + diff
- destructive MCP/CLI operations default off

## Shipping criteria

A release is not complete until:

1. all new unit tests pass
2. existing upstream unit/integration/E2E tests pass where runnable in CI
3. Lite launches in CI smoke without Docker/Postgres and answers `/health`
4. Lite persistence survives restart
5. Full Local code path remains available and existing topology tests pass
6. Remote connection profile/recovery tests pass
7. provider custom-ID and failure-isolation tests pass
8. CLI bridge command construction/security tests pass
9. MCP real throwaway-server test passes
10. brain path traversal/write-diff tests pass
11. local-worker mutation cannot promote with failed verification
12. harness cannot mark a feature passing from builder output alone
13. budget hard-stop tests pass
14. observability heuristic positive + negative controls pass
15. a universal macOS DMG is produced by GitHub Actions
16. final branch is reviewed against this spec and immutable manifest before merge
