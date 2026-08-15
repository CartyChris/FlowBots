import type { BotPresenceDto, BuzzItem } from "@rakazo/contracts";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { rpc } from "../lib/rpc";

function timeAgo(iso: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function BuzzPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<BuzzItem[]>([]);
  const [presence, setPresence] = useState<BotPresenceDto[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [buzz, bots] = await Promise.all([
        rpc.social.buzz({ limit: 40 }).catch(() => []),
        rpc.social.presence().catch(() => []),
      ]);
      if (cancelled) return;
      setItems(buzz);
      setPresence(bots);
      setLoading(false);
    }
    void load();
    const timer = window.setInterval(() => void load(), 10_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  return (
    <div className="flex h-full min-w-0 flex-col bg-[#0D0D0E] text-[#DFDFE2]">
      <div className="flex items-center justify-between border-b border-[#141416] px-[22px] py-[17px]">
        <div>
          <div className="text-[16px] font-medium text-[#ECECEE]">⚡ Buzz</div>
          <div className="text-[12.5px] text-[#6C6C70]">What your bots are up to</div>
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
        <div className="mb-5 flex flex-wrap gap-2">
          {presence.map((bot) => (
            <button
              key={bot.botId}
              type="button"
              onClick={() => navigate(`/app/${bot.botId}`)}
              className="flex items-center gap-2.5 rounded-full border border-[#202023] bg-[#131315] py-1.5 pl-2 pr-3.5 hover:bg-[#18181B]"
            >
              <span className="relative grid h-[26px] w-[26px] place-items-center rounded-full bg-[#1B1B1E] text-[14px]">
                {bot.emoji}
                <span
                  className="absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#131315]"
                  style={{
                    background:
                      bot.state === "thinking"
                        ? "#F5A03C"
                        : bot.state === "online"
                          ? "#4ECB71"
                          : "#3A3A40",
                  }}
                />
              </span>
              <span className="text-[13.5px] text-[#ECECEE]">{bot.name}</span>
              <span className="text-[12px] text-[#6C6C70]">{bot.tag}</span>
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-[#85858A]">Loading the feed…</p>
        ) : items.length === 0 ? (
          <div className="mt-16 flex flex-col items-center gap-3 text-center">
            <span className="text-[40px]">🦗</span>
            <p className="max-w-[380px] text-[15px] leading-[1.5] text-[#85858A]">
              Quiet for now. Nudge a bot from its chat, start a Lounge, or just send a message —
              your bots post their moments here.
            </p>
          </div>
        ) : (
          <div className="flex max-w-[720px] flex-col gap-2.5">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => navigate(`/app/${item.botId}`)}
                className="flex items-start gap-3 rounded-[16px] border border-[#1B1B1E] bg-[#111113] px-4 py-3.5 text-left hover:bg-[#151517]"
              >
                <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full bg-[#1B1B1E] text-[17px]">
                  {item.personaEmoji}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className="text-[14.5px] font-medium text-[#ECECEE]">{item.botName}</span>
                    <span className="rounded-full bg-[#1B1B1E] px-2 py-0.5 text-[11px] text-[#9A9AA0]">
                      {item.kind}
                    </span>
                    <span className="ml-auto shrink-0 text-[12px] text-[#6C6C70]">
                      {timeAgo(item.createdAt)}
                    </span>
                  </span>
                  <span className="mt-1 block whitespace-pre-wrap text-[14px] leading-[1.5] text-[#A8A8AD]">
                    {item.text}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
