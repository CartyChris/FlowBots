# Living Office kernel checkpoint

## Repository state

- Branch: `feature/living-office-kernel`
- Local implementation commit: `ec16845a7cddcad88b0628c66f58535e99bda978`
- GitHub implementation counterpart: `f090b24820e9d613bef1a7c990dee8f81fa39860`
- Baseline feature commit: `2d7ef6803e4954404c754cbe9751565f87dbd85c`
- Main remains at the observed baseline and has not been merged into or deployed from.

## Completed foundation

1. **Collaboration kernel** — durable task lineage, compact context packets, artifact references, immutable request receipts, bounded fan-out/depth/tree budgets, task-scoped result retrieval, descendant cancellation, and loop explanations.
2. **Authority and recovery hardening** — source-run workspace/user/bot/lease-fence checks, Flow and group membership enforcement, no private-history reads from group or delegated work, idempotent `message_bot` migration, and replay-safe completed effects. A handoff that commits but cannot enqueue returns its persisted child IDs; the existing reconciler can dispatch it later.
3. **Canonical presence** — safe activity events become a shared persisted projection with real stations, tool-state mapping, terminal precedence, and deterministic completion expiry.
4. **Mission Control and Virtual Office** — actual user-created bots share task ownership, artifacts, safe timeline events, presence, and stop controls across Office, Mission Control, group rooms, and chat.

## Verification recorded before this checkpoint

- `pnpm lint` — exit 0. Biome reports four pre-existing warnings in `packages/ui-web/src/styles.css`; no lint errors.
- `pnpm check` — 20/20 packages successful.
- `pnpm test` — 138 passed test files, 702 passed tests, 10 files / 40 tests skipped by existing suite configuration.
- Focused migrated-database suite — 90/90 collaboration, executor, effect-fence, peer dispatch, presence, and protocol tests passed.
- `pnpm build` — 4/4 production build tasks successful.
- Browser journey suite — 7/7 passed: Office and reduced motion, persisted artifacts, cancellation/reload, extensions, group `@all`, and non-first bot selection.

## Known environment boundary

The full native PostgreSQL integration journeys still require an independent PostgreSQL service. The local PGlite socket multiplexer corrupts protocol state under the journeys' multi-connection behavior, so it is not evidence for that gate. The focused persisted-database suite uses PGlite deliberately with one connection. CI should provide the native PostgreSQL verification.

No universal DMG was produced for this foundation checkpoint.

## Exact next action

Implement the bounded orchestration-policy slice: explicit Solo, Smart Team, and Full Gauntlet policies over this task ledger, with deterministic routing, budget telemetry, stop conditions, and structured review/verification stages. Preserve the existing runtime as the only scheduler and write real executor journeys before UI controls.
