import type { Bot } from "@rakazo/contracts";
import { BotAvatar, type BotAvatarState } from "@rakazo/ui-web";
import { useMemo } from "react";

const OFFICE_ZONES = [
  {
    id: "focus",
    name: "Focus Desks",
    subtitle: "Deep individual work",
    glyph: "⌨",
    accent: "#BDF268",
  },
  {
    id: "build",
    name: "Build Lab",
    subtitle: "Thinking, coding, and tool runs",
    glyph: "</>",
    accent: "#8EDFF7",
  },
  {
    id: "collab",
    name: "Collaboration Lounge",
    subtitle: "Idle bots, handoffs, and team sync",
    glyph: "◎",
    accent: "#D8C5FF",
  },
  {
    id: "artifacts",
    name: "Artifact Studio",
    subtitle: "Docs, decks, reports, apps, and games",
    glyph: "▧",
    accent: "#F7D77A",
  },
  {
    id: "sandbox",
    name: "Sandbox Pods",
    subtitle: "Isolation, tests, fixes, and recovery",
    glyph: "◫",
    accent: "#FF9E9E",
  },
] as const;

type OfficeZoneId = (typeof OFFICE_ZONES)[number]["id"];

export function VirtualOfficeOverlay({
  bots,
  activeBotId,
  onSelect,
  onClose,
  onOpenWorkbench,
}: {
  bots: Bot[];
  activeBotId: string | null;
  onSelect: (botId: string) => void;
  onClose: () => void;
  onOpenWorkbench: (botId: string) => void;
}) {
  const populated = useMemo(
    () =>
      OFFICE_ZONES.map((zone) => ({
        ...zone,
        bots: bots.filter((bot) => officeZoneFor(bot) === zone.id),
      })),
    [bots],
  );
  const activeCount = bots.filter((bot) => avatarStateForStatus(bot.status) === "working").length;
  const thinkingCount = bots.filter((bot) => avatarStateForStatus(bot.status) === "thinking").length;
  const completedCount = bots.filter((bot) => avatarStateForStatus(bot.status) === "happy").length;
  const errorCount = bots.filter((bot) => avatarStateForStatus(bot.status) === "error").length;

  return (
    <div className="fixed inset-0 z-[85] overflow-hidden bg-[#08090A] text-[#F5F5F1]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-50"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.025) 1px, transparent 1px), radial-gradient(circle at 18% 20%, rgba(189,242,104,.13), transparent 24%), radial-gradient(circle at 82% 24%, rgba(142,223,247,.11), transparent 25%), radial-gradient(circle at 58% 84%, rgba(216,197,255,.09), transparent 25%)",
          backgroundSize: "28px 28px, 28px 28px, auto, auto, auto",
        }}
      />

      <div className="relative flex h-full flex-col">
        <header className="flex flex-wrap items-center gap-4 border-white/10 border-b bg-[#0D0E10]/90 px-5 py-4 backdrop-blur-xl sm:px-8">
          <div className="min-w-[220px] flex-1">
            <p className="font-semibold text-[#BDF268] text-[10px] uppercase tracking-[0.24em]">
              FlowBots HQ · live roster
            </p>
            <h2 className="mt-1 font-semibold text-2xl tracking-tight sm:text-3xl">Virtual Office</h2>
            <p className="mt-1 text-[#81827D] text-xs sm:text-sm">
              Every bot you create is an employee here. Their room and animation follow actual FlowBots state.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Metric label="Bots" value={bots.length} />
            <Metric label="Working" value={activeCount} accent="#BDF268" />
            <Metric label="Thinking" value={thinkingCount} accent="#8EDFF7" />
            <Metric label="Done" value={completedCount} accent="#D8C5FF" />
            {errorCount > 0 ? <Metric label="Needs help" value={errorCount} accent="#FF9E9E" /> : null}
          </div>

          <button
            type="button"
            aria-label="Close virtual office"
            onClick={onClose}
            className="grid h-11 w-11 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-lg hover:bg-white/[0.08]"
          >
            ×
          </button>
        </header>

        <div className="rk-scroll min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          {bots.length === 0 ? (
            <div className="mx-auto mt-20 max-w-xl rounded-[28px] border border-white/10 border-dashed bg-white/[0.025] p-10 text-center">
              <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-[#BDF268]/10 text-3xl">⌂</div>
              <h3 className="mt-5 font-semibold text-xl">The office is ready for its first employee.</h3>
              <p className="mt-2 text-[#868781] text-sm leading-6">
                Create a bot in FlowBots and it will appear here automatically—no separate office roster to maintain.
              </p>
            </div>
          ) : (
            <div className="mx-auto grid max-w-[1500px] gap-4 xl:grid-cols-2">
              {populated.map((zone, zoneIndex) => (
                <section
                  key={zone.id}
                  className={`relative overflow-hidden rounded-[28px] border border-white/10 bg-[#121315]/92 p-4 shadow-2xl sm:p-5 ${
                    zoneIndex === populated.length - 1 ? "xl:col-span-2" : ""
                  }`}
                >
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-0 top-0 h-[2px] opacity-80"
                    style={{ background: `linear-gradient(90deg, ${zone.accent}, transparent 72%)` }}
                  />
                  <div className="mb-4 flex items-center gap-3">
                    <div
                      className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 font-semibold text-sm"
                      style={{ backgroundColor: `${zone.accent}18`, color: zone.accent }}
                    >
                      {zone.glyph}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-base">{zone.name}</h3>
                      <p className="mt-0.5 text-[#73746E] text-[11px]">{zone.subtitle}</p>
                    </div>
                    <span className="rounded-full bg-white/[0.05] px-2.5 py-1 text-[#8C8D87] text-[10px]">
                      {zone.bots.length} employee{zone.bots.length === 1 ? "" : "s"}
                    </span>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                    {zone.bots.map((bot) => {
                      const avatarState = avatarStateForStatus(bot.status);
                      const selected = bot.id === activeBotId;
                      return (
                        <article
                          key={bot.id}
                          className={`group relative rounded-2xl border p-3.5 transition ${
                            selected
                              ? "border-white/25 bg-white/[0.075] ring-1 ring-white/10"
                              : "border-white/[0.07] bg-[#0C0D0F]/80 hover:border-white/15 hover:bg-white/[0.045]"
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => onSelect(bot.id)}
                            className="flex w-full items-start gap-3 text-left"
                          >
                            <div className="relative grid h-[66px] w-[66px] shrink-0 place-items-center rounded-2xl border border-white/[0.07] bg-black/25">
                              <BotAvatar
                                color={bot.color}
                                size={52}
                                state={avatarState}
                                label={bot.name}
                              />
                            </div>
                            <div className="min-w-0 flex-1 pt-1">
                              <div className="flex items-center gap-2">
                                <h4 className="truncate font-semibold text-sm">{bot.name}</h4>
                                {selected ? (
                                  <span className="rounded-full bg-[#BDF268]/15 px-1.5 py-0.5 text-[#DFFBAE] text-[8px] uppercase tracking-wider">
                                    active
                                  </span>
                                ) : null}
                              </div>
                              <p className="mt-1 truncate text-[#777872] text-[11px]">
                                {bot.title || "FlowBots employee"}
                              </p>
                              <p className="mt-2 flex items-center gap-1.5 text-[10px]" style={{ color: zone.accent }}>
                                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
                                {humanStatus(bot.status)}
                              </p>
                            </div>
                          </button>

                          <div className="mt-3 min-h-9 rounded-xl bg-white/[0.025] px-3 py-2 text-[#6E6F69] text-[10.5px] leading-4">
                            {bot.preview?.trim() || roomActivity(avatarState)}
                          </div>

                          <button
                            type="button"
                            onClick={() => onOpenWorkbench(bot.id)}
                            className="mt-3 w-full rounded-xl border border-white/[0.08] bg-white/[0.035] px-3 py-2 font-medium text-[#AEB0A9] text-[10.5px] transition hover:border-white/15 hover:bg-white/[0.07] hover:text-white"
                          >
                            Open {zone.id === "artifacts" ? "Artifact Studio" : "Workbench"}
                          </button>
                        </article>
                      );
                    })}
                    {zone.bots.length === 0 ? (
                      <div className="sm:col-span-2 2xl:col-span-3 rounded-2xl border border-white/[0.06] border-dashed px-4 py-7 text-center text-[#5F605B] text-xs">
                        This room is quiet right now. Bots move here automatically as their state changes.
                      </div>
                    ) : null}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>

        <footer className="border-white/10 border-t bg-[#0A0B0C]/90 px-5 py-3 text-[#62635E] text-[10px] sm:px-8">
          Office placement is derived from persisted bot/run status; it does not create a second source of truth.
          Sandbox Pods and Artifact Studio dispatch through the same bot runtime as the main conversation.
        </footer>
      </div>
    </div>
  );
}

function Metric({ label, value, accent = "#D6D6D1" }: { label: string; value: number; accent?: string }) {
  return (
    <div className="min-w-[66px] rounded-xl border border-white/[0.07] bg-black/20 px-3 py-2 text-center">
      <div className="font-semibold text-base" style={{ color: accent }}>
        {value}
      </div>
      <div className="text-[#62635E] text-[8px] uppercase tracking-[0.16em]">{label}</div>
    </div>
  );
}

function officeZoneFor(bot: Bot): OfficeZoneId {
  const state = avatarStateForStatus(bot.status);
  if (state === "error") return "sandbox";
  if (state === "thinking") return "build";
  if (state === "happy") return "artifacts";
  if (state === "working") return stableHash(bot.id) % 3 === 0 ? "build" : "focus";
  return stableHash(bot.id) % 4 === 0 ? "artifacts" : "collab";
}

function avatarStateForStatus(status: string): BotAvatarState {
  const value = status.toLowerCase();
  if (["running", "working", "active"].some((needle) => value.includes(needle))) return "working";
  if (["queued", "leased", "booting", "thinking", "pending"].some((needle) => value.includes(needle))) {
    return "thinking";
  }
  if (["failed", "error"].some((needle) => value.includes(needle))) return "error";
  if (["complete", "completed", "success", "done"].some((needle) => value.includes(needle))) return "happy";
  return "idle";
}

function humanStatus(status: string): string {
  const state = avatarStateForStatus(status);
  if (state === "working") return "Actively working";
  if (state === "thinking") return "Thinking / preparing";
  if (state === "happy") return "Work delivered";
  if (state === "error") return "Needs intervention";
  return "Available";
}

function roomActivity(state: BotAvatarState): string {
  if (state === "working") return "Hands on the current task; activity emotes update while the run is live.";
  if (state === "thinking") return "Reviewing context and deciding the next bounded action.";
  if (state === "happy") return "Latest work finished; ready for artifact review or the next handoff.";
  if (state === "error") return "A run reported an error; open the Workbench to isolate and verify a fix.";
  return "Available for a new assignment or a short collaboration.";
}

function stableHash(value: string): number {
  let hash = 0;
  for (const char of value) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash;
}
