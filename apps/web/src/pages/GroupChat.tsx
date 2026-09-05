import { ChatMarkdown } from "@rakazo/chat-ui/web";
import type {
  Bot,
  GroupChatMember,
  GroupChatMessage,
  GroupChatSnapshot,
  GroupChatSummary,
} from "@rakazo/contracts";
import { BotAvatar, botAvatarStateForPresence } from "@rakazo/ui-web";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { rpc } from "../lib/rpc";
import { GroupChatEditor } from "./GroupChatEditor";
import { GroupRunPresence } from "./GroupRunPresence.js";
import { WindowChrome } from "./WindowChrome";

export function GroupChatPage() {
  const { groupChatId } = useParams();
  const navigate = useNavigate();
  const [room, setRoom] = useState<GroupChatSnapshot | null>(null);
  const [groups, setGroups] = useState<GroupChatSummary[]>([]);
  const [bots, setBots] = useState<Bot[]>([]);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    if (!groupChatId) return;
    const [nextRoom, nextGroups, nextBots] = await Promise.all([
      rpc.groupChats.get({ groupChatId }),
      rpc.groupChats.list(),
      rpc.bots.list(),
    ]);
    setRoom(nextRoom);
    setGroups(nextGroups);
    setBots(nextBots);
  }

  useEffect(() => {
    setRoom(null);
    setError(null);
    void refresh().catch((cause) =>
      setError(cause instanceof Error ? cause.message : "Could not load group chat."),
    );
  }, [groupChatId]);

  useEffect(() => {
    if (!groupChatId) return;
    const active = (room?.activeRuns.length ?? 0) > 0;
    const poll = window.setInterval(
      () => void refresh().catch(() => undefined),
      active ? 800 : 1_800,
    );
    return () => window.clearInterval(poll);
  }, [groupChatId, room?.activeRuns.length]);

  const memberById = useMemo(
    () => new Map((room?.members ?? []).map((member) => [member.botId, member])),
    [room?.members],
  );

  async function send() {
    if (!room || !draft.trim() || sending) return;
    const text = draft.trim();
    setDraft("");
    setSending(true);
    setError(null);
    try {
      await rpc.groupChats.send({
        groupChatId: room.id,
        text,
        clientNonce: `group-${room.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      });
      await refresh();
    } catch (cause) {
      setDraft(text);
      setError(cause instanceof Error ? cause.message : "Could not send group message.");
    } finally {
      setSending(false);
    }
  }

  function mention(name: string) {
    setDraft((current) => `${current}${current && !current.endsWith(" ") ? " " : ""}@${name} `);
  }

  async function updateGroup(input: { name: string; botIds: string[] }) {
    if (!room) return;
    const updated = await rpc.groupChats.update({ groupChatId: room.id, ...input });
    setRoom(updated);
    setEditing(false);
    setGroups(await rpc.groupChats.list());
  }

  async function removeGroup() {
    if (!room) return;
    if (!window.confirm(`Delete group chat “${room.name}”?`)) return;
    await rpc.groupChats.remove({ groupChatId: room.id });
    navigate("/app", { replace: true });
  }

  return (
    <div className="relative flex h-full min-w-0 overflow-hidden bg-[#050506] text-[#DFDFE2]">
      <aside className="flex w-[286px] shrink-0 flex-col border-r border-[#171719] bg-[#0B0B0C]">
        <div className="app-drag flex items-center justify-between px-4 pb-3 pt-4">
          <WindowChrome />
          <button
            type="button"
            onClick={() => navigate("/app")}
            className="app-no-drag rounded-lg px-2 py-1 text-[12px] text-[#7A7A80] hover:bg-white/5 hover:text-white"
          >
            Direct chats
          </button>
        </div>
        <div className="px-3 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#55555A]">
          Group chats
        </div>
        <div className="rk-scroll max-h-[42%] overflow-y-auto px-2.5">
          {groups.map((group) => (
            <button
              key={group.id}
              type="button"
              onClick={() => navigate(`/groups/${group.id}`)}
              className="mb-1 flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-left"
              style={{ background: group.id === room?.id ? "#171719" : "transparent" }}
            >
              <AvatarStack members={group.members} size={28} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-medium text-[#E9E9EC]">
                  {group.name}
                </span>
                <span className="block truncate text-[11px] text-[#6F6F74]">
                  {group.activeCount
                    ? `${group.activeCount} working`
                    : group.preview || `${group.members.length} bots`}
                </span>
              </span>
            </button>
          ))}
        </div>
        <div className="mt-3 border-t border-white/[0.06] px-3 pb-2 pt-4 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#55555A]">
          Bots
        </div>
        <div className="rk-scroll flex-1 overflow-y-auto px-2.5 pb-3">
          {bots.map((bot) => (
            <button
              key={bot.id}
              type="button"
              onClick={() => navigate(`/app/${bot.id}`)}
              className="mb-0.5 flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left hover:bg-[#141416]"
            >
              <BotAvatar
                color={bot.color}
                size={29}
                state={botAvatarStateForPresence(bot.presence?.state ?? "idle")}
                label={bot.name}
              />
              <span className="min-w-0 flex-1 truncate text-[13px] text-[#BEBEC3]">{bot.name}</span>
            </button>
          ))}
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col bg-[#080809]">
        <header className="flex min-h-[74px] items-center justify-between border-b border-[#171719] px-6">
          <div className="flex min-w-0 items-center gap-3">
            {room ? <AvatarStack members={room.members} size={34} /> : null}
            <div className="min-w-0">
              <h1 className="truncate text-[17px] font-semibold text-[#F0F0F2]">
                {room?.name ?? "Group chat"}
              </h1>
              <div className="mt-0.5 truncate text-[11.5px] text-[#6D6D72]">
                {room?.members.map((member) => member.name).join(" · ") ?? "Loading…"}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {(room?.activeRuns.length ?? 0) > 0 ? (
              <button
                type="button"
                onClick={() =>
                  room && void rpc.groupChats.stop({ groupChatId: room.id }).then(refresh)
                }
                className="rounded-xl border border-red-300/15 bg-red-400/[0.04] px-3 py-2 text-[11.5px] font-medium text-red-200/80 hover:bg-red-400/[0.08]"
              >
                Stop team
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-xl border border-white/[0.08] px-3 py-2 text-[11.5px] font-medium text-[#AAAAB0] hover:bg-white/5"
            >
              Manage
            </button>
          </div>
        </header>

        {room?.activeRuns.length ? (
          <div className="flex flex-wrap gap-2 border-b border-[#151517] bg-[#0A0A0B] px-6 py-2.5">
            {room.activeRuns.map((run) => (
              <GroupRunPresence key={run.runId} run={run} />
            ))}
          </div>
        ) : null}

        <div className="rk-scroll flex-1 overflow-y-auto px-5 py-6 sm:px-8">
          <div className="mx-auto flex w-full max-w-[880px] flex-col gap-4">
            {room?.messages.map((message) => (
              <GroupMessageRow key={message.id} message={message} memberById={memberById} />
            ))}
            {!room?.messages.length ? (
              <div className="mx-auto mt-14 max-w-[520px] text-center">
                <AvatarStack members={room?.members ?? []} size={44} />
                <h2 className="mt-4 text-[17px] font-semibold text-[#E6E6E9]">Start the room</h2>
                <p className="mt-2 text-[12.5px] leading-relaxed text-[#747479]">
                  Mention one specialist, use @all for a roundtable, or ask normally and FlowBots
                  will route the turn to the most relevant teammates.
                </p>
              </div>
            ) : null}
          </div>
        </div>

        <div className="border-t border-[#151517] bg-[#080809] px-5 pb-5 pt-3 sm:px-8">
          <div className="mx-auto w-full max-w-[900px]">
            <div className="mb-2 flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => mention("all")}
                className="rounded-full border border-[#BDF268]/15 bg-[#BDF268]/[0.035] px-2.5 py-1 text-[10.5px] font-medium text-[#AFCF7F] hover:bg-[#BDF268]/[0.07]"
              >
                @all
              </button>
              {room?.members.map((member) => (
                <button
                  key={member.botId}
                  type="button"
                  onClick={() => mention(member.name)}
                  className="rounded-full border border-white/[0.07] bg-white/[0.02] px-2.5 py-1 text-[10.5px] text-[#88888E] hover:bg-white/[0.05] hover:text-[#C8C8CD]"
                >
                  @{member.name}
                </button>
              ))}
            </div>
            {error ? (
              <div className="mb-2 rounded-xl border border-red-300/15 bg-red-400/[0.04] px-3 py-2 text-[11.5px] text-red-200/75">
                {error}
              </div>
            ) : null}
            <div className="flex min-h-[58px] items-end gap-2 rounded-[20px] border border-[#252528] bg-[#101012] p-2.5 pl-4 shadow-lg">
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void send();
                  }
                }}
                placeholder={room ? `Message ${room.name}` : "Message group"}
                rows={1}
                className="max-h-36 min-h-[36px] flex-1 resize-none bg-transparent py-2 text-[14px] text-[#E8E8EA] outline-none placeholder:text-[#55555A]"
              />
              <button
                type="button"
                aria-label="Send group message"
                onClick={() => void send()}
                disabled={!draft.trim() || sending}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#F0F0F2] text-[#111113] disabled:opacity-30"
              >
                ↑
              </button>
            </div>
          </div>
        </div>
      </main>

      {editing && room ? (
        <GroupChatEditor
          bots={bots}
          initialName={room.name}
          initialBotIds={room.members.map((member) => member.botId)}
          mode="manage"
          onSave={updateGroup}
          onClose={() => setEditing(false)}
        />
      ) : null}

      {editing && room ? (
        <button
          type="button"
          onClick={() => void removeGroup()}
          className="fixed bottom-6 left-[306px] z-[95] rounded-xl border border-red-300/15 bg-[#171012] px-3 py-2 text-[11px] text-red-200/70"
        >
          Delete group
        </button>
      ) : null}
    </div>
  );
}

function GroupMessageRow({
  message,
  memberById,
}: {
  message: GroupChatMessage;
  memberById: Map<string, GroupChatSnapshot["members"][number]>;
}) {
  const bot = message.botId ? memberById.get(message.botId) : undefined;
  const author =
    message.authorName ?? bot?.name ?? (message.authorKind === "user" ? "You" : "FlowBots");
  const color = message.authorColor ?? bot?.color ?? "#A0A0A6";
  const isUser = message.authorKind === "user";
  return (
    <div
      data-group-author={isUser ? "You" : author}
      className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}
    >
      {!isUser ? <BotAvatar color={color} size={34} state="idle" label={author} /> : null}
      <div className={`max-w-[78%] ${isUser ? "items-end" : "items-start"}`}>
        {!isUser ? (
          <div className="mb-1.5 flex items-center gap-2 text-[11px] font-medium" style={{ color }}>
            {author}
          </div>
        ) : null}
        <div
          className={`space-y-2 rounded-[18px] px-4 py-3 text-[14px] leading-relaxed ${
            isUser
              ? "bg-[#ECECEE] text-[#171719]"
              : "border border-white/[0.06] bg-[#171719] text-[#DEDEE1]"
          }`}
        >
          {message.blocks.map((block, index) => (
            <GroupBlock key={`${message.id}-${index}`} block={block} darkText={isUser} />
          ))}
        </div>
      </div>
    </div>
  );
}

function GroupBlock({
  block,
  darkText,
}: {
  block: GroupChatMessage["blocks"][number];
  darkText: boolean;
}) {
  if (block.kind === "text") return <ChatMarkdown>{block.text}</ChatMarkdown>;
  if (block.kind === "file") {
    return (
      <a
        href={`/api/artifacts/${encodeURIComponent(block.artifactId)}/download`}
        download={block.name}
        className={`block rounded-xl border px-3 py-2 ${darkText ? "border-black/10" : "border-white/10"}`}
      >
        <span className="block font-medium">{block.name}</span>
        <span className="text-[10px] opacity-60">
          {block.mimeType} · {block.size.toLocaleString()} bytes
        </span>
      </a>
    );
  }
  if (block.kind === "progress" || block.kind === "meta")
    return <div className="text-[12px] opacity-65">{block.text}</div>;
  if (block.kind === "ask") return <div>{block.text}</div>;
  if (block.kind === "card") {
    return (
      <div>
        {block.lines.map((line) => (
          <div key={`${line.k}-${line.v}`}>
            {line.k}: {line.v}
          </div>
        ))}
      </div>
    );
  }
  if (block.kind === "subagent")
    return (
      <div>
        {block.name}: {block.result ?? block.progress ?? block.status}
      </div>
    );
  if (block.kind === "computer")
    return (
      <div>
        {block.state}: {block.text}
      </div>
    );
  if (block.kind === "choice") return <div>{block.question}</div>;
  if (block.kind === "connect")
    return (
      <div>
        {block.name}: {block.status}
      </div>
    );
  if (block.kind === "child_bot")
    return (
      <div>
        {block.name}: {block.status}
      </div>
    );
  return null;
}

function AvatarStack({ members, size }: { members: GroupChatMember[]; size: number }) {
  return (
    <div className="flex shrink-0 items-center">
      {members.slice(0, 4).map((member, index) => (
        <div
          key={member.botId}
          style={{ marginLeft: index ? -Math.round(size * 0.3) : 0, zIndex: 5 - index }}
        >
          <BotAvatar
            color={member.color}
            size={size}
            state={botAvatarStateForPresence(member.presence?.state ?? "idle")}
            label={member.name}
          />
        </div>
      ))}
      {members.length > 4 ? (
        <span className="ml-1 text-[10px] text-[#77777D]">+{members.length - 4}</span>
      ) : null}
    </div>
  );
}
