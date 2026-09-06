import { useEffect, useRef, useState } from "react";
import { createVoiceController, type VoiceController, type VoiceStatus } from "../lib/voice.js";

export function VoiceControls({
  scopeKey,
  onTranscript,
  latestReply,
}: {
  scopeKey: string;
  onTranscript: (text: string) => void;
  latestReply: string;
}) {
  const controller = useRef<VoiceController | null>(null);
  const onTranscriptRef = useRef(onTranscript);
  const scopeKeyRef = useRef(scopeKey);
  onTranscriptRef.current = onTranscript;
  scopeKeyRef.current = scopeKey;
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [recognitionAvailable, setRecognitionAvailable] = useState(false);
  const [speechAvailable, setSpeechAvailable] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [disclosureOpen, setDisclosureOpen] = useState(false);

  useEffect(() => {
    const ownerScope = scopeKey;
    const next = createVoiceController({
      onFinalTranscript: (text) => {
        if (scopeKeyRef.current !== ownerScope) return;
        setInterim("");
        onTranscriptRef.current(text);
      },
      onInterimTranscript: (text) => {
        if (scopeKeyRef.current === ownerScope) setInterim(text);
      },
      onStatus: (nextStatus) => {
        if (scopeKeyRef.current === ownerScope) setStatus(nextStatus);
      },
      onError: (message) => {
        if (scopeKeyRef.current === ownerScope) setError(message);
      },
    });
    controller.current = next;
    setRecognitionAvailable(next.capabilities.recognition);
    setSpeechAvailable(next.capabilities.speech);
    setStatus(next.status());
    setInterim("");
    setError(null);
    setDisclosureOpen(false);
    return () => {
      next.dispose();
      if (controller.current === next) controller.current = null;
    };
  }, [scopeKey]);

  function beginVoice() {
    if (!recognitionAvailable) {
      setError("Voice input is not supported by this browser. You can keep using text chat.");
      return;
    }
    setDisclosureOpen(true);
  }

  function confirmVoice() {
    setError(null);
    setInterim("");
    setDisclosureOpen(false);
    controller.current?.start();
  }

  function stop() {
    controller.current?.stop();
    setInterim("");
  }

  function readAloud() {
    setError(null);
    if (!latestReply.trim()) {
      setError("There is no bot reply to read aloud yet.");
      return;
    }
    controller.current?.readAloud(latestReply);
  }

  const active = status === "listening" || status === "speaking";
  const statusText =
    error ??
    (status === "listening"
      ? interim
        ? `Listening: ${interim}`
        : "Listening. Your final transcript will be added to the draft."
      : status === "speaking"
        ? "Reading the last bot reply aloud."
        : status === "unsupported"
          ? "Voice input is unavailable. Text chat is still available."
          : "");

  return (
    <fieldset
      className="m-0 flex shrink-0 items-center gap-1.5 border-0 p-0"
      aria-label="Voice controls"
    >
      <button
        type="button"
        aria-label={status === "listening" ? "Stop voice input" : "Start voice input"}
        title={status === "listening" ? "Stop voice input" : "Voice input"}
        onClick={status === "listening" ? stop : beginVoice}
        className="grid h-9 w-9 place-items-center rounded-full border border-[#313136] text-[#BEBEC3] hover:bg-white/[0.06] disabled:opacity-35"
      >
        {status === "listening" ? "■" : "◉"}
        <span className="sr-only">
          Speech recognition may send audio to your browser vendor; FlowBots does not claim it is
          offline.
        </span>
      </button>
      <button
        type="button"
        aria-label="Read aloud last reply"
        title="Read aloud last reply"
        disabled={!speechAvailable || !latestReply.trim()}
        onClick={readAloud}
        className="grid h-9 w-9 place-items-center rounded-full border border-[#313136] text-[#BEBEC3] hover:bg-white/[0.06] disabled:opacity-35"
      >
        ◌
      </button>
      {active ? (
        <button
          type="button"
          aria-label="Stop voice playback and capture"
          onClick={stop}
          className="rounded-lg px-2 py-1 text-[11px] text-[#D8D8DC] hover:bg-white/[0.06]"
        >
          Stop
        </button>
      ) : null}
      <span className="sr-only" aria-live="polite">
        {statusText}
      </span>
      {error || status === "unsupported" ? (
        <span className="max-w-36 truncate text-[10px] text-[#B6A4A4]" role="status">
          {error ?? "Voice unavailable"}
        </span>
      ) : null}
      {disclosureOpen ? (
        <div className="absolute bottom-full right-0 z-20 mb-2 w-72 rounded-xl border border-[#34343A] bg-[#18181C] p-3 text-xs shadow-xl">
          <p className="leading-relaxed text-[#D9D9DD]">
            Speech recognition may send audio to your browser vendor. FlowBots does not claim this
            is offline. Only the final transcript is added to your draft; it is never sent
            automatically.
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setDisclosureOpen(false)}
              className="px-2 py-1 text-[#AAAAB0]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmVoice}
              className="rounded-md bg-[#F1F1EF] px-2.5 py-1 text-[#17171A]"
            >
              Start listening
            </button>
          </div>
        </div>
      ) : null}
    </fieldset>
  );
}
