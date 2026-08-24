# FlowBots Agent Evolution Design

**Date:** 2026-08-24
**Scope:** Architectural agent-runtime upgrade on `feature/flowbots-creative-runtime`

## Goal

Make every FlowBot materially stronger as a current-information agent, durable teammate, social collaborator, steered personality, and file-producing worker without making optional SaaS search keys or provider-native browsing a prerequisite.

## Research basis

This design adapts patterns rather than copying framework-specific code.

- **browser-use** (roughly 110k GitHub stars at research time): browser/retrieval is a first-class agent capability; current work emphasizes reconnect safety, context safety, pause/coordination, and search compatibility.
- **OpenHands** (roughly 85k stars): current releases emphasize first-class Agent Profiles, typed child-agent launches, structured failures, automation state/cost/export, skills, and portable agent configuration.
- **Open WebUI**: recent releases integrate web search into the normal chat pipeline and keep tool-generated files downloadable/persistent, while hardening redirects/SSRF and artifact rendering.
- **CrewAI**: role-based durable collaborators reinforce specialization and explicit crew-level cooperation.
- **AutoGen** is now maintenance-mode, so it is not a future dependency, but its mature GraphFlow/nested-team fan-out/fan-in patterns remain useful design references.

## Existing FlowBots substrate

FlowBots already has most of the low-level pieces but several are disconnected:

- `packages/adapters/src/web-fetch.ts` is a hardened, keyless, SSRF-safe public-web fetcher with redirect revalidation, DNS/IP blocking, timeouts, content limits, and readable HTML extraction.
- `builtinAgentTools` does **not** currently expose that fetcher, and the executor has no `web_fetch` / `web_search` dispatch path.
- Bot role presets exist but are coarse one-paragraph roles.
- Delegation/read-update tools are declared, but executor-level coordination needs to be made explicit and testable.
- Runtime output is accumulated and persisted, but the runtime event contract has no explicit finish reason and the executor has no continuation protocol for token-limit endings.
- Artifact persistence exists in the DB and adapters, but normal run completion persists only a text block; created files are not automatically surfaced as downloadable deliverables.

## Invariants

1. **Web capability is FlowBots-owned.** No Exa, Firecrawl, Composio, or model-native browsing key is required for basic search/fetch.
2. **Public-web safety remains strict.** Search/fetch must retain redirect-hop SSRF protection and never access loopback, private, link-local, documentation, or credential-bearing URLs.
3. **Freshness-sensitive prompts verify externally.** Prompts asking for latest/current/today/recent/version/release/news/pricing/schedule/status must receive a freshness policy and should perform web retrieval before factual synthesis.
4. **No silent truncation.** A model stopping because of an output/token limit must trigger continuation rounds. If FlowBots itself reaches its bounded continuation safety ceiling, the user receives an explicit incomplete-continuation notice rather than a silently cut response.
5. **No fake completion.** Network/tool/file/model failures are represented as failures or explicit limitations; bots never invent source retrieval or file delivery.
6. **Personality never expands authority.** Steering changes style, initiative, research posture, collaboration tendency, and depth—not permissions.
7. **Created deliverables are surfaced.** Relevant files created/modified by the run are represented in the thread as real downloadable file/artifact blocks, subject to file-count/size/type bounds.
8. **Collaboration is bounded.** Team fan-out has explicit maximum peers/rounds and cannot recursively explode.
9. **Existing local-first behavior stays intact.** Ollama, local sandbox/home, chat history, computer, memory, routines, reactions, Look Studio, Workbench, and the Virtual Office remain supported.
10. **Mobile/web/desktop share contracts.** New message/tool contracts must be provider-neutral and render without relying on desktop-only behavior.

## Pillar 1 — Always-On Web Research

### Built-in tools

Add two always-present agent tools:

- `web_search({ query, max_results?, recency_days? })`
- `web_fetch({ url, max_chars? })`

`web_fetch` delegates to the existing `safeWebFetch` implementation.

`web_search` uses a **keyless provider chain** and normalizes results into `{title,url,snippet,source}`. Initial providers:

1. DuckDuckGo HTML search endpoint.
2. Bing RSS search fallback.

Both are fetched through the same public-web safety boundary. Search result parsing is deliberately small and deterministic; optional paid providers can still enhance retrieval later but are not required.

### Freshness routing

Add `classifyFreshnessNeed(prompt)` in a focused module. It detects explicit temporal/current-information cues without routing every creative or timeless prompt to the web.

For freshness-sensitive prompts the executor adds a system instruction requiring current web evidence before factual claims and injects the current UTC date. It does not fabricate a successful preflight if the network is unavailable.

### Search/fetch result sizing

- Search: max 10 normalized results, default 6.
- Search snippets: bounded per result.
- Fetch: existing 80k default / 200k maximum character contract remains.
- Results are untrusted evidence, never executable instructions.

## Pillar 2 — Complete Output / Continuation Protocol

### Runtime event contract

Extend `AgentRuntimeEvent` `done` with an optional provider-neutral `finishReason`:

`"stop" | "length" | "tool" | "error" | "unknown"`.

Pi runtime records the last assistant message finish/stop reason when the underlying provider exposes it and maps provider-specific token-limit values to `length`.

### Executor continuation

Move one runtime invocation into a helper that can run multiple **continuation rounds** while retaining the same run, model, tools, and computer.

When a round ends with `finishReason: "length"`:

- preserve every streamed character already received;
- issue a continuation prompt instructing the model to continue exactly from the prior endpoint, without restarting or summarizing;
- include the accumulated prior response in continuation context in a bounded form compatible with the runtime history model;
- continue for up to `MAX_OUTPUT_CONTINUATION_ROUNDS = 6`.

If round 6 also ends for length, append an explicit system-style tail to the persisted answer stating that the model hit the continuation safety ceiling and the response may remain incomplete. Silent clipping is forbidden.

The executor never uses text-length guesses as proof of truncation when an explicit finish reason is available.

## Pillar 3 — Social Team Collaboration

### Existing teammate tools become first-class

Implement/verify executor dispatch for:

- `delegate_to_bot`
- `read_bot_updates`

Add one higher-level tool:

- `delegate_team({ assignments: [{bot_id?|name?, task}], synthesis_goal? })`

It fans out 2–4 durable assignments to existing bots using the same durable task/run queue, returns concrete child run IDs, and lets the coordinator continue. It does not recursively spawn more bots by itself.

### Collaboration steering

Bots gain a collaboration posture that changes when they consult teammates:

- `solo`
- `consultative`
- `team-first`

Team-first does not automatically delegate every request. It tells the bot to use teammates when specialization/parallelism is genuinely useful and then read their updates before synthesis.

## Pillar 4 — Steering Profiles 2.0

Store a structured steering profile inside bot instructions using versioned FlowBots markers, preserving user-authored instructions just like the current role marker system.

Axes:

- `initiative`: `reserved | balanced | proactive`
- `expressiveness`: `concise | natural | animated`
- `challenge`: `supportive | balanced | skeptical`
- `collaboration`: `solo | consultative | team-first`
- `research`: `normal | web-first | verify-current`
- `depth`: `brief | standard | exhaustive`

Role presets remain, but gain richer options: Developer, Researcher, Employee, Friend, Coach, Analyst, Builder, Creative, Operator, Research Lead, Custom.

The generated steering instruction is deterministic, bounded, reversible, and explicitly states that style/initiative cannot override permissions or truthfulness boundaries.

The web bot editor/settings surface gets compact controls for these axes and preserves compatibility with existing role-only bots.

## Pillar 5 — Real File Delivery

### Message contract

Add a `file` message block containing:

- `artifactId`
- `name`
- `mimeType`
- `size`

The UI renders it as a downloadable file card using the existing artifact download route.

### Run artifact capture

At run start, capture a lightweight workspace-file baseline. At successful completion, inspect candidate files created/changed during the run and persist relevant deliverables through the existing artifact store/DB path.

Candidate rules:

- maximum 12 files per run;
- maximum 25 MB per individual artifact;
- ignore dependency/build-cache/temp/hidden internals;
- prioritize office/document/archive/image/code deliverables, especially `.pdf`, `.docx`, `.pptx`, `.xlsx`, `.csv`, `.html`, `.zip`, `.md`, `.txt`, `.json`, common images;
- do not attach unchanged pre-existing files;
- binary files are read as bytes, not forced through UTF-8 text handling.

The final thread message includes text plus real `file` blocks. If artifact persistence fails, the text response remains valid and records an explicit file-delivery warning; it never invents a download.

Also add an explicit `share_file` tool for a bot to surface a specific workspace file immediately when useful.

## Baseline E2E repair

Before merge, fix three existing Playwright failures from PR #9 without weakening assertions:

- select the Virtual Office Artifact Studio heading explicitly rather than ambiguous text;
- use exact heading matching for GitHub Extensions;
- close Look Studio before the golden test clicks the underlying settings gear.

## Testing strategy

RED contracts land before implementation.

1. Unit tests for freshness classification and keyless search parsing/fallback.
2. Built-in tool contract tests proving `web_search`, `web_fetch`, `delegate_team`, and `share_file` are exposed.
3. Executor tests proving web tools dispatch without optional connectors/API keys.
4. Runtime/executor tests proving `length → continuation → stop` produces one lossless final answer, and repeated length endings produce an explicit ceiling notice.
5. Personality tests for round-trip structured steering markers and deterministic instructions.
6. Collaboration tests for bounded multi-bot assignments and update reads.
7. Artifact tests proving only changed relevant files become real artifact/file blocks.
8. E2E tests for steering controls/file card visibility where stable.
9. Full exact-head CI: lint, typecheck, unit, Postgres journeys, web E2E, production build/Electron smoke, macOS package.

## Merge gate

PR #9 may be marked ready and merged only after a fresh workflow on its exact head shows all required CI jobs green. The merge commit on `main` is then checked, and the handoff report records exact SHA(s), implemented behavior, verification evidence, and any intentionally deferred work.
