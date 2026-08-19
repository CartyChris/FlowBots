import { reactionEmoji, REACTION_KINDS, type ReactionKind } from "@rakazo/core";
import { useEffect, useState } from "react";

type ReactionSummary = { kind: ReactionKind; count: number; reactedByMe: boolean };

export function MessageReactions({ messageId }: { messageId: string }) {
  const [rows, setRows] = useState<ReactionSummary[]>([]);
  const [pending, setPending] = useState<ReactionKind | null>(null);

  useEffect(() => {
    let active = true;
    void fetch(`/api/reactions/${encodeURIComponent(messageId)}`, { credentials: "include" })
      .then(async (response) => (response.ok ? ((await response.json()) as ReactionSummary[]) : []))
      .then((next) => {
        if (active) setRows(next);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [messageId]);

  async function toggle(kind: ReactionKind) {
    if (pending) return;
    const current = rows.find((row) => row.kind === kind);
    setPending(kind);
    try {
      const response = await fetch(`/api/reactions/${encodeURIComponent(messageId)}`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, active: !current?.reactedByMe }),
      });
      if (!response.ok) throw new Error("Reaction update failed");
      setRows((await response.json()) as ReactionSummary[]);
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex gap-1 px-2 pt-1 opacity-55 transition-opacity hover:opacity-100 focus-within:opacity-100">
      {REACTION_KINDS.map((kind) => {
        const summary = rows.find((row) => row.kind === kind);
        const emoji = reactionEmoji(kind);
        return (
          <button
            key={kind}
            type="button"
            disabled={pending !== null}
            aria-pressed={summary?.reactedByMe ?? false}
            aria-label={`React ${emoji}`}
            onClick={() => void toggle(kind)}
            className={`rounded-full px-1.5 py-0.5 text-[12px] transition-colors disabled:opacity-45 ${
              summary?.reactedByMe ? "bg-[#2A2A2E] text-white" : "hover:bg-[#202023]"
            }`}
          >
            {emoji}
            {summary?.count ? <span className="ml-1 text-[10px]">{summary.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
