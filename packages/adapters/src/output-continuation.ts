import type {
  AdapterContext,
  AgentFinishReason,
  AgentRunRequest,
  AgentRuntime,
  AgentRuntimeEvent,
} from "@rakazo/adapter-kit";

export type { AgentFinishReason } from "@rakazo/adapter-kit";

export const MAX_OUTPUT_CONTINUATION_ROUNDS = 6;
export const CONTINUATION_LIMIT_NOTICE =
  "\n\n[FlowBots continuation limit reached — remaining output may be incomplete.]";

export function continuationDecision(input: { finishReason: AgentFinishReason; round: number }): {
  continue: boolean;
  exhausted: boolean;
} {
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

/**
 * Run a provider request to completion while continuing only explicit token-limit stops.
 * Intermediate `done` events are suppressed so callers observe one logical response.
 */
export async function* runWithOutputContinuation(
  runtime: AgentRuntime,
  request: AgentRunRequest,
  context: AdapterContext,
): AsyncIterable<AgentRuntimeEvent> {
  let combined = "";
  let round = 0;
  let nextRequest = request;

  while (round < MAX_OUTPUT_CONTINUATION_ROUNDS) {
    let roundText = "";
    let done: Extract<AgentRuntimeEvent, { type: "done" }> | undefined;

    for await (const event of runtime.run(nextRequest, context)) {
      if (event.type === "done") {
        done = event;
        continue;
      }
      if (event.type === "text") {
        roundText += event.text;
        combined += event.text;
      }
      yield event;
    }

    if (!roundText && done?.text) {
      roundText = done.text;
      combined += done.text;
      yield { type: "text", text: done.text };
    }

    const finishReason = done?.finishReason ?? "unknown";
    const decision = continuationDecision({ finishReason, round });
    if (!decision.continue) {
      if (decision.exhausted) {
        combined += CONTINUATION_LIMIT_NOTICE;
        yield { type: "text", text: CONTINUATION_LIMIT_NOTICE };
      }
      yield { type: "done", text: combined || done?.text, finishReason };
      return;
    }

    round += 1;
    nextRequest = continuationRequest(request, combined);
  }
}

function continuationRequest(request: AgentRunRequest, combined: string): AgentRunRequest {
  const history = [...request.history];
  const last = history.at(-1);
  if (last?.role !== "user" || last.content !== request.prompt) {
    history.push({ role: "user", content: request.prompt });
  }
  history.push({ role: "assistant", content: combined });
  return {
    ...request,
    prompt: continuationPrompt(),
    history,
    resumeFromCheckpoint: undefined,
  };
}
