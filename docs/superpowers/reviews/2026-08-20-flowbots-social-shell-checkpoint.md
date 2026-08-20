# FlowBots Social Shell Checkpoint

Verified before this checkpoint commit:

- Task 7 peer collaboration behavior passes focused tests and ordinary CI.
- Task 8 durable message reactions are wired through authenticated API routes and the real Shell.
- Task 9 role presets preserve user-owned instructions instead of replacing them with the bot description.
- Task 10 animated bot states and selectable face choices are wired into the real Shell and respect reduced motion.
- Task 11 replaces the static composer plus button with file/workspace, computer, Connections, MCP, harness, and teammate actions.
- The exact-head migration verifier passed typecheck and focused tests before committing the Shell integration.
- Temporary migration scripts/workflow writers were removed and `.github/workflows/ci.yml` was restored from canonical `main`.
- Task 13 Fable judge GREEN passed DB generation, strict typecheck, all unit tests, Postgres integration journeys, production build, and `git diff --check` on the transformed tree.
- Task 13 cleanup restored the exact canonical `ci.yml` blob from `main` and removed the temporary migration scripts before pushing the cleaned product tree.

This checkpoint triggers ordinary canonical PR CI against the cleaned feature head, including unit tests, Postgres integration, Web E2E, production build, and Electron smoke.
