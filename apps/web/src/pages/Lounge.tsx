import type { Bot, LoungeSession } from "@rakazo/contracts";
import { personaDefinition } from "@rakazo/core";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { rpc } from "../lib/rpc";

type Topic = { id: string; label: string; prompt: string };

export function LoungePage() {
  const navigate = useNavigate();
  const [bots, setBots] = useState<Bot[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [topicId, setTopicId] = useState("shipped");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [running, setRunning] = useState(false);
  const [session, setSession] = useState<LoungeSession | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([rpc.bots.list().catch(() => []), rpc.lounge.topics().catch(() => [])]).then(
      ([botList, topicList]) => {
        setBots(botList);
        setTopics(topicList);
        setSelected(new Set(botList.slice(0, Math.min(3, botList.length)).map((b) => b.id)));
        if (topicList[0]) setTopicId((current) => current || topicList[0]!.id);
      },
    );
  }, []);

  const chosen = useMemo(() => bots.filter((bot) => selected.has(bot.id)), [bots, selected]);
  const topic = topics.find((t) => t.id === topicId) ?? topics[0];

  async function start() {
    setError(null);
    setRunning(true);
    setSession(null);
    try {
      const result = await rpc.lounge.start({
        topicId: topic?.id ?? "shipped",
        botIds: chosen.map((bot) => bot.id),
        rounds: 1,
      });
      setSession(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The lounge stayed quiet.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex h-full min-w-0 flex-col bg-[#0D0D0E] text-[#DFDFE2]">
      <div className="flex items-center justify-between border-b border-[#141416] px-[22px] py-[17px]">
        <div>
          <div className="text-[16px] font-medium text-[#ECECEE]">🛋️ Lounge</div>
          <div className="text-[12.5px] text-[#6C6C70]">
            Your bots, one room, zero agenda (okay, a tiny agenda)
          </div>
        </div>
        <button
          type="button"
          onClick={() => navigate("/app")}
          className="rounded-[11px] border border-[#26262A] px-3.5 py-1.5 text-[13px] text-[#C9C9CE] hover:bg-[#161618]"
        >
          Back to chats
        </button>
      </div>

      <div className="rk-scroll flex-1 overflow-y-auto px-6 py-5">
        <div className="max-w-[720px]">
          <div className="text-[13.5px] text-[#85858A]">Who's in the room</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {bots.map((bot) => {
              const on = selected.has(bot.id);
              return (
                <button
                  key={bot.id}
                  type="button"
                  onClick={() =>
                    setSelected((prev) => {
                      const next = new Set(prev);
                      if (next.has(bot.id)) next.delete(bot.id);
                      else if (next.size < 4) next.add(bot.id);
                      return next;
                    })
                  }
                  className={`flex items-center gap-2 rounded-full border px-3.5 py-2 text-[13.5px] ${
                    on
                      ? "border-[#3A3A40] bg-[#1B1B1E] text-[#ECECEE]"
                      : "border-[#202023] bg-transparent text-[#85858A] hover:bg-[#131315]"
                  }`}
                >
                  <span>{personaDefinition(bot.persona.id).emoji}</span>
                  <span>{bot.name}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-5 text-[13.5px] text-[#85858A]">Tonight's topic</div>
          <div className="mt-2 flex flex-col gap-1.5">
            {topics.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTopicId(t.id)}
                className={`rounded-[13px] border px-4 py-3 text-left ${
                  t.id === topicId
                    ? "border-[#3A3A40] bg-[#161618]"
                    : "border-[#1B1B1E] bg-transparent hover:bg-[#131315]"
                }`}
              >
                <div className="text-[14.5px] text-[#ECECEE]">{t.label}</div>
                <div className="mt-0.5 text-[12.5px] leading-[1.45] text-[#6C6C70]">{t.prompt}</div>
              </button>
            ))}
          </div>

          <button
            type="button"
            disabled={running || chosen.length < 2}
            onClick={() => void start()}
            className="mt-5 rounded-[11px] bg-[#F1F1EF] px-5 py-2.5 text-[#17171A] disabled:opacity-40"
          >
            {running ? "The room is talking…" : "Start the lounge"}
          </button>
          {chosen.length < 2 ? (
            <p className="mt-2 text-[12.5px] text-[#6C6C70]">Pick at least two bots.</p>
          ) : null}
          {error ? <p className="mt-3 text-sm text-[#E65707]">{error}</p> : null}

          {session ? (
            <div className="mt-6 rounded-[18px] border border-[#232326] bg-[#111113] px-5 py-4">
              <div className="flex items-center justify-between">
                <span className="text-[14px] font-medium text-[#ECECEE]">{session.topicLabel}</span>
                <span className="text-[12px] text-[#6C6C70]">just now</span>
              </div>
              <div className="mt-3 flex flex-col gap-3">
                {session.lines.map((line, i) => (
                  <div key={`${line.botId}-${i}`} className="flex items-start gap-3">
                    <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full bg-[#1B1B1E] text-[15px]">
                      {line.emoji || "🤖"}
                    </span>
                    <div>
                      <div className="text-[13px] font-medium text-[#ECECEE]">{line.name}</div>
                      <div className="mt-0.5 text-[14px] leading-[1.5] text-[#C9C9CE]">
                        {line.reply}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
