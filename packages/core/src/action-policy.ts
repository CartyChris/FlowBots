import type { ActionPolicy } from "@rakazo/contracts";

export type ActionScope = "internal" | "workspace" | "host" | "external";
export interface ActionClassification {
  scope: ActionScope;
  readOnly: boolean;
}

const READ_ONLY = new Set([
  "computer_observe",
  "list_files",
  "read_file",
  "recall_memory",
  "read_task_result",
  "web_search",
  "web_fetch",
  "verify_current_claim",
  "read_bot_updates",
  "list_skills",
  "read_skill",
]);
const INTERNAL = new Set([
  "remember",
  "recall_memory",
  "read_task_result",
  "delegate_to_bot",
  "delegate_team",
  "message_bot",
  "consult_teammate",
  "read_bot_updates",
  "react_to_message",
  "run_subagent",
  "request_takeover",
  "spawn_bot",
  "delete_bot",
  "list_skills",
  "read_skill",
]);
const WORKSPACE = new Set(["list_files", "read_file", "write_file", "share_file"]);
const COMPUTER = new Set(["shell", "computer_observe", "computer_act", "open_path", "launch_app"]);

/** Names are selected by the runtime, never a skill's self-reported safety classification. */
export function classifyAction(tool: string, computerKind: string): ActionClassification {
  const scope: ActionScope = INTERNAL.has(tool)
    ? "internal"
    : WORKSPACE.has(tool)
      ? "workspace"
      : COMPUTER.has(tool)
        ? computerKind === "desktop"
          ? "host"
          : "workspace"
        : "external";
  return { scope, readOnly: READ_ONLY.has(tool) };
}

/** Deterministic policy evaluation is a restriction, never a source of new tool authority. */
export function evaluateActionPolicy(
  policy: ActionPolicy,
  action: { tool: string; computerKind: string; fingerprint?: string },
): ActionClassification & { decision: "allow" | "ask" | "deny"; reason: string } {
  const classification = classifyAction(action.tool, action.computerKind);
  const result = (decision: "allow" | "ask" | "deny", reason: string) => ({
    ...classification,
    decision,
    reason,
  });
  if (policy.mode === "read-only" && !classification.readOnly)
    return result("deny", "Read-only policy blocks actions that may change state.");
  const rules = policy.rules.filter(
    (rule) =>
      rule.tool === action.tool && (!rule.fingerprint || rule.fingerprint === action.fingerprint),
  );
  if (rules.some((rule) => rule.decision === "deny"))
    return result("deny", "An explicit deny rule matches this action.");
  if (rules.some((rule) => rule.decision === "ask"))
    return result("ask", "An explicit review rule matches this action.");
  if (rules.some((rule) => rule.decision === "allow"))
    return result("allow", "An explicit allow rule matches this action.");
  if (policy.mode === "legacy")
    return result("allow", "Legacy behavior: executor tool actions are not reviewed.");
  if (policy.mode === "read-only" || (policy.mode === "review-risky" && classification.readOnly))
    return result("allow", "Known read-only executor action.");
  return result("ask", "This bot requires your approval before the action runs.");
}
