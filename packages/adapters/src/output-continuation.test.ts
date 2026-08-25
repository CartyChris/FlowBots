import { describe, expect, it } from "vitest";
import {
  CONTINUATION_LIMIT_NOTICE,
  continuationDecision,
  continuationPrompt,
  MAX_OUTPUT_CONTINUATION_ROUNDS,
} from "./output-continuation.js";

describe("output continuation", () => {
  it("continues only explicit length stops while budget remains", () => {
    expect(continuationDecision({ finishReason: "length", round: 0 })).toEqual({
      continue: true,
      exhausted: false,
    });
    expect(
      continuationDecision({
        finishReason: "length",
        round: MAX_OUTPUT_CONTINUATION_ROUNDS - 1,
      }),
    ).toEqual({ continue: false, exhausted: true });
    expect(continuationDecision({ finishReason: "stop", round: 0 })).toEqual({
      continue: false,
      exhausted: false,
    });
    expect(continuationDecision({ finishReason: "unknown", round: 0 })).toEqual({
      continue: false,
      exhausted: false,
    });
  });

  it("instructs the model to resume without repeating or summarizing", () => {
    expect(continuationPrompt()).toMatch(/continue exactly where/i);
    expect(continuationPrompt()).toMatch(/do not restart/i);
    expect(continuationPrompt()).toMatch(/repeat/i);
    expect(continuationPrompt()).toMatch(/pending files/i);
  });

  it("provides an explicit visible notice instead of silently clipping at the safety ceiling", () => {
    expect(CONTINUATION_LIMIT_NOTICE).toMatch(/continuation limit reached/i);
    expect(CONTINUATION_LIMIT_NOTICE).toMatch(/incomplete/i);
  });
});
