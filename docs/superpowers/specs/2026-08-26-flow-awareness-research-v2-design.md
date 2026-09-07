# FlowBots Flow Awareness + Research Verification V2 Design

**Date:** 2026-08-26
**Base:** `main` at `8fbf145f98513a73358ab3c4728138b18bf00ef9`

## Goal

Make FlowBots behave like a coherent team by default: connected bots know the other connected bots in the user's workspace, resolve teammate names before searching the public web, can inspect teammate updates for prior work, and can be explicitly separated from that shared Flow. At the same time, make current-information research more resistant to stale or contradictory claims and make bot activity visibly reflect research, verification, collaboration, and building work.

## Invariants

1. Flow awareness is workspace- and user-scoped. A roster never crosses workspace/user boundaries.
2. Bots are connected to the Flow by default. Separation is explicit, persistent, reversible, and two-way for automatic teammate awareness/collaboration.
3. Flow membership changes context visibility and automatic collaboration only; it never expands filesystem, connector, model, or host permissions.
4. A known teammate name is resolved against the Flow roster before public-web search. Questions about a teammate's prior work should use `read_bot_updates` before treating the name as a public person/entity.
5. Freshness-sensitive research must use current web evidence. High-volatility claims about named people, public office, elections, death, succession, live status, pricing, releases, schedules, and breaking news require explicit contradiction/corroboration checks before synthesis.
6. Research failures or source conflicts are surfaced; FlowBots does not silently promote a stale snippet into a current fact.
7. Team fan-out remains bounded by the existing peer-send and hop budgets.
8. Animation remains presentation only, respects `prefers-reduced-motion`, and never implies work completed before the runtime reports it.

## Pillar 1 — Shared Flow Roster

Add a focused `flow-awareness` module with a versioned membership marker stored in the existing bot instructions, preserving user-authored instructions and existing steering/look markers.

Membership values:

- `connected` (default)
- `isolated`

For a connected bot, the executor builds a bounded roster from all connected bots belonging to the same `workspaceId` + `userId`. Each roster entry contains bot id, exact name, title, and short description. The current bot is identified explicitly.

For an isolated bot, the executor injects an isolation notice instead of a teammate roster. Connected bots omit isolated bots from their roster. Peer targeting also rejects automatic collaboration across the isolation boundary.

Runtime instruction priority:

- resolve a referenced teammate name against the roster first;
- for questions about that teammate's prior work, messages, artifacts, or projects, call `read_bot_updates` before `web_search`;
- never reinterpret a roster-matched teammate as an unrelated public person merely because local memory is empty.

## Pillar 2 — Research Verification V2

Extend freshness classification into a separate verification policy.

Verification classes:

- `standard-current`: latest/current/news/status/etc.; search + fetch important sources + corroborate important claims.
- `volatile-entity`: people/public office/election/death/succession/live-status language; before final synthesis, run an explicit status/contradiction search for the named entity and prefer a primary/official source plus a reputable independent source when available.
- `deep-research`: explicit deep research/fact finding/investigate/verify/cross-check requests; use multiple query angles, source diversity, contradiction scan, then synthesize.

Add a built-in `verify_current_claim` tool. Given a claim and optional entity, it performs a bounded keyless verification search bundle (claim query, current-status query, and where entity status is material, death/succession/official-status query), returning normalized evidence groups. It does not declare truth by itself; evidence remains untrusted until synthesized.

Freshness instructions become mandatory-language for volatile claims: do not present a named person's current office/election/death status from one stale snippet. If evidence conflicts, state the conflict and keep searching or qualify the conclusion.

## Pillar 3 — Agentic Teamwork

Existing peer tools remain the execution substrate. Flow awareness makes them discoverable and contextually usable rather than hidden behind exact IDs the model does not know.

Enhancements:

- connected roster gives exact ids/names for `delegate_to_bot`, `delegate_team`, and `read_bot_updates`;
- teammate-context questions prefer `read_bot_updates` (non-waking) before delegation;
- team-first/consultative bots are instructed to split genuinely parallel research into researcher + verifier assignments and read results before synthesis;
- isolated bots cannot be automatically targeted through peer collaboration, preventing accidental re-entry into the Flow.

## Pillar 4 — Semantic Work Animations

Expand avatar states to include:

- `researching`
- `verifying`
- `collaborating`
- `building`

The active web shell derives short-lived semantic state from `agent.tool.called` events (`web_*`/verification → research/verify, peer/delegation → collaborate, file/shell/computer → build). Generic run state remains the fallback. The avatar adds distinct emote/orbit treatments for these states while keeping existing idle/thinking/working/happy/error/surprised behavior and reduced-motion support.

## User control

Steering Studio gains a **Shared Flow** control:

- Connected — this bot is visible to and aware of connected teammates.
- Separated — this bot is omitted from automatic teammate context and cannot be targeted by normal peer tools until reconnected.

Saving Steering Studio persists steering profile and Flow membership together without changing permissions.

## Testing

RED contracts must precede production implementation:

1. Flow membership defaults to connected, round-trips through instructions, builds a bounded connected roster, and excludes isolated bots.
2. Flow instruction tells a bot to resolve teammate names and read teammate updates before public web search.
3. Peer connector rejects connected↔isolated automatic collaboration while retaining existing send/hop budgets.
4. Research policy classifies volatile/deep research and produces status/contradiction query bundles.
5. `verify_current_claim` is exposed as a built-in tool.
6. Avatar semantic tool mapping returns researching/verifying/collaborating/building and keeps generic fallbacks.
7. Steering UI persists Shared Flow membership.
8. Full lint/typecheck/unit/Postgres/Web E2E/build/Electron/universal-DMG gates pass on the exact PR head and again after merge where practical.
