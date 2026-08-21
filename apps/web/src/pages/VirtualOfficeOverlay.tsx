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
  onCustomize,
}: {
  bots: Bot[];
  activeBotId: string | null;
  onSelect: (botId: string) => void;
  onClose: () => void;
  onOpenWorkbench: (botId: string) => void;
  onCustomize: (botId: string) => void;
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
  const thinkingCount = bots.filter(
    (bot) => avatarStateForStatus(bot.status) === "thinking",
  ).length;
  const completedCount = bots.filter((bot) => avatarStateForStatus(bot.status) === "happy").length;
  const errorCount = bots.filter((bot) => avatarStateForStatus(bot.status) === "error").length;

  return (
    <div className="fixed inset-0 z-[85] overflow-hidden bg-[#070809] text-[#F5F5F1]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-75"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,.022) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.022) 1px, transparent 1px), radial-gradient(circle at 17% 18%, rgba(189,242,104,.13), transparent 24%), radial-gradient(circle at 82% 24%, rgba(142,223,247,.11), transparent 25%), radial-gradient(circle at 58% 84%, rgba(216,197,255,.09), transparent 25%)",
          backgroundSize: "28px 28px, 28px 28px, auto, auto, auto",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-[112px] h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent"
      />

      <div className="relative flex h-full flex-col">
        <header className="flex flex-wrap items-center gap-4 border-white/10 border-b bg-[#0B0C0E]/92 px-5 py-4 backdrop-blur-2xl sm:px-8">
          <div className="min-w-[240px] flex-1">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-2 w-2 rounded-full bg-[#BDF268] shadow-[0_0_14px_rgba(189,242,104,.75)]" />
              <p className="font-semibold text-[#BDF268] text-[10px] uppercase tracking-[0.24em]">
                FlowBots HQ · live roster
              </p>
            </div>
            <div className="mt-1 flex flex-wrap items-end gap-x-4 gap-y-1">
              <h2 className="font-semibold text-2xl tracking-tight sm:text-3xl">Virtual Office</h2>
              <span className="mb-1 rounded-full border border-white/[0.08] bg-white/[0.035] px-2.5 py-1 text-[#74756F] text-[9px] uppercase tracking-[0.14em]">
                identity-aware workspace
              </span>
            </div>
            <p className="mt-1 text-[#81827D] text-xs sm:text-sm">
              Every bot is an employee here. Their room, custom look, and motion follow real
              FlowBots state.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Metric label="Bots" value={bots.length} />
            <Metric label="Working" value={activeCount} accent="#BDF268" />
            <Metric label="Thinking" value={thinkingCount} accent="#8EDFF7" />
            <Metric label="Done" value={completedCount} accent="#D8C5FF" />
            {errorCount > 0 ? (
              <Metric label="Needs help" value={errorCount} accent="#FF9E9E" />
            ) : null}
          </div>

          <button
            type="button"
            aria-label="Close virtual office"
            onClick={onClose}
            className="grid h-11 w-11 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-lg transition hover:rotate-3 hover:bg-white/[0.08]"
          >
            ×
          </button>
        </header>

        <div className="rk-scroll min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          {bots.length === 0 ? (
            <div className="mx-auto mt-20 max-w-xl rounded-[30px] border border-white/10 border-dashed bg-white/[0.025] p-10 text-center shadow-2xl">
              <div className="mx-auto grid h-20 w-20 place-items-center rounded-[24px] border border-[#BDF268]/15 bg-[#BDF268]/10 text-4xl shadow-[0_0_45px_rgba(189,242,104,.08)]">
                ⌂
              </div>
              <h3 className="mt-5 font-semibold text-xl">
                The office is ready for its first employee.
              </h3>
              <p className="mt-2 text-[#868781] text-sm leading-6">
                Create a bot in FlowBots and it will appear here automatically—no separate office
                roster to maintain.
              </p>
            </div>
          ) : (
            <div className="mx-auto grid max-w-[1540px] gap-4 xl:grid-cols-2">
              {populated.map((zone, zoneIndex) => (
                <section
                  key={zone.id}
                  className={`relative overflow-hidden rounded-[30px] border border-white/[0.085] bg-[#111315]/94 p-4 shadow-[0_26px_70px_rgba(0,0,0,.28)] sm:p-5 ${
                    zoneIndex === populated.length - 1 ? "xl:col-span-2" : ""
                  }`}
                >
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 opacity-80"
                    style={{
                      background: `radial-gradient(circle at 8% 0%, ${zone.accent}13, transparent 28%), linear-gradient(145deg, transparent 50%, ${zone.accent}08)`,
                    }}
                  />
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-0 top-0 h-[2px] opacity-90"
                    style={{
                      background: `linear-gradient(90deg, ${zone.accent}, transparent 72%)`,
                    }}
                  />
                  <div className="relative mb-4 flex items-center gap-3">
                    <div
                      className="grid h-11 w-11 place-items-center rounded-[14px] border border-white/10 font-semibold text-sm shadow-inner"
                      style={{ backgroundColor: `${zone.accent}18`, color: zone.accent }}
                    >
                      {zone.glyph}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-base tracking-tight">{zone.name}</h3>
                      <p className="mt-0.5 text-[#73746E] text-[11px]">{zone.subtitle}</p>
                    </div>
                    <span className="rounded-full border border-white/[0.06] bg-black/20 px-2.5 py-1 text-[#8C8D87] text-[10px]">
                      {zone.bots.length} employee{zone.bots.length === 1 ? "" : "s"}
                    </span>
                  </div>

                  <div className="relative grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                    {zone.bots.map((bot) => {
                      const avatarState = avatarStateForStatus(bot.status);
                      const selected = bot.id === activeBotId;
                      return (
                        <article
                          key={bot.id}
                          className={`group relative overflow-hidden rounded-[22px] border p-3.5 transition duration-200 ${
                            selected
                              ? "border-white/25 bg-white/[0.075] ring-1 ring-white/10"
                              : "border-white/[0.065] bg-[#0B0C0E]/82 hover:-translate-y-0.5 hover:border-white/15 hover:bg-white/[0.045]"
                          }`}
                        >
                          <div
                            aria-hidden="true"
                            className="pointer-events-none absolute -top-16 -left-12 h-36 w-36 rounded-full blur-3xl transition-opacity group-hover:opacity-100"
                            style={{ backgroundColor: `${bot.color}12` }}
                          />

                          <button
                            type="button"
                            onClick={() => onSelect(bot.id)}
                            className="relative flex w-full items-start gap-3 text-left"
                          >
                            <div className="relative grid h-[78px] w-[78px] shrink-0 place-items-center rounded-[20px] border border-white/[0.075] bg-black/30 shadow-[inset_0_1px_rgba(255,255,255,.04)]">
                              <div
                                aria-hidden="true"
                                className="absolute inset-3 rounded-2xl opacity-25 blur-xl"
                                style={{ backgroundColor: bot.color }}
                              />
                              <BotAvatar
                                color={bot.color}
                                size={60}
                                state={avatarState}
                                label={bot.name}
                              />
                              <div
                                aria-hidden="true"
                                className="absolute right-3 bottom-1 left-3 h-1.5 rounded-[50%] bg-black/70 blur-[2px]"
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
                              <p
                                className="mt-2 flex items-center gap-1.5 text-[10px]"
                                style={{ color: zone.accent }}
                              >
                                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
                                {humanStatus(bot.status)}
                              </p>
                              <p className="mt-2 text-[#565752] text-[9px] uppercase tracking-[0.12em]">
                                tap avatar to open chat
                              </p>
                            </div>
                          </button>

                          <div className="relative mt-3 min-h-9 rounded-xl border border-white/[0.035] bg-white/[0.025] px-3 py-2 text-[#6E6F69] text-[10.5px] leading-4">
                            {bot.preview?.trim() || roomActivity(avatarState)}
                          </div>

                          <div className="relative mt-3 grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => onCustomize(bot.id)}
                              className="rounded-xl border border-[#D8C5FF]/10 bg-[#D8C5FF]/[0.035] px-3 py-2 font-medium text-[#B8ADC9] text-[10.5px] transition hover:border-[#D8C5FF]/25 hover:bg-[#D8C5FF]/[0.08] hover:text-[#F0E8FF]"
                            >
                              ✦ Customize look
                            </button>
                            <button
                              type="button"
                              onClick={() => onOpenWorkbench(bot.id)}
                              className="rounded-xl border border-white/[0.08] bg-white/[0.035] px-3 py-2 font-medium text-[#AEB0A9] text-[10.5px] transition hover:border-white/15 hover:bg-white/[0.07] hover:text-white"
                            >
                              {zone.id === "artifacts" ? "Artifact Studio" : "Workbench"}
                            </button>
                          </div>
                        </article>
                      );
                    })}
                    {zone.bots.length === 0 ? (
                      <div className="sm:col-span-2 2xl:col-span-3 rounded-2xl border border-white/[0.06] border-dashed bg-black/10 px-4 py-8 text-center text-[#5F605B] text-xs">
                        <div className="mx-auto mb-2 h-2 w-2 rounded-full bg-white/10" />
                        This room is quiet right now. Bots move here automatically as their state
                        changes.
                      </div>
                    ) : null}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>

        <footer className="flex flex-wrap items-center gap-x-3 gap-y-1 border-white/10 border-t bg-[#090A0C]/92 px-5 py-3 text-[#62635E] text-[10px] sm:px-8">
          <span>Office placement follows persisted bot/run status.</span>
          <span className="text-[#454641]">•</span>
          <span>
            Custom looks are shared with chat through the same FlowBots identity registry.
          </span>
          <span className="text-[#454641]">•</span>
          <span>Workbench actions use the real bot runtime.</span>
        </footer>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  accent = "#D6D6D1",
}: {
  label: string;
  value: number;
  accent?: string;
}) {
  return (
    <div className="min-w-[66px] rounded-xl border border-white/[0.07] bg-black/20 px-3 py-2 text-center shadow-inner">
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
  if (
    ["queued", "leased", "booting", "thinking", "pending"].some((needle) => value.includes(needle))
  ) {
    return "thinking";
  }
  if (["failed", "error"].some((needle) => value.includes(needle))) return "error";
  if (["complete", "completed", "success", "done"].some((needle) => value.includes(needle)))
    return "happy";
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
  if (state === "working")
    return "Hands on the current task; activity emotes update while the run is live.";
  if (state === "thinking") return "Reviewing context and deciding the next bounded action.";
  if (state === "happy")
    return "Latest work finished; ready for artifact review or the next handoff.";
  if (state === "error")
    return "A run reported an error; open the Workbench to isolate and verify a fix.";
  return "Available for a new assignment or a short collaboration.";
}

function stableHash(value: string): number {
  let hash = 0;
  for (const char of value) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash;
}
