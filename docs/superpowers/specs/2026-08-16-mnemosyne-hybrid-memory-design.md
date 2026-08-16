# Mnemosyne Hybrid Memory Design

## Goal

Add Mnemosyne to Rakazo/FlowBots as a zero-cloud semantic memory accelerator without replacing the existing Markdown/Brain memory source of truth or making desktop startup depend on Python.

## Decision

Use a hybrid, rebuildable semantic-index architecture.

- `MarkdownMemoryStore` remains canonical for reads, writes, revisions, import/export, and user-visible portability.
- A new `MnemosyneSemanticIndex` shells out to the official `mnemosyne` CLI when available.
- A new `HybridMemoryStore` delegates authoritative operations to Markdown and augments `search()` with Mnemosyne results.
- Mnemosyne is an index cache, never the only copy of user memory.
- Default mode is `auto`: missing/broken Mnemosyne silently falls back to Markdown search. `off` disables it. `required` makes explicit operator configurations fail closed if Mnemosyne is unavailable.
- Pin the documented integration target to `mnemosyne-memory==3.15.1`; do not vendor or fork Mnemosyne internals.

## Why this approach

### Rejected: replace Markdown with Mnemosyne

This would make Python/Mnemosyne availability a correctness dependency, weaken Markdown portability/revisions, and recreate the class of packaged-app startup coupling that caused the prior Electron crash.

### Rejected: MCP/tool-only integration

This is easy to add, but it creates a second memory silo that agents may or may not call. It does not improve Rakazo's existing `MemoryStore.search()` behavior.

### Selected: canonical Markdown + rebuildable Mnemosyne index

This preserves existing semantics while adding semantic recall. Because the index is derived, it can be deleted/rebuilt safely and never needs complex two-phase commit or revision reconciliation.

## Data flow

1. `commit`, `read`, `importMarkdown`, and `exportMarkdown` go to `MarkdownMemoryStore` unchanged.
2. `HybridMemoryStore.search()` obtains the canonical documents for the requested scope.
3. Documents are sorted and hashed from identity/path/revision/content into a deterministic fingerprint.
4. Each user/workspace/scope/bot index receives an isolated hashed directory under `<dataDir>/mnemosyne-index/`.
5. If the fingerprint differs from the last successful manifest, rebuild that index directory and ingest the current documents using `mnemosyne store` with document paths as source tags.
6. Query with `mnemosyne recall <query> <top_k> --json`.
7. Parse results defensively, map only known canonical document paths, deduplicate by path, and merge with Markdown lexical results.
8. If any Mnemosyne probe/rebuild/query fails in `auto` mode, return the canonical Markdown results without failing the user request.

## Isolation and security

- Never put raw workspace IDs, user IDs, bot IDs, API keys, or prompts in filesystem directory names; derive SHA-256 index keys.
- Set `MNEMOSYNE_DATA_DIR` only for the child process; do not mutate process-global environment.
- Keep each workspace/user/scope/bot combination in a separate SQLite data directory.
- Bound child-process stdout/stderr and execution time.
- Invoke the command with argv arrays (`spawn`/`execFile` semantics), never through a shell.
- Treat Mnemosyne JSON as untrusted input and validate shape before merging.
- Never return a Mnemosyne result that cannot be mapped back to a current canonical document.
- Index manifests contain only fingerprints/version metadata, not memory content.

## Availability and packaging

The Electron DMG must remain independently launchable without Python or Mnemosyne. Mnemosyne activation is opportunistic in `auto` mode. Operators/users who want semantic recall install the pinned package into a Python 3.10+ environment and optionally set `MNEMOSYNE_COMMAND` to its executable path. This avoids bundling a second language runtime into the universal DMG.

## Configuration

- `MNEMOSYNE_MODE=auto|off|required` (default `auto`)
- `MNEMOSYNE_COMMAND=/path/to/mnemosyne` (default `mnemosyne`)
- `MNEMOSYNE_TIMEOUT_MS` bounded to a safe range, default 5000 ms per command

## Search merge policy

- Preserve existing Markdown lexical results.
- Mnemosyne candidates add semantic recall but cannot erase lexical hits.
- Deduplicate by canonical `path`.
- Normalize semantic scores to a finite non-negative number; reject NaN/infinite values.
- Return at most the requested limit when one exists in the adapter contract; otherwise use the established package default.

## Verification

1. RED/GREEN unit tests for index fingerprinting, isolation, command arguments/env, JSON parsing, fallback, required mode, and merged result dedupe.
2. RED/GREEN wiring test proving `createApp()` constructs the hybrid store with `dataDir` and configured mode/command.
3. Existing memory, API, adapter, LocalRuntime, and desktop tests/typechecks remain green.
4. A real Mnemosyne v3.15.1 integration job installs the pinned package on CI and proves store + semantic recall through the TypeScript adapter.
5. Final macOS package workflow mounts and launches the DMG using the existing crash-signature smoke gate with no Mnemosyne installation, proving the optional integration cannot regress startup.
