import type { ActionApproval, ActionPolicy, Bot } from "@rakazo/contracts";
import { useEffect, useRef, useState } from "react";
import { rpc } from "../lib/rpc";

const POLICY_COPY: Record<ActionPolicy["mode"], string> = {
  legacy: "Keep this bot's current behavior. Use this when you already trust its configured tools.",
  "review-risky":
    "Ask before writes, host actions, external calls, or unknown tools. Safe reads continue.",
  "review-all": "Ask before every executor-mediated tool action.",
  "read-only": "Block mutable actions. The bot can inspect and reason, but cannot make changes.",
};

function approvalLabel(scope: ActionApproval["scope"]) {
  return scope === "host"
    ? "Host computer"
    : scope === "workspace"
      ? "Workspace"
      : scope === "external"
        ? "External service"
        : "Internal";
}

export function ActionApprovals({ bot, onClose }: { bot: Bot; onClose: () => void }) {
  const [fetchedPolicy, setFetchedPolicy] = useState<ActionPolicy>({ mode: "legacy", rules: [] });
  const [draftPolicy, setDraftPolicy] = useState<ActionPolicy>({ mode: "legacy", rules: [] });
  const [approvals, setApprovals] = useState<ActionApproval[]>([]);
  const [loadedBotId, setLoadedBotId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const scopeRef = useRef(0);
  const dirtyRef = useRef(false);

  function isCurrent(botId: string, scope: number) {
    return bot.id === botId && scopeRef.current === scope;
  }

  async function refresh(botId: string, scope: number) {
    const [nextPolicy, nextApprovals] = await Promise.all([
      rpc.approvals.policy({ botId }),
      rpc.approvals.list({ botId }),
    ]);
    if (!isCurrent(botId, scope)) return false;
    setFetchedPolicy(nextPolicy);
    if (!dirtyRef.current) setDraftPolicy(nextPolicy);
    setApprovals(nextApprovals);
    setLoadedBotId(botId);
    return true;
  }

  useEffect(() => {
    const botId = bot.id;
    scopeRef.current++;
    let stopped = false;
    let timer: number | undefined;
    dirtyRef.current = false;
    setLoadedBotId(null);
    setFetchedPolicy({ mode: "legacy", rules: [] });
    setDraftPolicy({ mode: "legacy", rules: [] });
    setApprovals([]);
    setBusy(false);
    async function poll() {
      const scope = scopeRef.current;
      try {
        const applied = await refresh(botId, scope);
        if (!stopped && applied) setNotice(null);
      } catch (error) {
        if (!stopped && isCurrent(botId, scope))
          setNotice(error instanceof Error ? error.message : "Could not load action approvals.");
      }
      if (!stopped) timer = window.setTimeout(() => void poll(), 3_000);
    }
    void poll();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [bot.id]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  function editPolicy(change: (current: ActionPolicy) => ActionPolicy) {
    dirtyRef.current = true;
    setDraftPolicy(change);
  }

  async function savePolicy() {
    const botId = bot.id;
    const policy = draftPolicy;
    let scope = ++scopeRef.current;
    setBusy(true);
    setNotice(null);
    try {
      const savedPolicy = await rpc.approvals.savePolicy({ botId, policy });
      if (!isCurrent(botId, scope)) return;
      scope = ++scopeRef.current;
      dirtyRef.current = false;
      setFetchedPolicy(savedPolicy);
      setDraftPolicy(savedPolicy);
      setNotice("Action policy saved.");
    } catch (error) {
      if (isCurrent(botId, scope))
        setNotice(error instanceof Error ? error.message : "Could not save the action policy.");
    } finally {
      if (isCurrent(botId, scope)) setBusy(false);
    }
  }

  async function resolve(
    approval: ActionApproval,
    decision: "allow-once" | "allow-exact" | "deny",
  ) {
    const botId = bot.id;
    let scope = ++scopeRef.current;
    setBusy(true);
    setNotice(null);
    try {
      await rpc.approvals.resolve({ approvalId: approval.id, decision });
      if (!isCurrent(botId, scope)) return;
      scope = ++scopeRef.current;
      const refreshed = await refresh(botId, scope);
      if (refreshed)
        setNotice(decision === "deny" ? "Action denied." : "Action approved and task resumed.");
    } catch (error) {
      if (isCurrent(botId, scope))
        setNotice(error instanceof Error ? error.message : "Could not resolve this action.");
    } finally {
      if (isCurrent(botId, scope)) setBusy(false);
    }
  }

  const hasUnsavedChanges = JSON.stringify(draftPolicy) !== JSON.stringify(fetchedPolicy);
  const pending = approvals.filter((approval) => approval.status === "pending");
  return (
    <div
      className="fixed inset-0 z-[98] flex items-center justify-center bg-black/80 p-3 backdrop-blur-md sm:p-6"
      role="presentation"
    >
      <section
        aria-modal="true"
        role="dialog"
        aria-labelledby="action-approvals-title"
        className="flex max-h-[94vh] w-full max-w-[760px] flex-col overflow-hidden rounded-[30px] border border-white/10 bg-[#0D0E10] text-[#F5F5F1] shadow-[0_40px_120px_rgba(0,0,0,.72)]"
      >
        <header className="flex items-start gap-4 border-white/10 border-b px-5 py-4 sm:px-7">
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-[#F5C76E] text-[10px] uppercase tracking-[0.24em]">
              Permission center
            </p>
            <h2
              id="action-approvals-title"
              className="mt-1 truncate font-semibold text-2xl tracking-tight"
            >
              Action approvals
            </h2>
            <p className="mt-1 text-[#858680] text-xs">
              Review only real pending work. Approving never grants another bot's permissions.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close Action approvals"
            onClick={onClose}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-lg hover:bg-white/[0.08]"
          >
            ×
          </button>
        </header>
        <div className="rk-scroll min-h-0 flex-1 space-y-5 overflow-y-auto p-5 sm:p-7">
          <section className="rounded-2xl border border-[#F5C76E]/20 bg-[#F5C76E]/[0.045] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-sm">{bot.name}'s action policy</p>
                <p className="mt-1 text-[#AEB0AA] text-xs">
                  This changes only {bot.name}'s own tool permissions.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void savePolicy()}
                disabled={busy || loadedBotId !== bot.id || !hasUnsavedChanges}
                className="rounded-xl bg-[#F5C76E] px-3 py-2 font-semibold text-[#19150E] text-xs disabled:opacity-50"
              >
                Save policy
              </button>
            </div>
            <label
              className="mt-4 block font-semibold text-[#D4D6CF] text-xs"
              htmlFor="action-policy-mode"
            >
              Review level
              <select
                id="action-policy-mode"
                value={draftPolicy.mode}
                disabled={busy || loadedBotId !== bot.id}
                onChange={(event) =>
                  editPolicy((current) => ({
                    ...current,
                    mode: event.target.value as ActionPolicy["mode"],
                  }))
                }
                className="mt-2 block w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm outline-none focus:border-[#F5C76E]/70"
              >
                <option value="legacy">Trust configured tools</option>
                <option value="review-risky">Review risky actions</option>
                <option value="review-all">Review each action</option>
                <option value="read-only">Read-only</option>
              </select>
            </label>
            <p className="mt-2 text-[#AEB0AA] text-xs">{POLICY_COPY[draftPolicy.mode]}</p>
            <p className="mt-2 text-[#858680] text-xs">
              Review, read-only, and custom-rule policies disable runtime-owned subagents and takeover.
              Ordinary bot collaboration remains subject to each bot's policy.
            </p>
            {draftPolicy.rules.filter((rule) => rule.decision === "allow" && rule.fingerprint)
              .length > 0 ? (
              <div className="mt-4 border-white/10 border-t pt-3">
                <p className="font-semibold text-[#D4D6CF] text-xs">Always-allowed exact actions</p>
                <div className="mt-2 space-y-2">
                  {draftPolicy.rules
                    .filter((rule) => rule.decision === "allow" && rule.fingerprint)
                    .map((rule) => (
                      <div
                        key={`${rule.tool}:${rule.fingerprint}`}
                        className="flex items-center justify-between gap-3 text-xs"
                      >
                        <span className="min-w-0 truncate text-[#AEB0AA]">{rule.tool}</span>
                        <button
                          type="button"
                          disabled={busy || loadedBotId !== bot.id}
                          onClick={() =>
                            editPolicy((current) => ({
                              ...current,
                              rules: current.rules.filter(
                                (candidate) =>
                                  candidate.tool !== rule.tool ||
                                  candidate.fingerprint !== rule.fingerprint,
                              ),
                            }))
                          }
                          className="shrink-0 rounded-lg border border-red-300/30 px-2 py-1 font-semibold text-red-200 disabled:opacity-50"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                </div>
              </div>
            ) : null}
          </section>
          <section aria-live="polite">
            <div className="mb-3 flex items-end justify-between gap-3">
              <div>
                <h3 className="font-semibold text-base">Pending actions</h3>
                <p className="mt-0.5 text-[#858680] text-xs">
                  Safe previews intentionally omit protected request values.
                </p>
              </div>
              <span className="rounded-full border border-white/10 px-2 py-1 font-semibold text-[#F5C76E] text-[10px]">
                {pending.length} pending
              </span>
            </div>
            {pending.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 p-5 text-[#858680] text-sm">
                No action is waiting for approval.
              </div>
            ) : (
              <div className="space-y-3">
                {pending.map((approval) => (
                  <article
                    key={approval.id}
                    className="rounded-2xl border border-white/10 bg-white/[0.025] p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-sm">{approval.tool}</p>
                        <p className="mt-0.5 text-[#AEB0AA] text-xs">
                          {approvalLabel(approval.scope)} · requested by {approval.botName}
                        </p>
                      </div>
                      <time className="text-[#858680] text-[10px]" dateTime={approval.expiresAt}>
                        Expires {new Date(approval.expiresAt).toLocaleString()}
                      </time>
                    </div>
                    <pre className="rk-scroll mt-3 max-h-28 overflow-auto whitespace-pre-wrap rounded-xl bg-black/30 p-3 text-[#C7C9C1] text-xs">
                      {approval.preview}
                    </pre>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void resolve(approval, "allow-once")}
                        className="rounded-xl bg-[#BDF268] px-3 py-2 font-semibold text-[#17200A] text-xs disabled:opacity-50"
                      >
                        Allow once
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void resolve(approval, "allow-exact")}
                        className="rounded-xl border border-[#8EDFF7]/35 px-3 py-2 font-semibold text-[#BCEFFA] text-xs disabled:opacity-50"
                      >
                        Always allow exact action
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void resolve(approval, "deny")}
                        className="rounded-xl border border-red-300/30 px-3 py-2 font-semibold text-red-200 text-xs disabled:opacity-50"
                      >
                        Deny
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
          {notice ? (
            <p className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[#D4D6CF] text-xs">
              {notice}
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
