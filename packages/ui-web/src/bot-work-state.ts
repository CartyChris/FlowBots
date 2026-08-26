export type SemanticBotWorkState = "researching" | "verifying" | "collaborating" | "building";

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
