import type { BotAvatarState } from "./bot-avatar.js";

export type SemanticBotWorkState = "researching" | "verifying" | "collaborating" | "building";

const PRESENCE_AVATAR: Record<string, BotAvatarState> = {
  idle: "idle",
  queued: "thinking",
  thinking: "thinking",
  reading: "thinking",
  searching: "researching",
  browsing: "researching",
  writing: "working",
  coding: "building",
  building: "building",
  running_command: "building",
  using_tool: "working",
  collaborating: "collaborating",
  delegating: "collaborating",
  handing_off: "collaborating",
  waiting_on_bot: "thinking",
  reviewing: "verifying",
  judging: "verifying",
  verifying: "verifying",
  testing: "verifying",
  blocked: "surprised",
  needs_user: "surprised",
  complete: "happy",
  failed: "error",
  cancelled: "idle",
};

/** Expression mapping only; runtime authority and activity derivation belong to core. */
export function botAvatarStateForPresence(state: string): BotAvatarState {
  return Object.hasOwn(PRESENCE_AVATAR, state) ? PRESENCE_AVATAR[state]! : "idle";
}

const RESEARCH_TOOLS = new Set(["web_search", "web_fetch"]);
const VERIFY_TOOLS = new Set(["verify_current_claim"]);
const COLLABORATION_TOOLS = new Set([
  "message_bot",
  "delegate_to_bot",
  "delegate_team",
  "read_bot_updates",
  "react_to_message",
  "run_subagent",
]);
const BUILD_TOOLS = new Set([
  "write_file",
  "share_file",
  "shell",
  "computer_act",
  "open_path",
  "launch_app",
  "spawn_bot",
]);

export function botWorkStateForTool(toolName: string): SemanticBotWorkState | undefined {
  const value = toolName.trim();
  if (VERIFY_TOOLS.has(value)) return "verifying";
  if (RESEARCH_TOOLS.has(value)) return "researching";
  if (COLLABORATION_TOOLS.has(value)) return "collaborating";
  if (BUILD_TOOLS.has(value)) return "building";
  return undefined;
}
