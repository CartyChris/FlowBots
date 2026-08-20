# FlowBots Social Shell Checkpoint

Verified before this checkpoint commit:

- Task 7 peer collaboration behavior passes focused tests and ordinary CI.
- Task 8 durable message reactions are wired through authenticated API routes and the real Shell.
- Task 9 role presets preserve user-owned instructions instead of replacing them with the bot description.
- Task 10 animated bot states and selectable face choices are wired into the real Shell and respect reduced motion.
- Task 11 replaces the static composer plus button with file/workspace, computer, Connections, MCP, harness, and teammate actions.
- The exact-head migration verifier passed typecheck and focused tests before committing the Shell integration.
- Temporary migration scripts/workflow writers were removed and `.github/workflows/ci.yml` was restored from canonical `main`.

This commit exists to run ordinary PR CI against the cleaned feature head, including the new social Web E2E journey.
