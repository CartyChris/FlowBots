# FlowBots Fable Judge — selective upstream parity

Date: 2026-08-20

Scope: compare the newest 30 `elie222/rakazo` commits against PR #7 without merging upstream architecture wholesale. This fork intentionally keeps a persistent computer per bot and explicit/bounded Mnemosyne recall. Shared Team Computer architecture and silent memory injection are therefore not parity targets.

Decision vocabulary:

- **Equivalent / already covered** — the fork has the user-visible behavior or a stricter fork-specific equivalent.
- **Superseded by fork architecture** — upstream behavior conflicts with an intentional fork invariant.
- **Useful, no verified defect** — potentially valuable but no failing contract in PR #7 justifies importing it now.
- **Out of scope** — unrelated to this PR's local-first social-agent acceptance gates.

| # | Upstream | Change | Fable decision | Evidence / rationale |
|---:|---|---|---|---|
| 1 | `f0a2cb20` | Landing demo mobile hamburger | Out of scope | Marketing-site demo responsiveness; PR #7 acceptance is the authenticated FlowBots workspace. |
| 2 | `1c6f1463` | Self-host docs grammar | Out of scope | Documentation article correction only. |
| 3 | `ba61dd89` | Pluggable voice mode | Useful, no verified defect | Additive product feature, not a regression or acceptance requirement for PR #7. Do not expand merge scope before release validation. |
| 4 | `07404f63` | PR screenshot review improvements | Out of scope | Upstream contributor/review automation, not application runtime. |
| 5 | `23bfe476` | Landing bot branding refresh | Out of scope | Marketing-site presentation, intentionally separate from FlowBots product branding work. |
| 6 | `c3d386d8` | Expo SDK 57 native-module alignment | Useful, no verified defect | Mobile dependency maintenance; current PR gates focus web/desktop and no SDK mismatch has been reproduced. |
| 7 | `6224f511` | Clear conversation without deleting bot | Useful, no verified defect | Good future social-workspace UX, but not a regression in the approved PR #7 scope. |
| 8 | `eaa40cd8` | Sync live Composio auth into connection rows | Useful, no verified defect | Current fork has live Composio catalog/auth plus persisted connection rows. Its executor still consumes DB `connected` rows, so upstream's reconciliation is worth a focused future RED test; no failing PR #7 journey currently proves the race here. Do not import unproven behavior during finalization. |
| 9 | `b9733ce0` | Supermemory history compaction + auto recall | Superseded by fork architecture | Fork uses explicit bounded semantic recall/Mnemosyne and intentionally avoids silent upstream memory injection. Compaction may be revisited independently without adopting auto-recall semantics. |
| 10 | `ff7f2391` | App Store computer overlay / screen retries / health revision | Useful, no verified defect | Fork has substantially different Local AI OS/Electron runtime-health/session wiring and dedicated smoke/runtime tests. Port only a reproduced failure, not the upstream patch wholesale. |
| 11 | `1b92d560` | Harden Box view-only desktop proxy | Out of scope | Box provider is not a PR #7 target. |
| 12 | `c43c1530` | Box sandbox provider | Out of scope | Fork's local-first/per-bot sandbox architecture is intentionally different. |
| 13 | `8956ac6a` | Attach photos/files in chat | Useful, no verified defect | PR #7 exposes file/workspace actions through the real composer; upstream upload/attachment semantics are additive and can be evaluated as a separate feature. |
| 14 | `e70cfed5` | Publish safe PR screenshots | Out of scope | Repository review automation only. |
| 15 | `3c6e209c` | Team bots on parallel screens in a shared computer | Superseded by fork architecture | Fork intentionally gives each bot its own persistent computer, already enabling bot-level parallelism without adopting Team Computer leases/screens. |
| 16 | `7c1e5537` | README community badges | Out of scope | README cosmetics. |
| 17 | `9622c388` | Move routine run action into editor | Equivalent / already covered | PR #7 has real routine UI parity and E2E coverage around routine lifecycle; upstream placement is UI preference rather than a correctness gap. |
| 18 | `137e09eb` | Emulate Composio catalog in E2E | Equivalent / already covered | Fork has Composio-local tests plus Web E2E/settings coverage; current canonical Web E2E passes. |
| 19 | `799b3c8a` | Remove archive/delete from bot settings | Out of scope | Upstream settings information architecture choice; not a fork correctness issue. |
| 20 | `cf88b4c1` | Coding-agent setup prompt docs | Out of scope | Contributor documentation only. |
| 21 | `214e941e` | Side-panel layout overlap fix | Useful, no verified defect | PR #7 replaces substantial Shell/panel UI and has golden Web E2E. No overlap failure has been reproduced on the current branch. |
| 22 | `26184a3d` | Wait for signup UI before screenshot | Equivalent / already covered | Fork's onboarding/settings E2E explicitly waits for onboarding/app state before interaction and current Web E2E is green. |
| 23 | `02076d9e` | Enforce PR review follow-through | Equivalent / already covered | This Fable process itself requires post-check review, exact-head verification, full diff audit, and no merge until all gates are green. |
| 24 | `1bab2948` | Screenshot gallery columns | Out of scope | Review/gallery tooling rather than FlowBots runtime. |
| 25 | `b257b5b2` | README Team Computer / Daytona docs | Superseded by fork architecture | Would document architecture the fork intentionally does not adopt. |
| 26 | `b575ddbf` | Edit/delete routines | Equivalent / already covered | `routine-parity.spec.ts` verifies edit-in-place, delete confirmation, persistence after reload, and current Web E2E passes. |
| 27 | `2718b1f7` | Workspace-scoped model defaults + model management | Equivalent / already covered for PR scope | Fork scopes credentials/default selection by user+workspace, exposes model management after onboarding, and Task 13 adds credentialless Ollama workspace-default persistence and execution. Upstream's serializable retry/OAuth lifecycle extras remain useful but need an independent failing concurrency/auth contract before porting. |
| 28 | `c2fc2a29` | Faster Electron startup/interactions | Superseded in part; useful, no verified defect | Fork already has a custom standalone LocalRuntime, packaged-runtime health/session tests, hardened IPC, and mounted-DMG acceptance. Upstream's bundled-renderer/warm-window implementation targets a different desktop boot path. |
| 29 | `c3d5f550` | Centralize sandbox preparation/rollback | Superseded in part; useful, no verified defect | Fork has per-bot provisioning/restore/rollback and persistent-workspace behavior. Adopt only if final diff review reproduces a lifecycle leak. |
| 30 | `7bb72d83` | Daytona provider + real-provider E2E | Out of scope | Managed Daytona is not required for the local-first FlowBots release and should not displace per-bot local acceptance. |

## Judge conclusions

1. **Do not merge upstream `main` wholesale.** The two highest-conflict areas — Team Computer and silent Supermemory recall — would undo deliberate fork invariants.
2. **No upstream commit in this 30-commit window establishes a currently reproduced PR #7 defect by itself.** Candidate ideas (`eaa40cd8`, `ff7f2391`, `2718b1f7`, `c2fc2a29`, `c3d5f550`) require a fork-specific failing contract before code import.
3. **Task 13 is the required parity closure for local model defaults.** Credentialless Ollama preferences must survive as a workspace default and be selected by the executor without fabricating an encrypted secret.
4. **Bot social reactions remain intentionally bounded.** Bot reaction identity is separate from user identity and reactions must not wake target bots.
5. **Final acceptance remains evidence-driven.** Canonical CI, full PR diff review, merged-main CI, and fresh macOS/Mnemosyne/mounted-DMG verification are still mandatory after this review.
6. **The final skeptical pass found one verified Task 13 presentation defect and closed it RED→GREEN.** A credentialless Ollama preference row was reported as `hasKey: true`, causing Model Settings to misclassify the local preference as an encrypted credential. The added contract requires keyless Ollama rows to remain `hasKey: false` while encrypted providers remain true; the API now derives that flag from `secretId` and the UI only treats key-backed rows as connected credentials.
