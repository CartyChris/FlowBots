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
