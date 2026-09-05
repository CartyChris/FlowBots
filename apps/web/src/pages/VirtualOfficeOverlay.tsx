import type { Bot, MissionTask, OfficeStation } from "@rakazo/contracts";
import { BotAvatar, botAvatarStateForPresence } from "@rakazo/ui-web";
import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { MissionControl } from "./MissionControl.js";

const OFFICE_ZONES: {
  id: OfficeStation;
  name: string;
  subtitle: string;
  glyph: string;
  accent: string;
}[] = [
  {
    id: "focus",
    name: "Focus Desks",
    subtitle: "Reading, thinking and writing",
    glyph: "⌨",
    accent: "#BDF268",
  },
  {
    id: "research",
    name: "Research Station",
    subtitle: "Public search and source reading",
    glyph: "⌕",
    accent: "#8EDFF7",
  },
  {
    id: "development",
    name: "Build Lab",
    subtitle: "Code, builds and command execution",
    glyph: "</>",
    accent: "#80C4F7",
  },
  {
    id: "collaboration",
    name: "Collaboration Table",
    subtitle: "Consultations, delegation and handoffs",
    glyph: "◎",
    accent: "#D8C5FF",
  },
  {
    id: "review",
    name: "Review Desk",
    subtitle: "Review, testing and verification",
    glyph: "⊙",
    accent: "#C0D2FF",
  },
  {
    id: "artifacts",
    name: "Artifact Studio",
    subtitle: "Work completed; inspect real deliverables",
    glyph: "▧",
    accent: "#F7D77A",
  },
  {
    id: "help",
    name: "Needs Attention",
    subtitle: "Blocked runs and user decisions",
    glyph: "!",
    accent: "#FFADAD",
  },
  {
    id: "lounge",
    name: "Lounge",
    subtitle: "Available bots and queued work",
    glyph: "⌂",
    accent: "#ABBEB2",
  },
];
const RESTING = new Set(["idle", "complete", "failed", "cancelled", "blocked", "needs_user"]);

export function VirtualOfficeOverlay({
  bots,
  activeBotId,
  onSelect,
  onClose,
  onOpenWorkbench,
  onCustomize,
  onSteer,
  tasks = [],
  truncated = false,
  revision = 0,
  error = null,
  onStop,
  onOpenChat,
}: {
  bots: Bot[];
  activeBotId: string | null;
  onSelect: (botId: string) => void;
  onClose: () => void;
  onOpenWorkbench: (botId: string) => void;
  onCustomize: (botId: string) => void;
  onSteer?: (botId: string) => void;
  tasks?: MissionTask[];
  truncated?: boolean;
  revision?: number;
  error?: string | null;
  onStop?: (taskId: string) => Promise<void>;
  onOpenChat?: (botId: string, groupChatId: string | null) => void;
}) {
  const [tab, setTab] = useState<"office" | "missions">("office");
  const [inspectTaskId, setInspectTaskId] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const populated = useMemo(
    () =>
      OFFICE_ZONES.map((zone) => ({
        ...zone,
        bots: bots.filter((bot) => (bot.presence?.station ?? "lounge") === zone.id),
      })),
    [bots],
  );
  const activeCount = bots.filter((bot) => bot.presence && !RESTING.has(bot.presence.state)).length;
  const helpCount = bots.filter((bot) => bot.presence?.station === "help").length;

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    root.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => {
      if (previous?.isConnected) previous.focus();
    };
  }, []);

  function inspect(taskId: string) {
    setInspectTaskId(taskId);
    setTab("missions");
  }

  return (
    <div
      ref={root}
      role="dialog"
      aria-modal="true"
      aria-labelledby="virtual-office-title"
      className="office-overlay fixed inset-0 z-[85] flex flex-col overflow-hidden bg-[#080D0F] text-[#EDF3EF]"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          closeRef.current();
        }
        if (event.key !== "Tab") return;
        const controls = Array.from(
          root.current?.querySelectorAll<HTMLElement>(
            'button:not([disabled]), a[href], select, summary, [tabindex="0"]',
          ) ?? [],
        ).filter((element) => element.getClientRects().length > 0);
        const first = controls[0];
        const last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
    >
      <header className="relative flex flex-wrap items-center gap-4 border-b border-white/10 bg-[#101719] px-5 py-4 sm:px-8">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#BDF268]">
            FlowBots HQ · Your workers
          </p>
          <h2
            id="virtual-office-title"
            className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl"
          >
            Virtual Office
          </h2>
          <p className="mt-1 text-xs text-[#9BA8A1] sm:text-sm">
            Real bots. Real work. One shared view of every task.
          </p>
        </div>
        <div className="hidden gap-2 sm:flex">
          <Metric label="Bots" value={bots.length} />
          <Metric label="Active" value={activeCount} />
          {helpCount ? <Metric label="Need help" value={helpCount} /> : null}
        </div>
        <button
          type="button"
          aria-label="Close virtual office"
          onClick={onClose}
          className="grid h-11 w-11 place-items-center rounded-full border border-white/15 bg-white/5 text-xl hover:bg-white/10"
        >
          ×
        </button>
      </header>
      <div
        role="tablist"
        aria-label="Office views"
        className="flex gap-2 border-b border-white/10 bg-[#0E1517] px-5 py-3 sm:px-8"
      >
        <button
          type="button"
          role="tab"
          id="office-tab"
          aria-controls="office-panel"
          aria-selected={tab === "office"}
          className={`office-view-tab ${tab === "office" ? "office-view-selected" : ""}`}
          onClick={() => setTab("office")}
        >
          Office floor
        </button>
        <button
          type="button"
          role="tab"
          id="missions-tab"
          aria-controls="office-panel"
          aria-selected={tab === "missions"}
          className={`office-view-tab ${tab === "missions" ? "office-view-selected" : ""}`}
          onClick={() => {
            setInspectTaskId(null);
            setTab("missions");
          }}
        >
          Mission Control
        </button>
        <span className="ml-auto hidden self-center text-xs text-[#9EACA4] md:block">
          {error ? "Updates paused" : "Synced with persisted runtime"}
        </span>
      </div>
      <div
        id="office-panel"
        role="tabpanel"
        aria-labelledby={tab === "office" ? "office-tab" : "missions-tab"}
        className="rk-scroll min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8"
      >
        {tab === "missions" ? (
          <MissionControl
            key={inspectTaskId ?? "ledger"}
            tasks={tasks}
            bots={bots}
            revision={revision}
            truncated={truncated}
            error={error}
            initialTaskId={inspectTaskId}
            onOpenChat={onOpenChat ?? ((id) => onSelect(id))}
            onStop={
              onStop ??
              (async () => {
                throw new Error("Task cancellation is unavailable.");
              })
            }
          />
        ) : (
          <>
            {error ? (
              <p role="alert" className="office-alert mx-auto mb-4 max-w-[1540px]">
                Updates paused: {error}. Showing the last available roster.
              </p>
            ) : null}
            {bots.length === 0 ? (
              <div className="office-empty mx-auto mt-12 max-w-xl">
                <h3 className="text-xl font-semibold">Your office is ready.</h3>
                <p className="mt-3 text-sm">
                  Create a bot in FlowBots and it will appear here automatically.
                </p>
              </div>
            ) : (
              <div className="mx-auto grid max-w-[1540px] gap-4 xl:grid-cols-2">
                {populated.map((zone) => (
                  <section
                    key={zone.id}
                    aria-label={zone.name}
                    className="office-station relative overflow-hidden rounded-3xl border border-white/10 bg-[#111A1D] p-4 sm:p-5"
                    style={{ "--station-accent": zone.accent } as CSSProperties}
                  >
                    <div className="relative mb-4 flex items-center gap-3">
                      <span
                        aria-hidden="true"
                        className="grid h-11 w-11 place-items-center rounded-xl border border-white/10 bg-black/20 font-semibold"
                        style={{ color: zone.accent }}
                      >
                        {zone.glyph}
                      </span>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold">{zone.name}</h3>
                        <p className="mt-1 text-xs text-[#9AABA3]">{zone.subtitle}</p>
                      </div>
                      <span className="office-chip">{zone.bots.length}</span>
                    </div>
                    <div className="relative grid gap-3 sm:grid-cols-2">
                      {zone.bots.map((bot, index) => {
                        const presence = bot.presence;
                        const state = presence?.state ?? "idle";
                        const currentTask = tasks.find((task) => task.id === presence?.taskId);
                        return (
                          <article
                            key={bot.id}
                            data-bot-id={bot.id}
                            data-station={zone.id}
                            data-presence={state}
                            className={`office-worker min-w-0 rounded-2xl border bg-[#0B1214] p-4 ${activeBotId === bot.id ? "border-[#BDF268]/40" : "border-white/10"}`}
                          >
                            <button
                              type="button"
                              onClick={() => onSelect(bot.id)}
                              aria-label={`Open ${bot.name} chat`}
                              className="flex w-full items-center gap-3 text-left"
                            >
                              <div
                                className="office-bot-scene relative flex h-[124px] w-[112px] shrink-0 items-center justify-center"
                                style={
                                  {
                                    "--motion-offset": `${index * -0.7}s`,
                                    "--bot-color": bot.color,
                                  } as CSSProperties
                                }
                              >
                                <BotAvatar
                                  color={bot.color}
                                  size={88}
                                  state={botAvatarStateForPresence(state)}
                                  label={bot.name}
                                />
                                <span className="office-desk" aria-hidden="true" />
                                {!RESTING.has(state) && state !== "queued" ? (
                                  <span className="office-tool-prop" aria-hidden="true">
                                    <span>
                                      {zone.id === "development"
                                        ? ">_"
                                        : zone.id === "research"
                                          ? "⌕"
                                          : zone.id === "review"
                                            ? "⊙"
                                            : zone.id === "collaboration"
                                              ? "↔"
                                              : "≡"}
                                    </span>
                                    <i />
                                    <i />
                                    <i />
                                  </span>
                                ) : null}
                                {state === "complete" ? (
                                  <span className="office-result" aria-hidden="true">
                                    ✓
                                  </span>
                                ) : null}
                                {zone.id === "help" ? (
                                  <span className="office-attention" aria-hidden="true">
                                    !
                                  </span>
                                ) : null}
                              </div>
                              <div className="min-w-0 flex-1">
                                <h4 className="break-words font-semibold text-sm">{bot.name}</h4>
                                <p className="mt-1 break-words text-xs text-[#A7B5AD]">
                                  {bot.title || "Your bot"}
                                </p>
                                <p
                                  className="mt-3 text-xs capitalize"
                                  style={{ color: zone.accent }}
                                >
                                  {state.replaceAll("_", " ")}
                                </p>
                              </div>
                            </button>
                            <p className="mt-2 min-h-10 text-xs leading-5 text-[#CAD7D0]">
                              {presence?.summary ??
                                (bot.status === "idle"
                                  ? "Available for a new task"
                                  : "Activity details unavailable")}
                            </p>
                            <p
                              className="mt-2 truncate text-[11px] text-[#97AAA0]"
                              title={presence?.modelId ?? undefined}
                            >
                              {presence?.modelId
                                ? `${presence.modelProvider ?? "Model"} / ${presence.modelId}`
                                : "Model selected when a run starts"}
                            </p>
                            {presence?.startedAt && !RESTING.has(state) ? (
                              <p className="mt-1 text-[11px] text-[#97AAA0]">
                                Started{" "}
                                <time dateTime={presence.startedAt}>
                                  {new Date(presence.startedAt).toLocaleTimeString()}
                                </time>
                              </p>
                            ) : null}
                            {currentTask ? (
                              <p className="mt-2 line-clamp-2 break-words text-xs text-[#A7B5AD]">
                                {currentTask.prompt}
                              </p>
                            ) : null}
                            <div className="mt-4 flex flex-wrap gap-2">
                              {presence?.taskId ? (
                                <button
                                  type="button"
                                  aria-label={`Inspect ${bot.name} task`}
                                  className="office-action office-primary"
                                  onClick={() => inspect(presence.taskId as string)}
                                >
                                  Inspect task
                                </button>
                              ) : null}
                              <button
                                type="button"
                                className="office-action"
                                onClick={() => onOpenWorkbench(bot.id)}
                              >
                                Workbench
                              </button>
                              {onSteer ? (
                                <button
                                  type="button"
                                  className="office-action"
                                  onClick={() => onSteer(bot.id)}
                                >
                                  Steer
                                </button>
                              ) : null}
                              <button
                                type="button"
                                className="office-action"
                                onClick={() => onCustomize(bot.id)}
                              >
                                Customize look
                              </button>
                            </div>
                          </article>
                        );
                      })}
                      {zone.bots.length === 0 ? (
                        <p className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-center text-xs text-[#91A298] sm:col-span-2">
                          Quiet here. Bots arrive when their actual work belongs at this station.
                        </p>
                      ) : null}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </>
        )}
      </div>
      <footer className="border-t border-white/10 bg-[#0E1517] px-5 py-3 text-[11px] text-[#93A69B] sm:px-8">
        Stations follow runtime activity · Inspect tasks for ownership, handoffs and artifacts · No
        model calls for animation
      </footer>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-16 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-center">
      <div className="font-semibold text-[#D3F7AA]">{value}</div>
      <div className="text-[10px] text-[#9EAAA2]">{label}</div>
    </div>
  );
}
