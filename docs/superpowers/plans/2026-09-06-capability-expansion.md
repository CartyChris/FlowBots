# Capability Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement each bounded slice with test-first gates. Fable owns independent-work scheduling and the final Judge pass.

**Goal:** Implement the ten approved Grok/Hermes-inspired capabilities without weakening FlowBots isolation or replacing its runtime.

**Architecture:** Add bounded domain and adapter modules around the existing executor, authenticated RPC, persisted capability registry, routines, and artifacts. UI projects real server state. Integrate shared-file changes serially; delegate independent files to Terra/Luna.

**Tech Stack:** TypeScript, Zod, Prisma/PostgreSQL/PGlite, oRPC/Hono, React, Vitest/Playwright; existing runtime/provider adapters.

**Spec:** `docs/superpowers/specs/2026-09-06-capability-expansion-design.md`

## Global Constraints

- No deployment, main merge, automatic service installation, paid verification calls, or automatic third-party account connection.
- Additive migrations only. No secrets in public files, events, or model-visible capability metadata.
- Preserve workspace/user/bot/Flow/group boundaries and existing worker/reconciler scheduling.
- An unavailable optional backend must not impair text chat, CPU/Apple/NVIDIA portability, or existing computers.
- Every slice requires observed failing tests, passing implementation tests, integration evidence, and usable entry points before completion.

## Stage 1: Baseline and grounded design

- [x] Read prior checkpoint and affected runtime, contracts, API, UI, and tests.
- [x] Compare local and remote content trees; preserve existing feature branch.
- [ ] Baseline unit suite and package typecheck.
- [x] Record design choices, feature acceptance, and ten-slice scope.

## Stage 2: Action approvals (first implementation slice)

Files: new `packages/contracts/src/approvals.ts`, `packages/core/src/action-policy.ts`, `packages/adapters/src/action-approvals.ts`, `apps/api/src/action-approvals.ts`, `apps/web/src/pages/ActionApprovals.tsx`; additive Prisma migration; surgical executor/router/contract/CreativeRuntimeHost integration.

Interfaces: `ActionPolicy` has mode `legacy | review-risky | review-all | read-only`, ordered exact-tool rules with `allow | ask | deny` and optional request fingerprint. A request is bound to workspace/user/bot/run/tool/executionId/fingerprint, expires, and has immutable decision history. Review previews are bounded and redacted. Pending approval checkpoint uses a reserved prefix; only the approval resolver can release it. Resumption executes the original stored tool request with its original effect identity, not a newly generated action. Completed effects replay their result; uncertain intended effects are not retried blindly.

- [ ] Write pure policy tests with literal decisions for read, workspace write, shell, connector, deny precedence, prototype names, and malformed rules; observe RED, implement, observe GREEN.
- [ ] Write migrated-database tests for scope, allow once, exact-action rules, expiration, concurrent decisions, cancellation, and replay; observe RED, implement persistence/resolver, observe GREEN.
- [ ] Write real executor journeys proving no side effect before approval, exact action after restart, no duplicate action, no ordinary-answer bypass, and policy isolation between bots; observe RED then GREEN.
- [ ] Add policy editor and pending/history action cards with clear target, redacted preview, allow-once/exact-rule/deny, busy/error state and keyboard-accessible controls.
- [ ] Run targeted tests/typecheck/lint; independent review; fix verified findings; commit.

## Stage 3: Voice

Files: `apps/web/src/lib/voice.ts`, `apps/web/src/pages/VoiceControls.tsx`, tests beside each; surgical private/group composer wiring.

Interface: capability-detected controller with `start/stop/dispose`, final-transcript callback, status/error callback, and explicit read-aloud/stop. User gesture and privacy disclosure required. Final transcript appends to current bot/room draft only; route changes abort capture and speech.

- [ ] RED tests for final/interim text, denial, unsupported browser, repeated start, late events after stop/dispose, and speech cancellation.
- [ ] Implement controller/UI and wire drafts; no auto-send, background microphone, or fabricated offline claims.
- [ ] Component tests plus targeted typecheck and browser journey; review and commit.

## Stage 4: Skills and demonstrations

Files: focused contracts/core/adapters/API/UI modules; preserve capability registry and routines scheduler.

- [ ] Specify exact bounded manifest/step types from the existing seams, then test owner/bot scope, progressive loading and no authority changes before implementation.
- [ ] Implement real skill install/list/read/disable and reviewed learning; connect catalogue/tool retrieval in executor.
- [ ] Implement real demonstration recording/review-to-draft routine; exclude protected text and unsupported actions; exercise replay/adaptation through real executor.
- [ ] Run migrated database, UI, and routine regression gates; review and commit each coherent slice.

## Stage 5: Detached and browser/native adapters

- [ ] Reuse current worker/headless runtime with explicit start/status/stop and single-owner data directory; lifecycle/error-path tests before implementation.
- [ ] Add opt-in background accessibility adapter with actual platform capability probe; unsupported fallback must pass tests.
- [ ] Add managed browser session configuration preserving real existing E2B profiles and bot ownership; network adapters tested at transport boundary.
- [ ] Run provider conformance/recovery gates; record any unverified native platforms separately; review and commit.

## Stage 6: Gateway, media, and SDK

- [ ] Define scoped gateway binding/receipt/outbox and implement an actual transport, not only an emulator; test dedupe, recipient isolation, retries, and stop.
- [ ] Implement BYOK media adapter and real artifact persistence with size/type/ownership limits, then media UI; no live paid calls during tests.
- [ ] Implement bounded DAG validation/execution and SDK start/results/cancel over existing task ledger; test cycles, independent vs dependent work, replay, and permission boundaries.
- [ ] Integration and product journeys, review, fixes and coherent commits.

## Stage 7: Judge and final checkpoint

- [ ] Fresh-context adversarial review of code against the spec; only evidence-backed findings.
- [ ] Fix every confirmed blocker and rerun affected gates.
- [ ] Run full relevant tests, monorepo typecheck/lint/build and high-value browser journeys once against revised code.
- [ ] Update durable checkpoint with exact SHAs, feature-by-feature state, test evidence and next action; push only verified feature work.
- [ ] Per latest user instruction, build and verify a universal macOS DMG after revised source gates pass. Use lower-cost release execution, verify both architectures and bundled native resources/startup, independently hash the downloaded exact CI artifact. Do not deploy, merge main, or install a service.
