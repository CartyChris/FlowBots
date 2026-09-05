# Living Office Implementation Plan

> **For agentic workers:** Use Superpowers TDD and executing-plans; independent scoped work may use subagents. Do not spawn grandchildren.

**Goal:** Make real bot work, delegation and results inspectable through one persisted runtime foundation.
**Architecture:** Extend Task/Run and existing events; shared presence projections drive all UI. Existing executor remains authoritative.
**Tech Stack:** TypeScript, Zod, Prisma/PostgreSQL/PGlite, React, Vitest, Playwright.
**Spec:** `docs/superpowers/specs/2026-09-05-living-office-design.md`

## Constraints

No new scheduler, no deployment, no main merge, no secret-bearing summaries, no permissions inherited from a teammate. Preserve existing group routing and private isolation. No new heavyweight dependencies.

### 1. Collaboration ledger

Files: `packages/db/prisma/schema.prisma`, explicit next migration, `packages/adapters/src/collaboration.ts`, `peer-connector.ts`, core compact packet policy and tests.

- [ ] Write RED cases for child ownership, same-request replay, scope and group rejection, ancestor cycle, maximum depth/fan-out, bounded context and references.
- [ ] Add nullable Task lineage/packet fields and a parent/request unique constraint.
- [ ] Implement transactional child creation under source-run lock; all authorization precedes durable side effects. Enqueue committed run; reconciliation already handles queued runs.
- [ ] Route delegation tools through this path. Load child runtime history from packet only, never unrelated private conversations.
- [ ] Add task-scoped result retrieval and descendant cancellation; exercise real database behavior including retry after cancelled/terminal parent.

### 2. Canonical presence

Files: contracts presence types, core presence projection/tests, adapter tool lifecycle, API scoped hydration.

- [ ] Write RED tests: web search/fetch, shell/file work, review, queued, needs-user, failure, cancellation, stale run ID, tool completion and bounded completion acknowledgment.
- [ ] Implement `projectBotPresence` using explicit run state and safe events; never infer activity from arbitrary prose or args.
- [ ] Persist tool lifecycle at the actual invocation boundary and hydrate safe run summaries through existing API.
- [ ] Run focused tests/typecheck; preserve existing event and Bot contracts with additive fields.

### 3. Office and Mission Control

Files: `apps/web/src/pages/VirtualOfficeOverlay.tsx`, `CreativeRuntimeHost.tsx`, a bounded Mission Control component, shared avatar styles, GroupChat, web E2E.

- [ ] Add RED browser journey asserting real tasks and owner, station change, stop, reload and reduced motion.
- [ ] Replace hashed work placement with shared presence; retain all actual bots and custom looks.
- [ ] Add task inspector with safe activity/model/artifact links and stop; Mission Control reads the same projection and persisted task lineage.
- [ ] Remove redundant Office poll; keep updates bounded and show errors without stale success claims.
- [ ] Run focused E2E plus existing group/selection regression gates.

### 4. Judge, verification, checkpoint

- [ ] Independent review checks authorization, state transitions, concurrency, cancellation, context scope, accessible UI and compatibility against the spec.
- [ ] Repair confirmed material findings and rerun affected checks.
- [ ] Run monorepo lint, typecheck, unit tests, production build and available integration/E2E gates at milestone.
- [ ] Commit reviewed changes and record exact tested SHA, environment constraints, remaining slices and next action. Package DMG only at a verified release candidate.
