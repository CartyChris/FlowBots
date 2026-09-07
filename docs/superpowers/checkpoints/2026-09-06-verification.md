# Verification checkpoint — 2026-09-06

## Tooling

The pinned pnpm wrapper was verified after it was made executable:

```sh
PATH=/workspace/scratch/cb27cf9f0bbf/tools/pinned-bin:$PATH pnpm
```

This reported version `9.15.0`. No install command was run; the unintended lockfile change was restored to `HEAD`.

## Results

| Command | Result |
| --- | --- |
| `pnpm exec vitest run apps/web/src/lib/voice.test.ts` | Passed: 1 file, 11 tests. |
| `pnpm --filter @rakazo/web check` | Passed after the voice typing fixes. |
| `./node_modules/.bin/vitest run` | Passed: 145 files, 753 tests; 10 files and 41 tests skipped. |
| `TURBO_TELEMETRY_DISABLED=1 ./node_modules/.bin/turbo run build --cache-dir=.turbo` | Passed: 4 tasks. |
| `pnpm run lint` | Passed after formatting `apps/local-runtime/src/action-approvals.test.ts`, `apps/local-runtime/src/thread-answer-scope.test.ts`, and `apps/web/e2e/action-approvals.spec.ts`. Four pre-existing CSS warnings in `packages/ui-web/src/styles.css` remain. |
| `pnpm run check` | Passed: 20 tasks successful. The interactive command session was waited to its actual exit, code 0. |
| `pnpm run test:integration` | Failed before test execution: `tsx` could not create its IPC pipe at `/tmp/tsx-0/19.pipe` (`listen EPERM`). |
| `pnpm run test:e2e` | Failed before test execution with the same `tsx` IPC-pipe permission error. |

The integration and E2E failures are environment permission failures, so neither harness reached Docker or test execution.
