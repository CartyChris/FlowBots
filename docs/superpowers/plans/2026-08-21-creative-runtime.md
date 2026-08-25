# FlowBots Creative Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a living virtual office, simulated sandbox/artifact workbench, typed custom models, declarative GitHub extensions, and much richer animated bot states to FlowBots.

**Architecture:** Keep runtime authority in existing FlowBots contracts. Shared avatar animation lives in `@rakazo/ui-web`; new office/workbench/extensions are focused web components; Shell wires them to current bots and `threads.send`; custom models reuse existing credential/default RPCs; GitHub extensions reuse persisted capability installs without executing repository code.

**Tech Stack:** React 19, TypeScript, Tailwind classes, CSS keyframes, ORPC contracts, Vitest, Playwright, pnpm/turbo.

**Spec:** `docs/superpowers/specs/2026-08-21-creative-runtime-design.md`

## Global Constraints

- Public repository: never commit secrets, private URLs, personal/customer data, or real production data.
- Web, Electron desktop, and Expo mobile remain supported; shared contracts/UI stay in shared packages where practical.
- Auth, secret handling, sandbox boundaries, host commands, and integrations are security-sensitive.
- GitHub extensions are declarative only in this pass; registration never executes repo scripts/binaries.
- Artifact UI must not claim success before a bot actually creates files.
- `prefers-reduced-motion` must disable continuous avatar motion.

---

### Task 1: Living bot avatar states

**Files:**
- Modify: `packages/ui-web/src/bot-avatar.test.ts`
- Modify: `packages/ui-web/src/bot-avatar.tsx`
- Modify: `packages/ui-web/src/styles.css`

**Interfaces:**
- Consumes: existing `BotAvatarState` and `BotAvatar` props.
- Produces: state-specific `.rk-bot-emote-*`, `.rk-bot-thought-*`, and success/error animation layers without changing callers.

- [ ] **Step 1: Write failing tests** asserting working/thinking avatars render rotating emote/thought layers in source and reduced-motion CSS disables every new continuous layer.
- [ ] **Step 2: Run `pnpm vitest run packages/ui-web/src/bot-avatar.test.ts`** and confirm RED because the new layers/classes do not exist.
- [ ] **Step 3: Implement state-specific SVG/HTML layers** for working particles/emotes, thinking orbits, happy burst, and error shake; add CSS keyframes and staggered opacity cycles.
- [ ] **Step 4: Run the focused test** and confirm GREEN.
- [ ] **Step 5: Run `pnpm --filter @rakazo/ui-web check`** and commit the avatar slice.

### Task 2: Workbench prompt contracts

**Files:**
- Create: `apps/web/src/pages/workbench.test.ts`
- Create: `apps/web/src/pages/workbench.ts`
- Create: `apps/web/src/pages/WorkbenchOverlay.tsx`

**Interfaces:**
- Produces: `buildSandboxTask(input)` and `buildArtifactTask(input)` pure functions plus `WorkbenchOverlay({ botName, extensions, onRun, onClose })`.
- Artifact formats: `pdf | docx | pptx | html | md | csv`.

- [ ] **Step 1: Write failing tests** proving sandbox prompts name the isolation boundary and verification step; artifact prompts require real files under `flowbots-exports/`, include every selected format, and forbid fabricated completion.
- [ ] **Step 2: Run `pnpm vitest run apps/web/src/pages/workbench.test.ts`** and confirm RED because the module is missing.
- [ ] **Step 3: Implement the pure builders** with deterministic structured prompts and bounded extension instruction injection.
- [ ] **Step 4: Implement `WorkbenchOverlay`** with Sandbox Lab and Artifact Studio tabs, task templates, isolation selector, working-directory hint, format chips, staged terminal/files/preview visualization, and Run buttons.
- [ ] **Step 5: Run focused tests and `pnpm --filter @rakazo/web check`** and commit the workbench slice.

### Task 3: Declarative GitHub extensions

**Files:**
- Create: `apps/web/src/pages/github-extensions.test.ts`
- Create: `apps/web/src/pages/github-extensions.ts`
- Create: `apps/web/src/pages/GitHubExtensions.tsx`
- Modify: `apps/web/src/pages/PluginsOverlay.tsx`

**Interfaces:**
- Produces: `normalizeGitHubRepoUrl(value)`, `extensionAppliesToBot(config, botId)`, and a persisted extension manager using `rpc.capabilities.list/install/remove`.
- Stored config: `{ scope, instructions, botIds }`.

- [ ] **Step 1: Write failing tests** for canonical repo URL normalization, rejection of non-GitHub/issue/pull paths, bot-target filtering, and instruction length bounding.
- [ ] **Step 2: Run the focused test** and confirm RED because the helper module is missing.
- [ ] **Step 3: Implement pure validation/filter helpers.**
- [ ] **Step 4: Implement GitHub Extensions UI** with repo URL, display name, scope, optional instructions, target bots, installed list, and removal.
- [ ] **Step 5: Add `Apps` / `GitHub Extensions` tabs to `PluginsOverlay`** while preserving Composio behavior.
- [ ] **Step 6: Run focused tests and web typecheck** and commit.

### Task 4: Typed custom providers/models

**Files:**
- Modify: `apps/web/src/pages/ModelSettingsOverlay.tsx`
- Modify: `apps/web/e2e/settings-parity.spec.ts`

**Interfaces:**
- Consumes: existing `rpc.models.connect` and `rpc.models.setDefault`, both of which accept arbitrary provider/model strings.
- Produces: custom provider ID, model ID, display label, and API-key path independent of catalog selection.

- [ ] **Step 1: Add a failing Playwright/settings contract** asserting visible custom-model fields and an Add custom model action.
- [ ] **Step 2: Run the web settings test in CI or focused Playwright harness** and confirm RED because controls do not exist.
- [ ] **Step 3: Implement custom model form** with client validation, credential connect, immediate default selection, notices/errors, and refresh.
- [ ] **Step 4: Run settings E2E and web check** and commit.

### Task 5: Virtual Office and Shell integration

**Files:**
- Create: `apps/web/src/pages/VirtualOfficeOverlay.tsx`
- Modify: `apps/web/src/pages/Shell.tsx`
- Modify: `apps/web/e2e/golden.spec.ts`

**Interfaces:**
- `VirtualOfficeOverlay({ bots, activeBotId, onSelect, onClose, onOpenWorkbench })`.
- Shell owns `officeOpen` / `workbenchOpen`; workbench `onRun` dispatches through existing `rpc.threads.send` and refreshes the active thread.

- [ ] **Step 1: Add failing E2E assertions** for Office and Workbench sidebar entry points and overlay headings.
- [ ] **Step 2: Confirm RED** on current branch.
- [ ] **Step 3: Implement deterministic office zones** populated from current bots with shared animated avatars, status metrics, employee cards, click-to-select, and Artifact Studio/Sandbox Pod affordances.
- [ ] **Step 4: Wire Shell buttons/overlays** and fetch applicable persisted GitHub extension instructions for Workbench jobs.
- [ ] **Step 5: Run web E2E/check** and commit.

### Task 6: Fable judge, rewrite, and exact-head verification

**Files:**
- Modify only files with confirmed findings.

**Interfaces:**
- Produces: a PR diff that satisfies the design with no unverified safety or compatibility claims.

- [ ] **Step 1: Run targeted unit tests, web E2E, `pnpm lint`, `pnpm check`, `pnpm test`, and `pnpm build` through GitHub Actions/exact-head CI.**
- [ ] **Step 2: Inspect the complete PR diff** for security boundary leaks, fake sandbox/artifact claims, mobile/desktop regressions, duplicated state, and unbounded instructions.
- [ ] **Step 3: Reproduce every suspected defect before changing code.**
- [ ] **Step 4: For each confirmed defect, add/adjust a failing contract, fix minimally, and rerun affected checks.**
- [ ] **Step 5: Re-run exact-head canonical CI** and only report passing gates that have fresh evidence.
