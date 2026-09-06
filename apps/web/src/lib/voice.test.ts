import { describe, expect, it, vi } from "vitest";
import { createVoiceController, type SpeechRecognitionResultEventLike } from "./voice.js";

class FakeRecognition {
  continuous = false;
  interimResults = false;
  lang = "";
  onresult: ((event: SpeechRecognitionResultEventLike) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn();
  abort = vi.fn();

  result(transcript: string, isFinal: boolean) {
    this.onresult?.({
      resultIndex: 0,
      results: [{ isFinal, 0: { transcript } }],
    });
  }
}

describe("createVoiceController", () => {
  it("delivers interim and final transcription only while the current capture is active", () => {
    const recognitions: FakeRecognition[] = [];
    const interim = vi.fn();
    const final = vi.fn();
    const controller = createVoiceController({
      recognitionFactory: () => {
        const recognition = new FakeRecognition();
        recognitions.push(recognition);
        return recognition;
      },
      onInterimTranscript: interim,
      onFinalTranscript: final,
    });

    expect(controller.start()).toBe(true);
    recognitions[0]!.result("hel", false);
    recognitions[0]!.result("hello", true);

    expect(interim).toHaveBeenLastCalledWith("hel");
    expect(final).toHaveBeenCalledWith("hello");
    expect(controller.status()).toBe("listening");
  });

  it("does not start recognition twice", () => {
    const recognition = new FakeRecognition();
    const controller = createVoiceController({ recognitionFactory: () => recognition });

    expect(controller.start()).toBe(true);
    expect(controller.start()).toBe(false);
    expect(recognition.start).toHaveBeenCalledTimes(1);
  });

  it("reports unsupported recognition without starting a microphone", () => {
    const error = vi.fn();
    const controller = createVoiceController({ onError: error });

    expect(controller.start()).toBe(false);
    expect(controller.status()).toBe("unsupported");
    expect(error).toHaveBeenCalledWith("Voice input is not supported by this browser.");
  });

  it("reports microphone permission denial", () => {
    let recognition: FakeRecognition | undefined;
    const error = vi.fn();
    const controller = createVoiceController({
      recognitionFactory: () => (recognition = new FakeRecognition()),
      onError: error,
    });

    controller.start();
    recognition!.onerror?.({ error: "not-allowed" });

    expect(controller.status()).toBe("error");
    expect(error).toHaveBeenCalledWith("Microphone permission was denied.");
  });

  it("ignores recognition events that arrive after stop or dispose", () => {
    const recognitions: FakeRecognition[] = [];
    const final = vi.fn();
    const controller = createVoiceController({
      recognitionFactory: () => {
        const recognition = new FakeRecognition();
        recognitions.push(recognition);
        return recognition;
      },
      onFinalTranscript: final,
    });

    controller.start();
    controller.stop();
    recognitions[0]!.result("late after stop", true);
    controller.start();
    controller.dispose();
    recognitions[1]!.result("late after dispose", true);

    expect(final).not.toHaveBeenCalled();
    expect(recognitions[0]!.abort).toHaveBeenCalledOnce();
    expect(recognitions[1]!.abort).toHaveBeenCalledOnce();
  });

  it("cancels speech and ignores a late utterance completion", () => {
    const cancel = vi.fn();
    const speak = vi.fn();
    const utterances: Array<{ text: string; onend: (() => void) | null }> = [];
    const controller = createVoiceController({
      speechSynthesis: { speak, cancel },
      createUtterance: (text) => {
        const utterance = { text, onend: null };
        utterances.push(utterance);
        return utterance;
      },
    });

    expect(controller.readAloud("A reply")).toBe(true);
    expect(controller.status()).toBe("speaking");
    controller.stop();
    utterances[0]!.onend?.();

    expect(cancel).toHaveBeenCalledOnce();
    // Recognition is unavailable in this speech-only fixture, so its resting state remains unsupported.
    expect(controller.status()).toBe("unsupported");
  });

  it("stops capture before speaking so read aloud cannot become a transcript", () => {
    const recognition = new FakeRecognition();
    const final = vi.fn();
    const controller = createVoiceController({
      recognitionFactory: () => recognition,
      onFinalTranscript: final,
      speechSynthesis: { speak: vi.fn(), cancel: vi.fn() },
      createUtterance: (text) => ({ text, onend: null }),
    });

    controller.start();
    controller.readAloud("bot reply");
    recognition.result("heard from speakers", true);

    expect(recognition.abort).toHaveBeenCalledOnce();
    expect(final).not.toHaveBeenCalled();
    expect(controller.status()).toBe("speaking");
  });

  it("cancels speech before starting capture", () => {
    const recognition = new FakeRecognition();
    const cancel = vi.fn();
    const controller = createVoiceController({
      recognitionFactory: () => recognition,
      speechSynthesis: { speak: vi.fn(), cancel },
      createUtterance: (text) => ({ text, onend: null }),
    });

    controller.readAloud("bot reply");
    controller.start();

    expect(cancel).toHaveBeenCalledOnce();
    expect(controller.status()).toBe("listening");
  });

  it("turns synchronous browser API failures into an error state", () => {
    const errors = vi.fn();
    const brokenFactory = createVoiceController({
      recognitionFactory: () => {
        throw new Error("factory unavailable");
      },
      onError: errors,
    });
    const brokenSpeech = createVoiceController({
      speechSynthesis: {
        speak: () => {
          throw new Error("speak unavailable");
        },
        cancel: vi.fn(),
      },
      createUtterance: (text) => ({ text, onend: null }),
      onError: errors,
    });

    expect(brokenFactory.start()).toBe(false);
    expect(brokenFactory.status()).toBe("error");
    expect(brokenSpeech.readAloud("reply")).toBe(false);
    expect(brokenSpeech.status()).toBe("error");
    expect(errors).toHaveBeenCalledWith("Voice input could not start. Try again or use text chat.");
    expect(errors).toHaveBeenCalledWith("Read aloud could not start. Try again or use text chat.");
  });

  it("turns synchronous utterance construction failures into an error state", () => {
    const error = vi.fn();
    const controller = createVoiceController({
      speechSynthesis: { speak: vi.fn(), cancel: vi.fn() },
      createUtterance: () => {
        throw new Error("utterance unavailable");
      },
      onError: error,
    });

    expect(controller.readAloud("reply")).toBe(false);
    expect(controller.status()).toBe("error");
    expect(error).toHaveBeenCalledWith("Read aloud could not start. Try again or use text chat.");
  });

  it("contains an abort failure while still cancelling active speech", () => {
    const recognition = new FakeRecognition();
    recognition.abort.mockImplementation(() => {
      throw new Error("abort unavailable");
    });
    const cancel = vi.fn();
    const controller = createVoiceController({
      recognitionFactory: () => recognition,
      speechSynthesis: { speak: vi.fn(), cancel },
      createUtterance: (text) => ({ text, onend: null }),
    });

    controller.start();
    controller.readAloud("reply");
    expect(() => controller.stop()).not.toThrow();
    expect(cancel).toHaveBeenCalledOnce();
  });
});
