# Capability expansion work log

- Branch: `feature/living-office-kernel` (existing isolated feature branch; no additional branch maze).
- Starting local SHA: `afe6a4a63555b9c1a8e34fa455c2c412ad16ffad`.
- Starting remote SHA: `fc8cf25a971ce9bd4309a249894d6e0d6e509028`.
- Both content trees: `b90648a04f18b1bf749f90d734230d4ccd525e82` (verified through local git and GitHub Git commit API).
- Current plan: `docs/superpowers/plans/2026-09-06-capability-expansion.md`.
- Completed implementation (release verification pending): durable action policies/approval receipts, exact-action replay, scoped RPC and approval UI, private-answer isolation, voice draft/read-aloud controls and browser journeys.
- Active: independent approvals/voice review and full regression gates. Local source base is `9a23f46`; remote remains `e9d2a992a42abd3143027112794a2f7407f1b3f5` until a verified publication.
- Remaining: all ten implementation gates listed in the plan; no feature completion claimed yet.

## Decisions

- Preserve the current clean successor feature branch in place, as requested; do not make another worktree or roll back its newer work.
- Prior comparison correction: standalone worker execution and E2B persistent browser profiles already exist. Extend their UX/coverage rather than duplicate them.
- Existing bots retain labelled legacy action behavior until a per-bot review policy is enabled. Approval rules are not OS isolation and cannot grant tools/connectors not already available.
- Use Terra/Luna for routine implementation/verification per the user's cost instruction; primary owns security and integration decisions.
- Fable domain/judge reference files are absent from the installed package; its main workflow plus Superpowers TDD and review provide the available verification method.

## Release boundary

User now requests a universal DMG after completion. This supersedes the plan's earlier packaging deferral, not its no-deployment/no-main-merge constraints. Package only after revised source gates pass; verify downloaded artifact SHA-256 independently. Attached DMG is prior output, not evidence for new source changes.

## Current evidence

- Approval persistence/scope: 10 tests passed against migrated PGlite; thread-answer scope test passed.
- Executor: five real database journeys passed, covering allow once, deny, unsupported runtime terminal failure, legacy 40 KiB file write compatibility, and expiration during computer setup. The three new regressions were observed failing before fixes.
- Voice: 12 focused Vitest tests passed; native lifecycle checks passed. Browser journeys are authored, not yet verified.
- Direct adapters and API TypeScript checks passed. Full monorepo gates pending.
- A global pnpm diagnostic implicitly restored dependencies and rewrote dependency files. Those accidental lock/workspace edits were reverted exactly; all subsequent commands must use the pinned pnpm 9 wrapper or direct installed binaries.
- Remaining capabilities: skills, demonstrations, detached runner UX, native background CUA, managed browser sessions, channel gateway, creative media, pipeline SDK. None is claimed complete by the approvals/voice work.
