import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { VoiceControls } from "./VoiceControls.js";

describe("VoiceControls", () => {
  it("offers explicit voice and read-aloud controls with a privacy disclosure", () => {
    const html = renderToStaticMarkup(
      <VoiceControls
        scopeKey="bot-1"
        onTranscript={() => undefined}
        latestReply="Latest bot reply"
      />,
    );

    expect(html).toContain('aria-label="Start voice input"');
    expect(html).toContain('aria-label="Read aloud last reply"');
    expect(html).toContain("Speech recognition may send audio to your browser vendor");
    expect(html).toContain('aria-live="polite"');
  });
});
