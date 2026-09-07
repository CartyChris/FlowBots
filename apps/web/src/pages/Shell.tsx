import { ChatMarkdown } from "@rakazo/chat-ui/web";
import type {
  Bot,
  ComputerStatus,
  GroupChatSummary,
  ProductEvent,
  Routine,
  ThreadMessage,
  ThreadSnapshot,
} from "@rakazo/contracts";
import {
  abortableDelay,
  applyBotRoleInstructions,
  BOT_ROLE_PRESETS,
  type BotRolePreset,
  botRoleSelection,
  cronFromPreset,
  defaultCronPreset,
  formatCron,
  presetFromCron,
} from "@rakazo/core";
import {
  BOT_AVATAR_FACE_CHOICES,
  BotAvatar,
  type BotAvatarState,
  Button,
  botAvatarStateForPresence,
  botWorkStateForTool,
  type SemanticBotWorkState,
} from "@rakazo/ui-web";
import { type Dispatch, type SetStateAction, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { authClient } from "../lib/auth";
import { rpc } from "../lib/rpc";
import {
  mergeThreadSnapshot,
  prependThreadMessagePage,
  reduceComputerStatus,
  reduceThreadSnapshot,
} from "../lib/thread-events";
import { ComposerActions } from "./ComposerActions";
import { GroupChatEditor } from "./GroupChatEditor";
import { HarnessesOverlay } from "./HarnessesOverlay";
import { HostComputerPrompt } from "./HostComputerPrompt";
import { McpOverlay } from "./McpOverlay";
import { MessageReactions } from "./MessageReactions";
import { ModelSettingsOverlay } from "./ModelSettingsOverlay";
import { PluginsOverlay } from "./PluginsOverlay";
import { RoutineSchedule } from "./RoutineSchedule";
import { VoiceControls } from "./VoiceControls";
import { WindowChrome } from "./WindowChrome";

type Panel = "computer" | "settings" | "routine" | "create" | null;

export function ShellPage() {
  const { botId } = useParams();
  const navigate = useNavigate();
  const session = authClient.useSession();
  const [bots, setBots] = useState<Bot[]>([]);
  const [groups, setGroups] = useState<GroupChatSummary[]>([]);
  const [groupEditorOpen, setGroupEditorOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [snapshot, setSnapshot] = useState<ThreadSnapshot | null>(null);
  const [draft, setDraft] = useState("");
  const [panel, setPanel] = useState<Panel>(null);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [routinesBotId, setRoutinesBotId] = useState<string | null>(null);
  const [computer, setComputer] = useState<ComputerStatus | null>(null);
  const [pluginsOpen, setPluginsOpen] = useState(false);
  const [modelsOpen, setModelsOpen] = useState(false);
  const [mcpOpen, setMcpOpen] = useState(false);
  const [harnessesOpen, setHarnessesOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [booting, setBooting] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [activeWorkState, setActiveWorkState] = useState<SemanticBotWorkState | null>(null);
  const workStateTimer = useRef<number | null>(null);
  const [routineDraft, setRoutineDraft] = useState({
    name: "",
    prompt: "",
    schedule: defaultCronPreset(),
  });
  const [editingRoutine, setEditingRoutine] = useState<Routine | null>(null);
  const [deleteRoutineTarget, setDeleteRoutineTarget] = useState<Routine | null>(null);
  const [savingRoutine, setSavingRoutine] = useState(false);
  const [screenUrl, setScreenUrl] = useState<string | null>(null);
  const [computerOpen, setComputerOpen] = useState(false);
  const [usage, setUsage] = useState<{
    inputTokens: number;
    outputTokens: number;
    runs: number;
  } | null>(null);
  const autoBooted = useRef<string | null>(null);
  const expandedHistoryThread = useRef<string | null>(null);
  const messageScroll = useRef<HTMLDivElement>(null);

  const routeBotIdRef = useRef<string | undefined>(botId);
  routeBotIdRef.current = botId;
  const active = bots.find((b) => b.id === botId) ?? bots[0];
  const activeBotIdRef = useRef<string | undefined>(active?.id);
  activeBotIdRef.current = active?.id;
  const activeRoutines = routinesBotId === active?.id ? routines : [];
  const latestBotReply = latestThreadBotReply(snapshot?.messages ?? []);

  async function refreshBots() {
    const [list, nextGroups] = await Promise.all([rpc.bots.list(), rpc.groupChats.list()]);
    setBots(list);
    setGroups(nextGroups);
    if (list.length === 0) {
      navigate("/onboarding", { replace: true });
      return;
    }
    const selectedBotId = routeBotIdRef.current;
    if (!selectedBotId || !list.some((bot) => bot.id === selectedBotId)) {
      navigate(`/app/${list[0]!.id}`, { replace: true });
    }
  }

  async function refreshThread(id: string) {
    const scrollElement = messageScroll.current;
    const stickToEnd =
      !scrollElement ||
      scrollElement.scrollHeight - scrollElement.scrollTop - scrollElement.clientHeight < 80;
    const [snap, nextRoutines] = await Promise.all([
      rpc.threads.get({ botId: id }),
      rpc.routines.list({ botId: id }),
    ]);
    if (activeBotIdRef.current !== id) return snap;
    setSnapshot((prev) =>
      mergeThreadSnapshot(prev, snap, expandedHistoryThread.current === snap.threadId),
    );
    setComputer(snap.computer);
    setRoutines(nextRoutines);
    setRoutinesBotId(id);
    if (panel === "computer" || computerOpen) {
      const screen = await rpc.computer.screenUrl({ botId: id }).catch(() => ({ url: null }));
      if (activeBotIdRef.current === id) setScreenUrl(screen.url);
    }
    if (stickToEnd) {
      window.requestAnimationFrame(() => {
        const element = messageScroll.current;
        if (element) element.scrollTop = element.scrollHeight;
      });
    }
    return snap;
  }

  async function loadOlderMessages() {
    if (!active || snapshot?.olderCursor == null || loadingOlder) return;
    const scrollElement = messageScroll.current;
    const previousHeight = scrollElement?.scrollHeight ?? 0;
    setLoadingOlder(true);
    try {
      const page = await rpc.threads.messages({
        botId: active.id,
        before: snapshot.olderCursor,
      });
      expandedHistoryThread.current = page.threadId;
      setSnapshot((prev) => prependThreadMessagePage(prev, page));
      window.requestAnimationFrame(() => {
        const element = messageScroll.current;
        if (element) element.scrollTop += element.scrollHeight - previousHeight;
      });
    } finally {
      setLoadingOlder(false);
    }
  }

  useEffect(() => {
    void refreshBots();
    const poll = window.setInterval(() => void refreshBots().catch(() => undefined), 4000);
    return () => window.clearInterval(poll);
  }, []);

  useEffect(() => {
    if (!active) return;
    expandedHistoryThread.current = null;
    const abort = new AbortController();
    void (async () => {
      const snap = await refreshThread(active.id).catch(() => null);
      if (abort.signal.aborted) return;
      let cursor = snap?.cursor ?? -1;
      let retryMs = 250;
      while (!abort.signal.aborted) {
        try {
          const events = await rpc.threads.subscribe(
            { botId: active.id, cursor },
            { signal: abort.signal },
          );
          for await (const event of events) {
            if (abort.signal.aborted) break;
            cursor = Math.max(cursor, event.seq);
            retryMs = 250;
            if (event.type === "agent.tool.called") {
              const toolName = String(event.payload.name ?? "");
              const semantic = botWorkStateForTool(toolName);
              if (semantic) {
                if (workStateTimer.current != null) window.clearTimeout(workStateTimer.current);
                setActiveWorkState(semantic);
                workStateTimer.current = window.setTimeout(() => {
                  setActiveWorkState(null);
                  workStateTimer.current = null;
                }, 3_200);
              }
            }
            if (event.type === "run.completed") {
              if (workStateTimer.current != null) window.clearTimeout(workStateTimer.current);
              workStateTimer.current = null;
              setActiveWorkState(null);
            }
            applyThreadEvent(event, setSnapshot, setComputer);
            if (
              event.type === "bot.spawned" ||
              event.type === "bot.deleted" ||
              event.type === "run.completed"
            ) {
              void refreshBots().catch(() => undefined);
            }
            if (event.type === "thread.message.created") {
              const blocks = (event.payload.blocks as Array<{ kind?: string }>) ?? [];
              if (blocks.some((block) => block.kind === "child_bot")) {
                void refreshBots().catch(() => undefined);
              }
            }
            if (
              event.type === "run.completed" ||
              event.type === "computer.status" ||
              event.type === "computer.takeover.granted"
            ) {
              void refreshThread(active.id).catch(() => undefined);
            }
          }
        } catch {
          // The durable cursor below makes reconnects safe after a transient network failure.
        }
        if (abort.signal.aborted) break;
        await refreshThread(active.id).catch(() => null);
        await abortableDelay(retryMs, abort.signal);
        retryMs = Math.min(retryMs * 2, 5_000);
      }
    })();
    return () => {
      abort.abort();
      if (workStateTimer.current != null) window.clearTimeout(workStateTimer.current);
      workStateTimer.current = null;
      setActiveWorkState(null);
    };
  }, [active?.id]);

  const filtered = useMemo(
    () => bots.filter((b) => `${b.name} ${b.preview}`.toLowerCase().includes(query.toLowerCase())),
    [bots, query],
  );

  async function send() {
    if (!active || !draft.trim()) return;
    const text = draft;
    setDraft("");
    await rpc.threads.send({ botId: active.id, text });
    await refreshThread(active.id);
  }

  async function createGroup(input: { name: string; botIds: string[] }) {
    const room = await rpc.groupChats.create(input);
    setGroupEditorOpen(false);
    navigate(`/groups/${room.id}`);
  }

  async function createBot(input: { name: string; title: string; description: string }) {
    const bot = await rpc.bots.create({
      name: input.name.trim(),
      title: input.title,
      description: input.description,
      instructions: input.description,
      notifyOnFinish: true,
    });
    await refreshBots();
    navigate(`/app/${bot.id}`);
    setPanel(null);
  }

  async function bootComputer({
    takeControl,
    overlay,
    force = false,
  }: {
    takeControl: boolean;
    overlay: boolean;
    force?: boolean;
  }) {
    if (!active) return;
    const needsBoot = force || computer?.state !== "running" || !screenUrl;
    if (overlay && needsBoot) setBooting(true);
    try {
      if (needsBoot) await rpc.computer.boot({ botId: active.id });
      if (takeControl) await rpc.computer.takeover({ botId: active.id });
      await refreshThread(active.id);
    } finally {
      setBooting(false);
    }
  }

  useEffect(() => {
    if (panel !== "computer") {
      autoBooted.current = null;
      return;
    }
    if (!active) return;
    if (computer?.state === "booting" || computer?.state === "suspended") return;
    if (autoBooted.current === active.id && computer?.state === "running" && screenUrl) return;
    autoBooted.current = active.id;
    void bootComputer({
      takeControl: false,
      overlay: computer?.state !== "running",
      force: true,
    });
  }, [panel, active?.id, computer?.state, screenUrl]);

  useEffect(() => {
    setComputerOpen(false);
    setEditingRoutine(null);
    setDeleteRoutineTarget(null);
    setPanel((current) => (current === "routine" ? null : current));
  }, [active?.id]);

  useEffect(() => {
    if (!computerOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setComputerOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [computerOpen]);

  useEffect(() => {
    if ((panel !== "computer" && !computerOpen) || !active || computer?.state !== "running") return;
    const ping = () => void rpc.computer.heartbeat({ botId: active.id }).catch(() => undefined);
    ping();
    const timer = window.setInterval(ping, 60_000);
    return () => window.clearInterval(timer);
  }, [panel, computerOpen, active?.id, computer?.state]);

  async function openComputer() {
    if (!active) return;
    const needsTakeover = computer?.controlHolder !== "user";
    await bootComputer({
      takeControl: needsTakeover,
      overlay: needsTakeover || computer?.state !== "running",
      force: computer?.state !== "running",
    });
    setComputerOpen(true);
  }

  async function releaseComputer() {
    if (!active) return;
    setComputerOpen(false);
    await rpc.computer.release({ botId: active.id }).catch(() => undefined);
    await refreshThread(active.id);
  }

  const embeddedScreenUrl = embeddableScreenUrl(screenUrl);

  async function addWebFilesToDraft(files: FileList) {
    const contexts = await Promise.all(
      Array.from(files)
        .slice(0, 6)
        .map(async (file) => {
          const textLike =
            file.type.startsWith("text/") ||
            /\.(md|txt|json|ya?ml|toml|csv|ts|tsx|js|jsx|py|rs|go|java|c|cpp|h|html|css)$/i.test(
              file.name,
            );
          if (!textLike) return `File: ${file.name} (${file.size} bytes; binary)`;
          const body = (await file.text()).slice(0, 50_000);
          return `File: ${file.name}\n${body}`;
        }),
    );
    setDraft((current) => [current.trim(), ...contexts].filter(Boolean).join("\n\n"));
  }

  const userName = session.data?.user.name ?? "You";
  const initials = userName
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="relative flex h-full min-w-0 overflow-hidden bg-[#050506] text-[#DFDFE2]">
      <HostComputerPrompt />
      {groupEditorOpen ? (
        <GroupChatEditor
          bots={bots}
          mode="create"
          onSave={createGroup}
          onClose={() => setGroupEditorOpen(false)}
        />
      ) : null}
      <aside className="flex w-[316px] shrink-0 flex-col border-r border-[#171719] bg-[#0B0B0C]">
        <div className="app-drag flex items-center justify-between px-[18px] pb-3 pt-4">
          <WindowChrome />
          <button
            type="button"
            onClick={() => setPanel("create")}
            className="app-no-drag text-[21px] text-[#7A7A80] hover:text-[#C9C9CE]"
            title="New bot"
          >
            +
          </button>
        </div>
        <div className="mx-3.5 mb-3 flex items-center gap-2.5 rounded-xl border border-[#202023] bg-[#141416] px-3 py-2 text-[14px] text-[#6C6C70]">
          <span>⌕</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search"
            className="w-full bg-transparent outline-none"
          />
        </div>
        <div className="mx-3.5 mb-2 flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#55555A]">
            Group chats
          </span>
          <button
            type="button"
            aria-label="New group chat"
            onClick={() => setGroupEditorOpen(true)}
            className="rounded-lg px-2 py-1 text-[12px] text-[#818187] hover:bg-white/5 hover:text-white"
          >
            + Group
          </button>
        </div>
        {groups.length ? (
          <div className="mx-2.5 mb-2 space-y-0.5">
            {groups.slice(0, 6).map((group) => (
              <button
                key={group.id}
                type="button"
                aria-label={group.name}
                onClick={() => navigate(`/groups/${group.id}`)}
                className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left hover:bg-[#141416]"
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#171719] text-[11px] text-[#A7A7AC]">
                  {group.members.length}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-[#D8D8DC]">
                    {group.name}
                  </span>
                  <span className="block truncate text-[10.5px] text-[#66666C]">
                    {group.activeCount
                      ? `${group.activeCount} working`
                      : group.preview || "Shared room"}
                  </span>
                </span>
              </button>
            ))}
          </div>
        ) : null}
        <div className="mx-3.5 mb-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-[#55555A]">
          Direct chats
        </div>
        <div className="rk-scroll flex flex-1 flex-col gap-0.5 overflow-y-auto px-2.5 pb-2.5">
          {filtered.map((bot) => (
            <button
              key={bot.id}
              type="button"
              onClick={() => navigate(`/app/${bot.id}`)}
              className="flex gap-3 rounded-xl px-2.5 py-[11px] text-left"
              style={{
                background: active?.id === bot.id ? "#161618" : "transparent",
              }}
            >
              <BotAvatar
                color={bot.color}
                size={38}
                state={
                  bot.presence
                    ? botAvatarStateForPresence(bot.presence.state)
                    : bot.id === active?.id && activeWorkState
                      ? activeWorkState
                      : avatarStateFor(bot.status)
                }
                label={bot.name}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[15px] font-medium text-[#ECECEE]">{bot.name}</span>
                  <span className="shrink-0 text-[12.5px] text-[#6C6C70]">
                    {bot.status === "idle" ? "" : bot.status}
                  </span>
                </div>
                <div className="mt-0.5 truncate text-[13.5px] text-[#85858A]">
                  {bot.preview || bot.title}
                </div>
              </div>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setPluginsOpen(true)}
          className="mx-3 mb-1 flex items-center gap-3 rounded-[11px] px-2.5 py-2 hover:bg-[#131315]"
        >
          <span className="grid h-[30px] w-[30px] place-items-center rounded-full bg-[#17171A] text-[#9A9AA0]">
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M4 7h3a1 1 0 0 0 1-1 1.5 1.5 0 1 1 3 0 1 1 0 0 0 1 1h3v3a1 1 0 0 0 1 1 1.5 1.5 0 1 1 0 3 1 1 0 0 0-1 1v3h-3a1 1 0 0 0-1 1 1.5 1.5 0 1 1-3 0 1 1 0 0 0-1-1H4v-3a1 1 0 0 0-1-1 1.5 1.5 0 1 1 0-3 1 1 0 0 0 1-1z" />
            </svg>
          </span>
          <span className="text-[14.5px] text-[#C9C9CE]">Plugins</span>
        </button>
        <button
          type="button"
          aria-label="Models"
          onClick={() => setModelsOpen(true)}
          className="mx-3 mb-1 flex items-center gap-3 rounded-[11px] px-2.5 py-2 hover:bg-[#131315]"
        >
          <span className="grid h-[30px] w-[30px] place-items-center rounded-full bg-[#17171A] text-[14px] text-[#9A9AA0]">
            ◉
          </span>
          <span className="text-[14.5px] text-[#C9C9CE]">Models</span>
        </button>
        <button
          type="button"
          onClick={() => setHarnessesOpen(true)}
          className="mx-3 mb-1 flex items-center gap-3 rounded-[11px] px-2.5 py-2 hover:bg-[#131315]"
        >
          <span className="grid h-[30px] w-[30px] place-items-center rounded-full bg-[#17171A] text-[14px] text-[#9A9AA0]">
            ⌘
          </span>
          <span className="text-[14.5px] text-[#C9C9CE]">Harnesses</span>
        </button>
        <div className="relative">
          {menuOpen ? (
            <div className="absolute bottom-14 left-3 right-3 rounded-2xl border border-[#2A2A2F] bg-[#1A1A1D] p-2 shadow-[0_22px_50px_rgba(0,0,0,.55)]">
              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-[11px] px-3 py-2.5 hover:bg-[#232327]"
                onClick={() => {
                  setMenuOpen(false);
                  setModelsOpen(true);
                }}
              >
                <span className="text-[#9A9AA0]">◉</span>
                <span className="flex-1 text-left text-[14.5px] text-[#ECECEE]">Models</span>
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-[11px] px-3 py-2.5 hover:bg-[#232327]"
                onClick={async () => {
                  setUsage(await rpc.usage.summary());
                }}
              >
                <span className="text-[#9A9AA0]">◔</span>
                <span className="flex-1 text-left text-[14.5px] text-[#ECECEE]">Weekly usage</span>
              </button>
              {usage ? (
                <p className="px-3 pb-2 text-[12.5px] text-[#85858A]">
                  {usage.runs} runs · {usage.inputTokens + usage.outputTokens} tokens
                </p>
              ) : null}
              <button
                type="button"
                onClick={() => void authClient.signOut().then(() => navigate("/"))}
                className="flex w-full items-center gap-3 rounded-[11px] px-3 py-2.5 hover:bg-[#232327]"
              >
                <span className="text-[#9A9AA0]">⇤</span>
                <span className="text-[14.5px] text-[#ECECEE]">Log out</span>
              </button>
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-[11px] px-[18px] py-3.5"
          >
            <span className="grid h-8 w-8 place-items-center rounded-full bg-[#232326] text-[12px] text-[#A8A8AD]">
              {initials}
            </span>
            <span className="text-[14.5px] text-[#C9C9CE]">{userName}</span>
          </button>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col bg-[#0D0D0E]">
        <div className="flex items-center justify-between border-b border-[#141416] px-[22px] py-[17px]">
          <button
            type="button"
            onClick={() => setPanel("settings")}
            className="flex min-w-0 items-center gap-3"
          >
            {active ? (
              <BotAvatar
                color={active.color}
                size={26}
                state={
                  active.presence
                    ? botAvatarStateForPresence(active.presence.state)
                    : (activeWorkState ?? avatarStateFor(snapshot?.run?.status ?? active.status))
                }
                label={active.name}
              />
            ) : null}
            <span className="min-w-0">
              <span className="block truncate text-[16px] font-medium text-[#ECECEE]">
                {active?.name ?? "Select a bot"}
              </span>
            </span>
          </button>
          <button
            type="button"
            title="Agent computer"
            onClick={() => setPanel((p) => (p === "computer" ? null : "computer"))}
            className="grid h-[30px] w-[34px] place-items-center rounded-[9px] hover:bg-[#1B1B1E]"
            style={{ background: panel ? "#1B1B1E" : "transparent" }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#A8A8AD"
              strokeWidth="1.6"
            >
              <rect x="2" y="4" width="20" height="13" rx="2" />
              <path d="M8 21h8M12 17v4" />
            </svg>
          </button>
        </div>
        <div
          ref={messageScroll}
          className="rk-scroll flex flex-1 flex-col gap-[13px] overflow-y-auto px-7 py-6"
        >
          {snapshot?.olderCursor != null ? (
            <button
              type="button"
              disabled={loadingOlder}
              onClick={() => void loadOlderMessages()}
              className="self-center rounded-lg px-3 py-1.5 text-[13px] text-[#85858A] hover:bg-[#1A1A1D] hover:text-[#C9C9CE] disabled:opacity-50"
            >
              {loadingOlder ? "Loading…" : "Load earlier messages"}
            </button>
          ) : null}
          {(snapshot?.messages ?? []).map((message) => (
            <MessageView
              key={message.id}
              message={message}
              onOpenBot={(id) => navigate(`/app/${id}`)}
              onAnswer={(text) =>
                active &&
                rpc.threads.answer({ botId: active.id, runId: message.runId ?? "", answer: text })
              }
            />
          ))}
          {snapshot?.run && ["running", "queued", "leased"].includes(snapshot.run.status) ? (
            <div className="flex justify-start">
              <div
                className="rounded-[20px] bg-[#1A1A1D] px-[18px] py-[13px] text-[14.5px] text-[#85858A]"
                style={{ animation: "rkPulse 1.2s ease-in-out infinite" }}
              >
                {active?.presence?.summary ??
                  (activeWorkState ? `${activeWorkState}…` : "working…")}
              </div>
            </div>
          ) : null}
        </div>
        <div className="px-6 pb-6 pt-3">
          <div className="flex items-center gap-3.5 rounded-full border border-[#202023] bg-[#131315] py-[9px] pr-2.5 pl-3">
            <ComposerActions
              onSelectedPaths={({ kind, paths }) => {
                const label = kind === "workspace" ? "Workspace" : "Files";
                const context = `${label}: ${paths.map((item) => `${item.name} (${item.path})`).join(", ")}`;
                setDraft((current) => [current.trim(), context].filter(Boolean).join("\n\n"));
              }}
              onWebFiles={(files) => void addWebFilesToDraft(files)}
              onComputer={() => setPanel("computer")}
              onConnections={() => setPluginsOpen(true)}
              onMcp={() => setMcpOpen(true)}
              onHarnesses={() => setHarnessesOpen(true)}
              onTeammate={() =>
                setDraft((current) =>
                  [current.trim(), "Ask a teammate bot to "].filter(Boolean).join("\n\n"),
                )
              }
            />
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              placeholder={active ? `Message ${active.name}` : "Message…"}
              className="flex-1 bg-transparent text-[15.5px] text-[#E9E9EA] outline-none"
            />
            <VoiceControls
              scopeKey={active?.id ?? "no-active-bot"}
              onTranscript={(text) =>
                setDraft((current) => `${current}${current.trim() ? " " : ""}${text}`)
              }
              latestReply={latestBotReply}
            />
            {snapshot?.run && ["running", "queued", "leased"].includes(snapshot.run.status) ? (
              <button
                type="button"
                aria-label="Stop"
                onClick={() =>
                  active &&
                  void rpc.threads.stop({ botId: active.id }).then(() => refreshThread(active.id))
                }
                className="grid h-9 w-9 place-items-center rounded-full bg-[#F1F1EF] text-[#17171A]"
              >
                ■
              </button>
            ) : (
              <button
                type="button"
                aria-label="Send"
                onClick={() => void send()}
                className="grid h-9 w-9 place-items-center rounded-full bg-[#F1F1EF] text-[#17171A]"
              >
                ↑
              </button>
            )}
          </div>
        </div>
      </main>

      <aside
        className={`flex h-full min-h-0 shrink-0 flex-col overflow-hidden bg-[#0A0A0B] transition-[width] duration-200 ease-out ${
          panel && active ? "w-[384px] border-l border-[#141416]" : "w-0"
        }`}
      >
        {panel && active ? (
          <div className="rk-scroll h-full w-[384px] overflow-y-auto px-5 py-[17px]">
            {panel !== "routine" && panel !== "create" ? (
              <div className="mb-4 flex items-center justify-between">
                <span className="text-[13.5px] text-[#85858A]">
                  {computer?.state ?? active.status}
                </span>
                <div className="flex gap-3.5">
                  <button type="button" onClick={() => setPanel("settings")}>
                    ⚙
                  </button>
                  <button type="button" onClick={() => setPanel(null)}>
                    ✕
                  </button>
                </div>
              </div>
            ) : null}
            {panel === "computer" ? (
              <div>
                <div className="relative aspect-[16/10] overflow-hidden rounded-[14px] bg-[#0E0E10]">
                  {computerOpen ? (
                    <div className="grid h-full place-items-center text-sm text-[#6C6C70]">
                      Open in full window
                    </div>
                  ) : computer?.kind === "desktop" ? (
                    <div className="grid h-full place-items-center px-6 text-center text-sm text-[#6C6C70]">
                      This bot runs on this computer, not a Linux desktop. Shell and files use your
                      home folder.
                    </div>
                  ) : computer?.state === "running" && embeddedScreenUrl ? (
                    <iframe
                      title="Bot screen preview"
                      src={embeddedScreenUrl}
                      sandbox={screenIframeSandbox(embeddedScreenUrl)}
                      className="h-full w-full border-0 bg-black"
                      allow="clipboard-read; clipboard-write"
                      style={{ pointerEvents: "none" }}
                    />
                  ) : (
                    <div className="grid h-full place-items-center text-sm text-[#6C6C70]">
                      {computerPlaceholder(computer?.state, booting, active.name)}
                    </div>
                  )}
                  <button
                    type="button"
                    className="absolute inset-0 cursor-pointer"
                    aria-label="Open computer"
                    onClick={() => void openComputer()}
                  />
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-[13.5px] text-[#85858A]">
                    {computer?.controlHolder === "user"
                      ? "You have control"
                      : computer?.state === "suspended"
                        ? "Asleep"
                        : `${active.name}’s screen`}
                  </span>
                  {computer?.controlHolder === "user" ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void releaseComputer()}
                    >
                      Release
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void openComputer()}
                    >
                      Take control
                    </Button>
                  )}
                </div>
                <div className="mt-[30px] mb-3 text-[14px] text-[#85858A]">Routines</div>
                {activeRoutines.map((routine) => (
                  <button
                    key={routine.id}
                    type="button"
                    onClick={() => {
                      setRoutineDraft({
                        name: routine.name,
                        prompt: routine.prompt,
                        schedule: presetFromCron(routine.cron),
                      });
                      setEditingRoutine(routine);
                      setDeleteRoutineTarget(null);
                      setPanel("routine");
                    }}
                    className="flex w-full items-center gap-3 rounded-[11px] px-2.5 py-2.5 hover:bg-[#121214]"
                  >
                    <span className="text-[#E65707]">◷</span>
                    <span className="flex-1 text-left text-[14.5px] text-[#ECECEE]">
                      {routine.name}
                    </span>
                    <span className="text-[13px] text-[#6C6C70]">{formatCron(routine.cron)}</span>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={async () => {
                    const first = activeRoutines[0];
                    if (first) {
                      await rpc.routines.testRun({ routineId: first.id });
                      await refreshThread(active.id);
                    } else {
                      setRoutineDraft({ name: "", prompt: "", schedule: defaultCronPreset() });
                      setEditingRoutine(null);
                      setDeleteRoutineTarget(null);
                      setPanel("routine");
                    }
                  }}
                  className="mt-1 flex items-center gap-2.5 px-2.5 py-2.5 text-[14.5px] text-[#7A7A80]"
                >
                  Run now
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRoutineDraft({ name: "", prompt: "", schedule: defaultCronPreset() });
                    setEditingRoutine(null);
                    setDeleteRoutineTarget(null);
                    setPanel("routine");
                  }}
                  className="mt-1 flex items-center gap-2.5 px-2.5 py-2.5 text-[14.5px] text-[#7A7A80]"
                >
                  + New routine
                </button>
              </div>
            ) : null}
            {panel === "create" ? (
              <CreateBotForm
                onCancel={() => setPanel(null)}
                onCreate={(input) => void createBot(input)}
              />
            ) : null}
            {panel === "settings" ? (
              <BotSettings
                key={active.id}
                bot={active}
                onSave={async (patch) => {
                  await rpc.bots.update({ botId: active.id, ...patch });
                  await refreshBots();
                }}
                onExport={async () => {
                  const manifest = await rpc.export.bot({ botId: active.id });
                  const blob = new Blob([JSON.stringify(manifest, null, 2)], {
                    type: "application/json",
                  });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `${active.name.toLowerCase().replace(/\s+/g, "-")}-export.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                onDelete={async () => {
                  await rpc.bots.remove({ botId: active.id });
                  setPanel(null);
                  await refreshBots();
                }}
              />
            ) : null}
            {panel === "routine" ? (
              <div>
                <div className="mb-5 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setPanel("computer")}
                    className="text-[#9A9AA0]"
                  >
                    ‹
                  </button>
                  <div className="text-[15.5px] font-medium text-[#F1F1F2]">Routine</div>
                  <button type="button" onClick={() => setPanel(null)} className="text-[#6C6C70]">
                    ✕
                  </button>
                </div>
                <label className="text-[14px] text-[#85858A]">
                  Name
                  <input
                    value={routineDraft.name}
                    onChange={(e) => setRoutineDraft((s) => ({ ...s, name: e.target.value }))}
                    className="mt-2 w-full rounded-[11px] border border-[#26262A] bg-transparent px-3.5 py-3 text-[#ECECEE]"
                  />
                </label>
                <label className="mt-5 block text-[14px] text-[#85858A]">
                  Instruction
                  <textarea
                    value={routineDraft.prompt}
                    onChange={(e) => setRoutineDraft((s) => ({ ...s, prompt: e.target.value }))}
                    rows={4}
                    className="mt-2 w-full rounded-[11px] border border-[#26262A] bg-transparent px-3.5 py-3 text-[#ECECEE]"
                  />
                </label>
                <div className="mt-5 text-[14px] text-[#85858A]">
                  When to run
                  <RoutineSchedule
                    value={routineDraft.schedule}
                    onChange={(schedule) => setRoutineDraft((s) => ({ ...s, schedule }))}
                  />
                </div>
                <div className="mt-5 flex items-center gap-3">
                  <button
                    type="button"
                    disabled={savingRoutine}
                    onClick={async () => {
                      const activeId = active.id;
                      const editing = editingRoutine;
                      if (editing && editing.botId !== activeId) return;
                      setSavingRoutine(true);
                      try {
                        if (editing) {
                          await rpc.routines.update({
                            routineId: editing.id,
                            name: routineDraft.name || "Routine",
                            prompt: routineDraft.prompt || "Check in.",
                            cron: cronFromPreset(routineDraft.schedule),
                            timezone: editing.timezone,
                            active: editing.active,
                            notify: editing.notify,
                          });
                        } else {
                          await rpc.routines.create({
                            botId: activeId,
                            name: routineDraft.name || "Routine",
                            prompt: routineDraft.prompt || "Check in.",
                            cron: cronFromPreset(routineDraft.schedule),
                            timezone: "UTC",
                            active: true,
                            notify: true,
                          });
                        }
                        if (activeBotIdRef.current !== activeId) return;
                        await refreshThread(activeId);
                        setEditingRoutine(null);
                        setDeleteRoutineTarget(null);
                        setPanel("computer");
                      } finally {
                        setSavingRoutine(false);
                      }
                    }}
                    className="rounded-[11px] bg-[#F1F1EF] px-4 py-2 text-[#17171A] disabled:opacity-50"
                  >
                    {savingRoutine ? "Saving…" : "Save"}
                  </button>
                  {editingRoutine ? (
                    <button
                      type="button"
                      disabled={savingRoutine}
                      onClick={() => setDeleteRoutineTarget(editingRoutine)}
                      className="text-[14px] text-[#E65707] disabled:opacity-50"
                    >
                      Delete routine
                    </button>
                  ) : null}
                </div>
                {deleteRoutineTarget ? (
                  <div
                    role="alertdialog"
                    aria-label={`Delete ${deleteRoutineTarget.name}?`}
                    className="mt-4 rounded-[12px] border border-[#3A1F14] bg-[#1A100C] p-4"
                  >
                    <p className="text-[13.5px] text-[#C9C9CE]">
                      Delete {deleteRoutineTarget.name}? This removes the schedule permanently.
                    </p>
                    <div className="mt-3 flex gap-3">
                      <button
                        type="button"
                        onClick={() => setDeleteRoutineTarget(null)}
                        className="text-[14px] text-[#85858A]"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          const target = deleteRoutineTarget;
                          const activeId = active.id;
                          if (!target || target.botId !== activeId) return;
                          await rpc.routines.remove({ routineId: target.id });
                          if (activeBotIdRef.current !== activeId) return;
                          await refreshThread(activeId);
                          setEditingRoutine(null);
                          setDeleteRoutineTarget(null);
                          setPanel("computer");
                        }}
                        className="rounded-[9px] bg-[#E65707] px-3 py-1.5 text-[14px] text-white"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </aside>

      {pluginsOpen ? <PluginsOverlay onClose={() => setPluginsOpen(false)} /> : null}
      {modelsOpen ? <ModelSettingsOverlay onClose={() => setModelsOpen(false)} /> : null}
      {mcpOpen ? <McpOverlay onClose={() => setMcpOpen(false)} /> : null}
      {harnessesOpen ? <HarnessesOverlay onClose={() => setHarnessesOpen(false)} /> : null}

      {booting ? (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-[22px] bg-[rgba(4,4,5,.96)]">
          <div className="text-[19px] font-medium text-[#F1F1F2]">
            Booting up {active?.name}’s computer
          </div>
          <div className="h-[5px] w-[min(420px,70%)] overflow-hidden rounded-full bg-[#232327]">
            <div className="h-full w-2/3 rounded-full bg-[#F1F1EF]" />
          </div>
        </div>
      ) : computerOpen && active ? (
        <div className="absolute inset-0 z-30 flex flex-col bg-[#050506]">
          <div className="flex items-center justify-between gap-4 border-b border-[#171719] px-[18px] py-3.5">
            <div className="flex min-w-0 items-center gap-3">
              <BotAvatar
                color={active.color}
                size={28}
                state={
                  active.presence
                    ? botAvatarStateForPresence(active.presence.state)
                    : (activeWorkState ?? avatarStateFor(snapshot?.run?.status ?? active.status))
                }
                label={active.name}
              />
              <span className="truncate text-[15.5px] font-medium text-[#ECECEE]">
                {active.name}’s computer
              </span>
              {computer?.controlHolder === "user" ? (
                <span className="rounded-full bg-[rgba(48,162,75,.14)] px-[11px] py-1 text-[13px] text-[#4ECB71]">
                  You have control
                </span>
              ) : null}
            </div>
            <div className="flex items-center gap-3">
              {computer?.controlHolder === "user" ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void releaseComputer()}
                >
                  Release
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void bootComputer({ takeControl: true, overlay: false })}
                >
                  Take control
                </Button>
              )}
              <button
                type="button"
                className="text-[16px] text-[#85858A] hover:text-[#ECECEE]"
                aria-label="Close computer"
                onClick={() => setComputerOpen(false)}
              >
                ✕
              </button>
            </div>
          </div>
          <div className="min-h-0 flex-1 bg-[#0E0E10]">
            {computer?.kind === "desktop" ? (
              <div className="grid h-full place-items-center px-8 text-center text-sm text-[#6C6C70]">
                This bot runs on this computer. There is no separate Linux desktop. Ask it to use
                the shell; working directories under your home folder are allowed.
              </div>
            ) : computer?.state === "running" && embeddedScreenUrl ? (
              <iframe
                title="Bot screen"
                src={embeddedScreenUrl}
                sandbox={screenIframeSandbox(embeddedScreenUrl)}
                className="h-full w-full border-0 bg-black"
                allow="clipboard-read; clipboard-write; fullscreen"
                style={{ pointerEvents: computer?.controlHolder === "user" ? "auto" : "none" }}
              />
            ) : (
              <div className="grid h-full place-items-center text-sm text-[#6C6C70]">
                {computer?.state === "suspended" ? "Computer is asleep" : `${active.name}’s screen`}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function latestThreadBotReply(messages: ThreadMessage[]) {
  for (const message of [...messages].reverse()) {
    if (message.role !== "bot") continue;
    const text = message.blocks
      .filter((block) => block.kind === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();
    if (text) return text;
  }
  return "";
}

function avatarStateFor(status: string | undefined): BotAvatarState {
  const normalized = status?.toLowerCase();
  if (normalized === "running" || normalized === "working") return "working";
  if (normalized === "queued" || normalized === "leased" || normalized === "booting") {
    return "thinking";
  }
  if (normalized === "failed" || normalized === "error") return "error";
  if (normalized === "completed") return "happy";
  return "idle";
}

function applyThreadEvent(
  event: ProductEvent,
  setSnapshot: Dispatch<SetStateAction<ThreadSnapshot | null>>,
  setComputer: Dispatch<SetStateAction<ComputerStatus | null>>,
) {
  if (
    event.type === "thread.progress" ||
    event.type === "thread.subagent" ||
    event.type === "thread.message.created"
  ) {
    setSnapshot((prev) => reduceThreadSnapshot(prev, event));
  }
  if (event.type === "computer.status" || event.type === "computer.takeover.granted") {
    setComputer((prev) => reduceComputerStatus(prev, event));
  }
}

function MessageView({
  message,
  onAnswer,
  onOpenBot,
}: {
  message: ThreadMessage;
  onAnswer: (text: string) => void;
  onOpenBot: (botId: string) => void;
}) {
  return (
    <>
      {message.blocks.map((block, i) => {
        if (block.kind === "meta") {
          return (
            <div
