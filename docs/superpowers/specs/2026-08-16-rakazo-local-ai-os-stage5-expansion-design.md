# Rakazo Local AI OS — Stage 5 Expansion Design

**Status:** approved-by-user continuation of the existing Local AI OS design. This supplement does not replace `2026-08-16-rakazo-local-ai-os-design.md`; it extends Stage 5 onward while preserving all previously accepted requirements.

## Goal

Turn Rakazo into one local-first AI operating surface where API models, local models, MCP servers, coding CLIs, subscription-backed agents, agent servers, Docker workloads, persistent brains, research, and long-running multi-agent work can be composed deliberately and observed through one control plane without making Docker or any external harness mandatory.

## Non-negotiable invariants

1. **Lite stays zero-setup.** Docker, Postgres services, OpenHands, Paperclip, Prime Agent, Hermes, Grok Build, and other external harnesses are optional additions. Lite must still launch without them.
2. **No split-brain control plane.** Rakazo owns one user-facing control plane. Multiple execution fabrics may run simultaneously, but they feed one Rakazo activity/event model rather than creating competing Rakazo state stores.
3. **Docker remains first class.** A user can choose Docker for sandboxes/harnesses, use it beside Lite, or schedule Docker-backed services to run only during selected windows.
4. **Managed activity is fully traceable.** Every request launched through Rakazo receives a trace/session/run identity and parent-child linkage. External processes discovered outside Rakazo are shown as `observed` with limited coverage; Rakazo must never pretend it can see private internal calls of arbitrary third-party apps.
5. **No model self-approval.** Harness/model output cannot mark mutations or long-task features accepted. Objective checks and an independent verifier own promotion.
6. **Brain canonical state remains auditable Markdown.** Database/index state may accelerate retrieval, but accepted knowledge is represented as Markdown with provenance and lifecycle metadata.
7. **Research drafts are not Brain.** Unsaved research survives navigation/reload and appears in grouped history until cleared, but it becomes canonical Brain memory only through explicit promotion or an approved Dreaming proposal.
8. **Secrets do not enter traces, Brain files, or diagnostics.** Environment values, auth tokens, subscription credentials, and raw secret-bearing URLs are redacted at ingestion boundaries.

## 1. Runtime Fabric

Replace the mental model of one mutually exclusive runtime with one **control plane + multiple execution targets**.

### Control-plane profile

The existing desktop launcher continues to select where Rakazo's primary UI/control plane comes from:

- `lite` — embedded LocalRuntime, PGlite, memory jobs, desktop sandbox.
- `full-local` — full local Rakazo stack.
- `remote` — trusted remote Rakazo deployment.

### Execution targets

A new runtime-target registry describes optional concurrent capabilities:

- `host` — direct local process execution under explicit workspace/tool policy.
- `docker` — Docker-backed sandbox/service execution.
- `openhands-local` — OpenHands CLI/SDK on host.
- `openhands-agent-server` — local/remote OpenHands Agent Server.
- `prime-agent` — Prime Agent RPC/headless session.
- `hermes` — Hermes CLI/gateway session, including MoA presets.
- `paperclip` — Paperclip control-plane bridge/sidecar.
- `grok-build` — Grok Build ACP/headless.
- `custom-cli` / `custom-http` / `mcp`.

A Lite desktop session may therefore use Docker-backed agents without becoming a Docker-dependent app. A Remote control plane may still launch local CLIs only when the user explicitly enables local execution for that desktop client.

### Schedules

Targets/services can have zero or more schedule windows. The scheduler computes desired state from explicit user rules such as weekdays 09:00–18:00, one-shot windows, or cron expressions. Schedule transitions are idempotent: entering a window starts only managed services assigned to it; leaving stops only services whose policy permits automatic stop. Running interactive sessions are never killed merely because a schedule window closes unless their service policy explicitly says `terminate-active`.

## 2. Universal Harness Registry

One adapter contract normalizes model APIs, CLI harnesses, ACP/RPC agents, MCP servers, and agent servers.

Each harness definition exposes:

- stable `id`, `kind`, display name, binary/base URL;
- discovery/capability probe;
- launch/resume/stop/abort;
- supported interaction modes: `chat`, `headless`, `rpc`, `acp`, `http`, `mcp`;
- workspace policy (`read-only`, `workspace-write`, `full-host`, `container`);
- model/provider passthrough when supported;
- structured event mapping;
- usage/cost extraction when the upstream surface exposes it;
- scheduleability and whether it may run as a resident service.

Direct argv spawning is mandatory for local CLIs. Shell interpolation is not used for generated arguments.

## 3. Prime Agent integration

Prime Agent is integrated as a first-class harness, not merely a terminal command.

Primary-source capabilities to preserve:

- daemon-backed running/idle/inactive sessions;
- RPC JSONL mode with prompt/steer/follow-up/abort and correlated events;
- persistent session JSONL and resume/clone/fork semantics;
- programmatic RLM subagents and agent-to-agent messaging;
- schedules/heartbeats and resident sessions;
- usage/context/cost stats;
- compaction and auto-retry controls;
- bounded autonomous mode and user-defined completion gates;
- continual-harness refinement history and rollback.

Rakazo does **not** allow Prime Agent's `/refine` result to bypass Rakazo verification. Refinements that affect shared Rakazo Brain/harness state enter a staged proposal and must pass the same verifier/promotion policy as Dreaming.

Prime Agent's own documentation warns that its worker/kernel boundary is not a security sandbox. Rakazo therefore defaults Prime Agent to a selected workspace and can optionally place its process inside a Docker/other isolated execution target.

## 4. OpenHands integration

Support two paths through one adapter family:

1. **CLI path:** discover `openhands`, run headless JSON/ACP where available, stream structured output, resume conversations, and expose it in both Terminal and model/harness pickers.
2. **Agent Server path:** connect to `openhands.agent_server` locally or remotely; consume its REST/WebSocket event stream and workspace abstraction.

OpenHands can use local or remote/container workspaces, and its SDK includes tool, MCP, context-compression, and security-analysis primitives. Rakazo should preserve these capabilities instead of flattening OpenHands into a simple one-shot shell command.

## 5. Hermes + Mixture of Agents

Hermes becomes a first-class harness and provider surface.

- Discover the `hermes` CLI/session store/gateway where installed.
- Map Hermes tool progress, streaming, status, subagent delegation, cron, MCP, skills, memory, and checkpoint events into Rakazo traces where the interface exposes them.
- Import Hermes **Mixture of Agents** presets as virtual models under a Rakazo `hermes-moa` provider. Each preset keeps an aggregator model plus reference models. The aggregator remains the acting model while references supply analysis.
- Allow MoA presets to be selected anywhere a model is selected, including Brain Dreaming roles.
- Rakazo Brain and Hermes memory remain separate canonical stores unless the user explicitly links/promotes material between them.

## 6. Grok Build and Oh My Pi

- **Grok Build:** prefer ACP (`grok agent ... stdio`) for rich sessions/tool updates; fall back to headless `grok -p` only when ACP is unavailable. Subscription/browser auth remains owned by Grok Build.
- **Oh My Pi:** support it through the generic CLI/harness discovery layer. Because multiple projects use similar names, Rakazo records the exact resolved executable/package origin and capabilities before enabling it. No vendor-specific assumptions are made without a successful probe.

## 7. Paperclip bridge

Paperclip is worth integrating, but not by duplicating Rakazo's entire control plane. Its useful differentiation is an agent-company/work-management layer: org charts, goals, budgets, governance, heartbeat-driven work, live run records, and an adapter ecosystem.

Rakazo provides:

- a **Paperclip dashboard** section embedded as a native Rakazo view of Paperclip status/companies/agents/tasks/runs/costs when a Paperclip server is connected;
- managed local setup/start/stop using the official package/command or user-provided URL;
- a connection-health probe and version/capability check;
- mapping between Rakazo Harness Registry entries and Paperclip adapters;
- easy creation of Paperclip agents backed by Claude Code, Codex, Hermes, OpenCode, Prime/custom process adapters where supported;
- event ingestion into Glass Pane with Paperclip run IDs retained as external correlation IDs.

Paperclip remains optional and removable. Rakazo does not fork its database schema into the main Rakazo database.

## 8. Glass Pane

The Glass Pane is Rakazo's global activity plane.

Every managed activity is represented by a normalized span/event with:

- `traceId`, `spanId`, optional `parentSpanId`;
- actor/harness/provider/model/tool/MCP identifiers;
- local/remote execution target;
- state (`queued`, `running`, `waiting`, `idle`, `completed`, `failed`, `cancelled`);
- timing and usage/cost when known;
- coverage (`managed`, `protocol-observed`, `process-observed`);
- safe summary and redacted metadata;
- links to child subagents/tool/MCP calls.

Glass Pane can filter by harness, model, project, cost, state, target, or session and can cancel a managed activity when its adapter supports cancellation.

An optional local-process observer can report that known agent binaries are running even when Rakazo did not launch them. Those rows are clearly marked `process-observed`; Rakazo does not claim visibility into their internal LLM/MCP traffic unless they expose ACP/RPC/log/event APIs and the user connects them.

## 9. Integrated Terminal

A terminal panel can replace or sit beside Chat. It supports:

- real PTY sessions with resize/input/interrupt;
- starting supported harnesses from picker presets;
- attaching to a managed Prime/OpenHands/Hermes/Grok/other CLI session;
- switching between transcript view and raw terminal view;
- exposing the same harnesses in the normal model/harness selector.

Terminal sessions are Glass Pane activities. Raw terminal escape/control data is not written directly into Brain.

## 10. Brain v2

Canonical Brain Markdown gains lifecycle metadata.

### Node states

- `accepted` — stable memory eligible for normal retrieval.
- `wip` — evolving hypothesis/note; retrieval marks it provisional.
- `temporary` — has `expiresAt`; excluded after expiry and later pruned/archived.
- `mistake` — verified failure pattern / thing to avoid, with trigger, evidence, correction, and recurrence key.
- `candidate` — Dreaming/research proposal not yet accepted.

Frontmatter fields include stable ID, state, timestamps, source citations, confidence, tags, recurrence key, supersedes/supersededBy, and optional expiry.

### Mistake prevention

Before consequential tasks, retrieval performs a targeted mistake lookup using project/tool/harness/error signatures. A matching mistake is injected as a concise avoidance rule with source path. A new failure is not automatically called a mistake; it must have objective evidence and a corrected outcome before promotion.

## 11. Research drafts and grouped history

Research is durable **without becoming Brain**.

Each search creates a `ResearchSession` with query, timestamps, selected sources, extracted snippets/summaries, and result state. The active session persists across route changes and reloads. History groups sessions by search query/time and expands to show source/result cards.

Actions:

- `Continue` reopens the same stored session.
- `Add selected to Brain` creates Brain proposals with provenance.
- `Clear` deletes the research draft/history record after confirmation.
- `New search` creates a new active session but does not silently delete old history.

If an external source disappears later, the stored research draft remains a record of what Rakazo captured at search time, but Brain promotion still preserves the original source URL/time and labels unavailable sources appropriately.

## 12. Dreaming / Brain improvement cycles

Dreaming is a background, user-controllable improvement workflow, not unconstrained self-modification.

### Inputs

- recent successful/failed Rakazo traces;
- explicit user feedback;
- Research sessions;
- selected Brain nodes/mistakes/WIP notes;
- optional fresh-source collectors for Hacker News, Anthropic, Andrej Karpathy/public materials, machine-learning research/news, X/web search, and user-defined feeds.

### Multi-agent tree

A cycle can assign multiple roles/models/harnesses. Candidate ideas form a tree:

1. scouts collect source-backed observations;
2. synthesizers propose Brain/tool/prompt/workflow improvements;
3. critics attack unsupported or low-value branches;
4. executable checks/evals score candidates;
5. a verifier selects promotable leaves;
6. non-useful branches are pruned but retained in the Dreaming run audit record, not canonical Brain.

The user can set agent count, models/harnesses, budget, schedule, max depth, branching factor, source freshness, and whether promotion requires manual approval.

### Promotion

Dreaming may write only to a staging area. Promotion to accepted Brain/harness state requires objective checks plus the verifier policy. The immutable base safety/system layer is never Dreaming-writable.

## 13. UI surfaces

Stage-5 expansion adds or reserves these top-level surfaces:

- **Glass Pane** — all activity/traces/coverage/cancel.
- **Terminal** — PTY + harness sessions.
- **Runtime Center** — control-plane mode, execution targets, Docker, schedules.
- **Harnesses** — Prime/OpenHands/Hermes/Grok/Claude/Codex/Kimi/OpenCode/custom discovery/configuration.
- **Paperclip** — setup/connect/dashboard.
- **Brain** — accepted/WIP/temporary/mistakes/candidates and source-aware editing.
- **Dreaming** — manual/scheduled cycles, agent tree, budgets, candidate/pruned branches.
- **Research History** — active durable drafts grouped by search, with explicit Brain promotion.

Chat/Buzz/Lounge remain first-class and can select API models, local models, MoA presets, or compatible harness-backed agents.

## 14. Security and resource policy

- Direct local processes use canonical working directories and explicit allowed roots.
- Remote URLs reject embedded credentials and default to HTTPS except loopback.
- Docker access is explicit because Docker socket access is effectively host-powerful.
- External harnesses retain their own subscription/login mechanisms; Rakazo does not extract subscription tokens.
- Process output and protocol events pass through a shared secret redactor before persistence/UI.
- Scheduled/dreaming jobs have hard wall-clock, token/cost, output, and concurrency limits.
- External-agent self-improvement is always staged; no shared Brain/system mutation occurs merely because Prime `/refine`, Hermes learning, OpenHands, or another harness says it succeeded.

## Primary-source design inputs read

- Prime Agent launch/architecture/RPC documentation: persistent daemon/session trees, RPC JSONL, observe, A2A, schedules/heartbeats, autonomous gates, continual harness, refinement/rollback.
- OpenHands SDK/Agent Server/CLI documentation: local + remote workspaces, REST/WebSocket server, headless JSON, ACP, MCP/security/tooling.
- Hermes Agent documentation: subagent delegation, cron, MCP/tools, persistent memory/checkpoints, Mixture of Agents virtual provider.
- Paperclip documentation: control-plane architecture, heartbeat runtime, budgets/governance, built-in/external adapters including Claude/Codex/Hermes/process/HTTP.
- Grok Build documentation: TUI/headless execution and ACP agent mode.

## Acceptance summary

Stage 5 expansion is accepted only when all added subsystems have focused tests, pre-existing Local AI OS tests remain green, and the work log records objective evidence. The presence of a UI card or successful child process start alone is not acceptance.