export type AgentFinishReason = "stop" | "length" | "tool" | "error" | "unknown";

export const MAX_OUTPUT_CONTINUATION_ROUNDS = 6;
export const CONTINUATION_LIMIT_NOTICE =
  "\n\n[FlowBots continuation limit reached — remaining output may be incomplete.]";

export function continuationDecision(input: {
  finishReason: AgentFinishReason;
  round: number;
}): { continue: boolean; exhausted: boolean } {
  if (input.finishReason !== "length") return { continue: false, exhausted: false };
  const exhausted = input.round >= MAX_OUTPUT_CONTINUATION_ROUNDS - 1;
  return { continue: !exhausted, exhausted };
}

export function continuationPrompt(): string {
  return [
    "Continue exactly where your previous response stopped.",
    "Do not restart, repeat, summarize, or omit remaining requested material.",
    "Finish the original task, including any pending files or tool work.",
    "Start with only the next missing content so the combined output is lossless.",
  ].join(" ");
}
