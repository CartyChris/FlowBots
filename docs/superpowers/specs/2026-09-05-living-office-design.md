# Living Office: collaboration and truthful presence

## Scope and baseline

Start: `feature/interactive-group-chats-finish` at `2d7ef6803e4954404c754cbe9751565f87dbd85c`.
Main observed at `8fbf145f98513a73358ab3c4728138b18bf00ef9`.
One successor branch: `feature/living-office-kernel`, in a fresh isolated checkout.
User authorizes autonomous design decisions, implementation, tests and commits. No deployment or main merge.

The existing peer connector already creates persistent tasks/runs. The existing executor and local PGlite runtime share the PostgreSQL schema. Preserve these foundations instead of adding a second scheduler.

## Decisions

1. Extend existing Task with durable parent/child lineage and a compact collaboration packet; child runs retain their own bot/thread/user/workspace authority. Add a unique parent/request identifier for replay protection. Keep collaboration context separate from private message history.
2. Persist handoff events transactionally with child creation. Validate source run, target ownership, Flow participation, group membership where applicable, ancestor cycles, depth, fan-out and busy state before side effects. Serialize delegation/cancellation with a transaction advisory lock per root, then lock the source run and validate executor-owned lease owner/fence. This avoids reversing the existing finalizer Run → Task lock order. A request receipt fingerprints the entire assignment batch; do not trust model-authored hop headers for new lineage.
3. Expose task-scoped results/artifact references through an explicit result tool and authenticated Mission Control. Never claim asynchronous child work is finished merely because it was queued. Automatic resume/synthesis and full Gauntlet are subsequent slices, not implied by this foundation.
4. Canonical presence belongs to contracts/core, projected from persisted run status and explicit safe activity events. No tool arguments, raw reasoning or credentials in presence. Terminal run status wins over stale events. Completion acknowledgment expires deterministically.
5. Office, room and Mission Control consume the same presence projection. Keep existing avatar customization; derive stations and expression from real actions. Stop controls use authoritative run cancellation and propagate to descendants.
6. Every waking peer tool, including legacy `message_bot`, uses the same task ledger. Group/delegated tasks may read only scoped child results, never private teammate history. Effect completion is fenced transactionally; committed handoffs return their IDs even when dispatch needs reconciliation.
7. Prefer bounded data queries and CSS motion; no model calls for visuals, routing or social expression. Preserve reduced motion. No GPU dependencies in ordinary operation.

## Alternatives considered

- New orchestration scheduler: rejected for this slice because it duplicates lease/fence/effect controls and multiplies recovery paths.
- UI-only teamwork: rejected because it cannot establish ownership, recovery, permission checks or result provenance.
- Extending Task/Run plus shared projections: selected; compatible with web, embedded desktop database and shared API.

## Stage gates / done criteria

1. Audit: branch ancestry, main SHA, relevant source paths and existing behavior read (PASS).
2. Collaboration: deterministic tests and real database journeys prove scoped atomic child creation, compact context, references, idempotency, cycle/depth/fan-out limits, cancellation and result access.
3. Presence: tests prove actual tool/lifecycle projection, stale-event rejection, completion expiry and safe summaries; API hydration survives reload.
4. Surfaces: Office/Mission Control expose real owner/run/action/artifacts and cancellation; group/private isolation remains covered; browser journeys and reduced motion checked.
5. Judge and revised verification: review diff for confirmed defects; lint/typecheck/relevant tests/build pass before GREEN claims. Record unavailable gates explicitly.

## Remaining roadmap

Bounded Solo/Smart Team/Gauntlet scheduler, structured judge/revision/verification, hardware capability discovery and measured advisor, reusable workflows, automatic parent continuation and richer recovery follow these foundations. Do not display unfinished execution modes as working features.
