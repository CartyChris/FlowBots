import type { Bot, MissionTask } from "@rakazo/contracts";
import { BotAvatar, botAvatarStateForPresence } from "@rakazo/ui-web";
import { useEffect, useState } from "react";
import { rpc } from "../lib/rpc.js";

export type { MissionTask } from "@rakazo/contracts";

type MissionDetail = Awaited<ReturnType<typeof rpc.missions.get>>;
const ACTIVE_STATUSES = new Set([
  "queued",
  "leased",
  "running",
  "waiting_input",
  "waiting_takeover",
]);

/** A completed lead can still have working children. Never recurse over untrusted lineage. */
export function taskTreeIsActive(taskId: string, tasks: MissionTask[]): boolean {
  const pending = [taskId];
  const visited = new Set<string>();
  while (pending.length) {
    const id = pending.pop();
    if (!id || visited.has(id)) continue;
    visited.add(id);
    if (tasks.some((task) => task.id === id && ACTIVE_STATUSES.has(task.status))) return true;
    for (const task of tasks) if (task.parentTaskId === id) pending.push(task.id);
  }
  return false;
}

export function MissionControl({
  tasks,
  bots,
  revision,
  truncated,
  error,
  initialTaskId,
  onOpenChat,
  onStop,
}: {
  tasks: MissionTask[];
  bots: Bot[];
  revision: number;
  truncated: boolean;
  error: string | null;
  initialTaskId?: string | null;
  onOpenChat: (botId: string, groupChatId: string | null) => void;
  onStop: (taskId: string) => Promise<void>;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(initialTaskId ?? null);
  const [detail, setDetail] = useState<MissionDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [stopping, setStopping] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "active">("all");

  // One host clock refreshes the roster, ledger and selected detail. Abort superseded reads.
  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController();
    void rpc.missions
      .get({ taskId: selectedId }, { signal: controller.signal })
      .then((next) => {
        if (controller.signal.aborted) return;
        setDetail(next);
        setDetailError(null);
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted)
          setDetailError(err instanceof Error ? err.message : "Could not load this task.");
      });
    return () => controller.abort();
  }, [selectedId, revision]);

  function selectTask(id: string) {
    setDetail(null);
    setDetailError(null);
    setNotice(null);
    setSelectedId(id);
  }
  async function stopTask(taskId: string) {
    setStopping(taskId);
    setNotice(null);
    try {
      await onStop(taskId);
      setNotice("Stop requested for this task and its descendants.");
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : "Could not stop the task.");
    } finally {
      setStopping(null);
    }
  }
  const shownTasks =
    filter === "active" ? tasks.filter((task) => taskTreeIsActive(task.id, tasks)) : tasks;
  const selected = detail?.task.id === selectedId ? detail : null;
  const owner = bots.find((bot) => bot.id === selected?.task.botId);
  const activePresence = owner?.presence?.taskId === selectedId ? owner.presence : null;

  return (
    <div className="mx-auto max-w-[1540px]">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-xl">Mission Control</h3>
          <p className="mt-1 text-sm text-[#969D9E]">
            Persisted ownership, handoffs and deliverables from your bots.
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs text-[#B3BDBA]">
          Show
          <select
            className="rounded-lg border border-white/15 bg-[#151B1C] px-3 py-2"
            value={filter}
            onChange={(event) => setFilter(event.target.value as "all" | "active")}
          >
            <option value="all">Recent tasks</option>
            <option value="active">Active task trees</option>
          </select>
        </label>
      </div>
      {error ? (
        <p role="alert" className="office-alert mb-4">
          Updates paused: {error}. Displaying the last available records.
        </p>
      ) : null}
      {truncated ? (
        <p className="mb-4 text-xs text-[#AEB8B3]">
          Showing the most recent tasks. Parent references may point outside this window; inspect
          them by ID below.
        </p>
      ) : null}
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,1fr)]">
        <div className="space-y-3">
          {shownTasks.length === 0 ? (
            <div className="office-empty">
              {error && tasks.length === 0
                ? "Task list unavailable"
                : tasks.length === 0
                  ? "No tasks yet"
                  : "No active tasks"}
              <p className="mt-2 text-xs">
                Assign work in a bot chat. Its task and real results will appear here.
              </p>
            </div>
          ) : null}
          {shownTasks.map((task) => {
            const bot = bots.find((candidate) => candidate.id === task.botId);
            const presence = bot?.presence?.taskId === task.id ? bot.presence : null;
            return (
              <article
                key={task.id}
                className={`rounded-2xl border p-4 ${selectedId === task.id ? "border-[#BDF268]/45 bg-[#BDF268]/[0.045]" : "border-white/10 bg-[#111719]"}`}
                data-task-id={task.id}
              >
                <button
                  type="button"
                  aria-label={`Inspect task ${task.prompt}`}
                  className="w-full text-left"
                  onClick={() => selectTask(task.id)}
                >
                  <div className="flex items-center gap-3">
                    {bot ? (
                      <BotAvatar
                        color={bot.color}
                        size={38}
                        state={botAvatarStateForPresence(presence?.state ?? "idle")}
                        label={bot.name}
                      />
                    ) : null}
                    <span className="flex-1 font-medium text-sm">{task.botName}</span>
                    <span className="office-chip">{task.status.replaceAll("_", " ")}</span>
                  </div>
                  <p className="mt-3 break-words text-sm leading-6">{task.prompt}</p>
                  {presence ? (
                    <p className="mt-2 text-xs text-[#B9DBCF]">{presence.summary}</p>
                  ) : null}
                  <p className="mt-3 text-xs text-[#A0AAA6]">
                    {task.artifactCount} artifact{task.artifactCount === 1 ? "" : "s"} ·{" "}
                    {task.kind ?? "direct task"}
                  </p>
                </button>
                {task.parentTaskId ? (
                  <button
                    type="button"
                    className="mt-3 max-w-full break-all text-left text-xs text-[#B7CBEF] underline underline-offset-4"
                    onClick={() => selectTask(task.parentTaskId as string)}
                  >
                    From task {task.parentTaskId}
                  </button>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="office-action"
                    onClick={() => onOpenChat(task.botId, task.groupChatId)}
                  >
                    {task.groupChatId ? "Open group chat" : "Open bot chat"}
                  </button>
                  {taskTreeIsActive(task.id, tasks) ? (
                    <button
                      type="button"
                      disabled={stopping !== null}
                      className="office-action office-stop"
                      onClick={() => void stopTask(task.id)}
                    >
                      {stopping === task.id ? "Stopping…" : "Stop task tree"}
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
        <section
          className="min-w-0 rounded-2xl border border-white/10 bg-[#101719] p-5 lg:sticky lg:top-0"
          aria-label="Task inspector"
        >
          <h3 className="font-semibold text-lg">Task inspector</h3>
          {detailError ? (
            <p role="alert" className="office-alert mt-3">
              {detailError}
            </p>
          ) : null}
          {notice ? (
            <p role="status" className="mt-3 text-sm text-[#D3F5BA]">
              {notice}
            </p>
          ) : null}
          {!selectedId ? (
            <p className="mt-3 text-sm text-[#A1AAA6]">
              Select a task to inspect its ownership, context packet, artifacts and recorded events.
            </p>
          ) : !selected ? (
            <p className="mt-3 text-sm text-[#A1AAA6]">
              {detailError ? "Task details unavailable." : "Loading task…"}
            </p>
          ) : (
            <>
              <p className="mt-4 break-words text-sm leading-6">{selected.task.prompt}</p>
              <dl className="mt-4 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-xs">
                <dt className="text-[#929F99]">Owner</dt>
                <dd>{selected.task.botName}</dd>
                <dt className="text-[#929F99]">Status</dt>
                <dd>{selected.task.status}</dd>
                <dt className="text-[#929F99]">Task</dt>
                <dd className="break-all">{selected.task.id}</dd>
                <dt className="text-[#929F99]">Run</dt>
                <dd className="break-all">{selected.task.runId ?? "Not started"}</dd>
                <dt className="text-[#929F99]">Updated</dt>
                <dd>
                  <time dateTime={selected.task.updatedAt}>
                    {new Date(selected.task.updatedAt).toLocaleString()}
                  </time>
                </dd>
                {activePresence ? (
                  <>
                    <dt className="text-[#929F99]">Activity</dt>
                    <dd>{activePresence.summary}</dd>
                    <dt className="text-[#929F99]">Model</dt>
                    <dd className="break-all">
                      {[activePresence.modelProvider, activePresence.modelId]
                        .filter(Boolean)
                        .join(" / ") || "Not selected yet"}
                    </dd>
                  </>
                ) : null}
              </dl>
              {selected.contextPacket ? (
                <details className="mt-5 rounded-xl border border-white/10 p-3">
                  <summary className="cursor-pointer text-sm">
                    Inspect compact context packet
                  </summary>
                  <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words text-xs text-[#B7C7C0]">
                    {JSON.stringify(selected.contextPacket, null, 2)}
                  </pre>
                </details>
              ) : null}
              <h4 className="mt-5 font-medium text-sm">Artifacts</h4>
              {selected.artifacts.length === 0 ? (
                <p className="mt-2 text-xs text-[#929F99]">No artifacts recorded for this task.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {selected.artifacts.map((artifact) => (
                    <li key={artifact.id}>
                      <a
                        href={`/api/artifacts/${encodeURIComponent(artifact.id)}/download`}
                        download={artifact.name}
                        className="block break-all rounded-xl border border-[#8EDFF7]/20 px-3 py-2 text-sm text-[#BDEAF5] underline underline-offset-4"
                      >
                        {artifact.name}
                        <span className="ml-2 text-xs text-[#8FABA9]">
                          {Math.max(1, Math.ceil(artifact.size / 1024))} KB
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              )}
              <h4 className="mt-5 font-medium text-sm">Recorded timeline</h4>
              {selected.events.length === 0 ? (
                <p className="mt-2 text-xs text-[#929F99]">No collaboration events recorded.</p>
              ) : (
                <ol className="mt-3 max-h-80 space-y-3 overflow-y-auto border-l border-[#8EDFF7]/20 pl-4">
                  {selected.events.map((event) => (
                    <MissionTimelineEvent
                      key={event.id}
                      event={event}
                      bots={bots}
                      onSelectTask={selectTask}
                    />
                  ))}
                </ol>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

export function MissionTimelineEvent({
  event,
  bots,
  onSelectTask,
}: {
  event: MissionDetail["events"][number];
  bots: Bot[];
  onSelectTask: (taskId: string) => void;
}) {
  const sourceId = typeof event.payload.sourceBotId === "string" ? event.payload.sourceBotId : null;
  const targetId = typeof event.payload.targetBotId === "string" ? event.payload.targetBotId : null;
  const taskId = typeof event.payload.taskId === "string" ? event.payload.taskId : null;
  const handoff = event.type.startsWith("collaboration.handoff.");
  const names = new Map(bots.map((bot) => [bot.id, bot.name]));
  const labels: Record<string, string> = {
    "collaboration.handoff.started": "Handoff started",
    "collaboration.handoff.accepted": "Handoff accepted",
    "run.started": "Run started",
    "run.completed": "Run completed",
    "run.failed": "Run failed",
    "run.cancelled": "Run cancelled",
    "agent.tool.started": "Tool started",
    "agent.tool.finished": "Tool finished",
  };
  return (
    <li className="text-xs">
      <p className="font-medium text-[#D7E5DF]">
        {labels[event.type] ?? event.type.replace(/[._]/g, " ")}
      </p>
      {handoff && sourceId && targetId ? (
        <p className="mt-1 text-[#D8C5FF]">
          {names.get(sourceId) ?? sourceId} → {names.get(targetId) ?? targetId}
        </p>
      ) : null}
      <p className="mt-1 text-[#97A59E]">
        {names.get(event.botId) ?? event.botId} ·{" "}
        <time dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleTimeString()}</time>
      </p>
      {handoff && taskId ? (
        <button
          type="button"
          className="mt-2 text-[#B7CBEF] underline underline-offset-4"
          onClick={() => onSelectTask(taskId)}
        >
          Inspect handoff task
        </button>
      ) : null}
    </li>
  );
}
