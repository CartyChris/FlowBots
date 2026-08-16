# Mnemosyne Hybrid Memory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Mnemosyne v3.15.1 as an optional local semantic index behind Rakazo's existing memory contract while keeping Markdown memory authoritative and desktop startup independent of Python.

**Architecture:** `HybridMemoryStore` wraps the existing `MarkdownMemoryStore`. `MnemosyneSemanticIndex` derives isolated per-context SQLite indexes from canonical documents, rebuilding only when their fingerprint changes and falling back to lexical Markdown search when Mnemosyne is unavailable in `auto` mode.

**Tech Stack:** TypeScript, Vitest, Node child processes/fs/crypto, existing `MemoryStore` adapter contract, official `mnemosyne` CLI (`mnemosyne-memory==3.15.1`).

## Global Constraints

- Markdown/Brain memory remains the source of truth.
- No shell command construction; argv only.
- No raw user/workspace/bot identifiers in index paths.
- No startup dependency on Python/Mnemosyne in default `auto` mode.
- No cloud service or network call is required for memory operation after Mnemosyne is installed.
- Pin real integration verification to Mnemosyne `3.15.1`.

---

### Task 1: Semantic index contract and RED tests

**Files:**
- Create: `packages/memory/src/mnemosyne.test.ts`
- Create: `packages/memory/src/mnemosyne.ts`

**Interfaces:**
- Produces: `MnemosyneMode`, `MnemosyneCommandRunner`, `MnemosyneSemanticIndex`, `memoryIndexKey()`, `memoryFingerprint()`.

- [ ] **Step 1: Write failing tests** for deterministic content fingerprinting, hashed context isolation, child env/argv, bounded JSON parsing, unavailable-command fallback state, and `required` mode errors.
- [ ] **Step 2: Run** `pnpm --filter @rakazo/memory test -- mnemosyne.test.ts` and confirm failures are caused by missing production behavior.
- [ ] **Step 3: Implement minimal index code** using `spawn`, `MNEMOSYNE_DATA_DIR`, manifest fingerprints, bounded output/timeouts, and `recall --json` parsing.
- [ ] **Step 4: Re-run the focused test** and require green.
- [ ] **Step 5: Commit** `feat(memory): add isolated Mnemosyne semantic index`.

### Task 2: Hybrid MemoryStore behavior

**Files:**
- Create: `packages/memory/src/hybrid-memory.test.ts`
- Create: `packages/memory/src/hybrid-memory.ts`
- Modify: `packages/memory/src/index.ts`

**Interfaces:**
- Consumes: `MnemosyneSemanticIndex`.
- Produces: `HybridMemoryStore implements MemoryStore`.

- [ ] **Step 1: Write failing tests** proving authoritative operations delegate unchanged to Markdown, semantic and lexical search results merge/dedupe by path, unknown semantic paths are rejected, and Mnemosyne failure in `auto` mode returns lexical results.
- [ ] **Step 2: Run** `pnpm --filter @rakazo/memory test -- hybrid-memory.test.ts` and confirm RED.
- [ ] **Step 3: Implement the minimal wrapper** and export it from `index.ts`.
- [ ] **Step 4: Run the complete memory suite** and require green.
- [ ] **Step 5: Commit** `feat(memory): layer Mnemosyne recall over Markdown memory`.

### Task 3: API/runtime wiring

**Files:**
- Modify: `apps/api/src/env.ts`
- Modify: `apps/api/src/env.test.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/local-runtime/src/index.ts`
- Modify: `apps/local-runtime/src/runtime.test.ts`

**Interfaces:**
- Configuration: `MNEMOSYNE_MODE`, `MNEMOSYNE_COMMAND`, `MNEMOSYNE_TIMEOUT_MS`.
- `createApp()` constructs `HybridMemoryStore` around `MarkdownMemoryStore` using `env.dataDir`.

- [ ] **Step 1: Add RED env/runtime tests** for defaults (`auto`, `mnemosyne`, `5000`) and explicit override forwarding.
- [ ] **Step 2: Run API/local-runtime focused tests** and confirm RED.
- [ ] **Step 3: Add the three environment fields and wire the hybrid store** without changing any other runtime defaults.
- [ ] **Step 4: Run API, memory, adapters, LocalRuntime and desktop checks** and require green.
- [ ] **Step 5: Commit** `feat(api): wire optional Mnemosyne memory accelerator`.

### Task 4: Real Mnemosyne integration gate

**Files:**
- Create: `packages/memory/src/mnemosyne.integration.test.ts`
- Modify: `.github/workflows/local-ai-os.yml`

**Interfaces:**
- Integration test is skipped unless `RAKAZO_TEST_MNEMOSYNE=1`.
- CI installs exactly `mnemosyne-memory==3.15.1` before running the integration test.

- [ ] **Step 1: Write integration test** using a temporary data directory and the real CLI; index two documents, recall one semantically, update the snapshot, and prove stale content disappears after rebuild.
- [ ] **Step 2: Run without the env flag** and confirm it skips cleanly.
- [ ] **Step 3: Update CI** to set up Python, install `mnemosyne-memory==3.15.1`, and run only the integration test with the flag.
- [ ] **Step 4: Observe CI green** on the exact branch head.
- [ ] **Step 5: Commit** `test(memory): verify Mnemosyne 3.15.1 integration`.

### Task 5: Final regression/package acceptance

**Files:**
- Modify documentation only if verification reveals a user-facing setup requirement.

- [ ] **Step 1: Run the branch-wide focused workflow** and require all existing gates green.
- [ ] **Step 2: Run the universal macOS package workflow** with Mnemosyne absent from the packaged runtime.
- [ ] **Step 3: Require mounted-DMG launch smoke to stay alive and show no `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`, uncaught main-process exception, or Mnemosyne/Python startup failure.
- [ ] **Step 4: Skeptical diff review** for secret leakage, shell injection, cross-user index collisions, unbounded child output, stale-index races, and failure-mode regressions.
- [ ] **Step 5: Correct any confirmed issue with RED/GREEN before merge, then mark PR ready, merge with expected head SHA, run post-merge CI/package, and download/checksum the final DMG artifact.
