import type { BotPresenceSnapshot, BotPresenceState, OfficeStation } from "@rakazo/contracts";

export interface PresenceRun {
  id: string;
  taskId: string;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
  modelProvider: string | null;
  modelId: string | null;
}

export interface PresenceActivityEvent {
  runId: string | null;
  type: string;
  createdAt: string;
  payload: Record<string, unknown>;
}

const PRESENTATION: Record<BotPresenceState, readonly [OfficeStation, string]> = {
  idle: ["lounge", "Available for an assignment"],
  queued: ["focus", "Waiting to start work"],
  thinking: ["focus", "Working on the current task"],
  reading: ["focus", "Reading workspace material"],
  searching: ["research", "Searching public sources"],
  browsing: ["research", "Reading a public web source"],
  writing: ["artifacts", "Writing an output"],
  coding: ["development", "Writing a workspace file"],
  building: ["development", "Building workspace output"],
  running_command: ["development", "Running a command"],
  using_tool: ["focus", "Using an enabled tool"],
  collaborating: ["collaboration", "Working with a teammate"],
  delegating: ["collaboration", "Requesting a teammate assignment"],
  handing_off: ["collaboration", "Handing work to a teammate"],
  waiting_on_bot: ["collaboration", "Waiting for a teammate result"],
  reviewing: ["review", "Reviewing an output"],
  judging: ["review", "Evaluating output against requirements"],
  verifying: ["review", "Checking a claim against evidence"],
  testing: ["review", "Running verification checks"],
  blocked: ["help", "Work is blocked"],
  needs_user: ["help", "Waiting for user input or control"],
  complete: ["artifacts", "Work completed"],
  failed: ["help", "Run failed; inspect the task for details"],
  cancelled: ["lounge", "Work stopped"],
};

const TOOL_STATE: Record<string, BotPresenceState> = {
  web_search: "searching",
  web_fetch: "browsing",
  verify_current_claim: "verifying",
  read_file: "reading",
  list_files: "reading",
  write_file: "coding",
  shell: "running_command",
  share_file: "writing",
  computer_act: "using_tool",
  open_path: "using_tool",
  launch_app: "using_tool",
  delegate_to_bot: "delegating",
  delegate_team: "delegating",
  message_bot: "collaborating",
  consult_teammate: "collaborating",
  read_bot_updates: "collaborating",
  read_task_result: "collaborating",
  react_to_message: "collaborating",
  run_subagent: "collaborating",
};

const COMPLETION_ACKNOWLEDGMENT_MS = 6_000;

/** Project authoritative run state and its latest safe event; no model inference or animation timer. */
export function projectBotPresence(input: {
  botId: string;
  run: PresenceRun | null;
  event?: PresenceActivityEvent | null;
  updatedAt?: string;
  now?: number;
}): BotPresenceSnapshot {
  const now = input.now ?? Date.now();
  const run = input.run;
  let state: BotPresenceState = "idle";
  let updatedAt = validTimestamp(run?.updatedAt ?? input.updatedAt) ?? new Date(now).toISOString();
  const event = input.event;

  if (run) {
    if (run.status === "completed") {
      const completedAt = validTimestamp(run.completedAt) ?? validTimestamp(run.updatedAt);
      const elapsed = completedAt ? now - Date.parse(completedAt) : Number.POSITIVE_INFINITY;
      state = elapsed >= 0 && elapsed < COMPLETION_ACKNOWLEDGMENT_MS ? "complete" : "idle";
    } else if (run.status === "failed") state = "failed";
    else if (run.status === "cancelled") state = "cancelled";
    else if (run.status === "waiting_input" || run.status === "waiting_takeover")
      state = "needs_user";
    else if (run.status === "queued" || run.status === "leased") state = "queued";
    else if (run.status === "running") {
      state = "thinking";
      const eventTime = event ? validTimestamp(event.createdAt) : null;
      const start = validTimestamp(run.startedAt);
      if (
        event &&
        event.runId === run.id &&
        eventTime &&
        (!start || Date.parse(eventTime) >= Date.parse(start))
      ) {
        updatedAt = eventTime;
        if (event.type === "agent.tool.started") {
          const name = typeof event.payload.name === "string" ? event.payload.name : "";
          state = Object.hasOwn(TOOL_STATE, name) ? TOOL_STATE[name]! : "using_tool";
        }
        // A finished tool, planned tool call, or recovered run.start is no longer tool execution.
      }
    } else state = "blocked";
  }

  const [station, summary] = PRESENTATION[state];
  return {
    botId: input.botId,
    runId: run?.id ?? null,
    taskId: run?.taskId ?? null,
    state,
    station,
    summary,
    updatedAt,
    startedAt: validTimestamp(run?.startedAt),
    modelProvider: run?.modelProvider ?? null,
    modelId: run?.modelId ?? null,
  };
}

function validTimestamp(value: string | null | undefined): string | null {
  return value && Number.isFinite(Date.parse(value)) ? value : null;
}
