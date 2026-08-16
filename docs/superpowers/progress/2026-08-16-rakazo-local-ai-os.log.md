# Rakazo Local AI OS — Append-only Progress Log

This file is append-only. Accepted stages are never rewritten; later entries correct earlier assumptions explicitly.

## 2026-08-16 — Foundation checkpoint

- Feature branch is based on upstream `elie222/rakazo@f3ca2353fb46af0ace71a7868255994c63aef50d`, not the older fork snapshot.
- Approved design, implementation plan, and frozen 22-feature acceptance manifest committed. Every feature started `passes:false`.
- DB boundary TDD: added `createDbFromPool`; external-pool injection is green while ordinary `createDb(connectionString)` remains intact.
- Embedded environment TDD: `loadEnv(source, overrides)` can now run from a complete explicit AppEnv without ambient `DATABASE_URL` / auth secrets; ordinary production secret checks remain intact.
- Core harness TDD: provider catalog union, objective pass judging, mutation promotion gate, CPCT, pre-call budgets, explicit-parent run traces, and negative-weighted standing feedback are green.
- CLI/MCP/Brain TDD: safe argv-based CLI bridge, timeout/cancel/output limits, real stdio MCP initialize/list/call test, HTTP JSON/SSE parser, canonical Markdown brain search, diff-first writes, traversal/symlink checks, and frozen-root protection are green.
- Latest fully green focused run before LocalRuntime RED: GitHub Actions `31931853232`.
- `apps/local-runtime` package and restart-persistence acceptance test now exist. Its implementation file is intentionally still an empty RED stub.
- Lockfile was refreshed by GitHub Actions at commit `cd1bd6ec1ec60392a800929ee5806d84fb4711e6` to include PGlite/PGlite-socket.

### Next single feature

Implement `runtime-lite` only: persistent embedded PostgreSQL, migrations, one pg/Prisma connection, in-memory jobs/realtime, DesktopSandboxProvider, loopback API, idempotent stop/restart. Do not start desktop UI integration until the no-Docker restart-persistence test is green.

## 2026-08-16 — Task 10 native terminal continuation checkpoint

- Recovered the actual long-running Stage-5 head rather than restarting from the older summary checkpoint.
- Glass Pane activity ledger and Activity Bus are implemented with managed-vs-observed coverage, parent/child traces, secret redaction, lifecycle accounting, and cancellation restricted to sessions Rakazo actually owns.
- Integrated Terminal policy/lifecycle manager is implemented with approved-root cwd enforcement, raw PTY input, resize, Ctrl-C interrupt, output subscriptions, idempotent close, and close-all cleanup.
- Electron preload exposes only narrow terminal session operations/events; Remote non-loopback pages do not receive host-terminal capability.
- Electron main now owns native PTY sessions through an injected `node-pty` adapter, re-authorizes every terminal IPC mutation, binds sessions to the creating webContents, bounds writes, streams data/activity, and reaps sessions on teardown.
- Desktop production dependency pins `node-pty@1.2.0-beta.14` and unpacks its native files from ASAR.
- The previous frozen-lockfile failure was expected after adding the native dependency. GitHub Actions refreshed `pnpm-lock.yaml` canonically at `46b94e3b77608b9b1d68717b8458283c37c3c269`.
- This documentation-only checkpoint intentionally triggers a fresh `pnpm install --frozen-lockfile` plus the full focused verification before product branding changes begin.
