export type VoiceStatus = "idle" | "listening" | "speaking" | "unsupported" | "error";

export interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang?: string;
  onresult: ((event: SpeechRecognitionResultEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

export interface SpeechRecognitionResultEventLike {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
}

export interface SpeechSynthesisLike {
  speak(utterance: unknown): void;
  cancel(): void;
}

export interface SpeechUtteranceLike {
  text: string;
  onend: (() => void) | null;
  onerror?: (() => void) | null;
}

export interface VoiceController {
  capabilities: { recognition: boolean; speech: boolean };
  start(): boolean;
  stop(): void;
  dispose(): void;
  readAloud(text: string): boolean;
  status(): VoiceStatus;
}

export function createVoiceController(
  options: {
    recognitionFactory?: () => SpeechRecognitionLike;
    speechSynthesis?: SpeechSynthesisLike;
    createUtterance?: (text: string) => SpeechUtteranceLike;
    onFinalTranscript?: (text: string) => void;
    onInterimTranscript?: (text: string) => void;
    onStatus?: (status: VoiceStatus) => void;
    onError?: (message: string) => void;
  } = {},
): VoiceController {
  const recognitionFactory = options.recognitionFactory ?? browserRecognitionFactory();
  const speechSynthesis = options.speechSynthesis ?? browserSpeechSynthesis();
  const createUtterance = options.createUtterance ?? browserUtteranceFactory();
  let currentStatus: VoiceStatus = recognitionFactory ? "idle" : "unsupported";
  let listening = false;
  let speaking = false;
  let disposed = false;
  let captureId = 0;
  let speechId = 0;
  let activeRecognition: SpeechRecognitionLike | undefined;

  const setStatus = (status: VoiceStatus) => {
    currentStatus = status;
    options.onStatus?.(status);
  };
  const cancelSpeech = () => {
    speechId += 1;
    if (!speaking) return;
    speaking = false;
    try {
      speechSynthesis?.cancel();
    } catch {
      // Stopping voice controls must remain safe even if the browser API fails.
    }
  };
  const abortCapture = () => {
    captureId += 1;
    listening = false;
    const recognition = activeRecognition;
    activeRecognition = undefined;
    try {
      recognition?.abort();
    } catch {
      // A failed abort must not leave speech controls unusable.
    }
  };

  return {
    capabilities: {
      recognition: Boolean(recognitionFactory),
      speech: Boolean(speechSynthesis && createUtterance),
    },
    start() {
      if (disposed || listening) return false;
      if (!recognitionFactory) {
        setStatus("unsupported");
        options.onError?.("Voice input is not supported by this browser.");
        return false;
      }
      try {
        cancelSpeech();
        const recognition = recognitionFactory();
        const id = ++captureId;
        activeRecognition = recognition;
        listening = true;
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.onresult = (event) => {
          if (disposed || !listening || id !== captureId) return;
          for (let index = event.resultIndex; index < event.results.length; index += 1) {
            const result = event.results[index];
            const text = result?.[0]?.transcript.trim();
            if (!text) continue;
            if (result?.isFinal) options.onFinalTranscript?.(text);
            else options.onInterimTranscript?.(text);
          }
        };
        recognition.onerror = (event) => {
          if (disposed || id !== captureId) return;
          listening = false;
          activeRecognition = undefined;
          setStatus("error");
          options.onError?.(
            event.error === "not-allowed" || event.error === "service-not-allowed"
              ? "Microphone permission was denied."
              : "Voice input could not start. Try again or use text chat.",
          );
        };
        recognition.onend = () => {
          if (disposed || id !== captureId || !listening) return;
          listening = false;
          activeRecognition = undefined;
          setStatus(speaking ? "speaking" : "idle");
        };
        recognition.start();
        setStatus("listening");
        return true;
      } catch {
        listening = false;
        activeRecognition = undefined;
        setStatus("error");
        options.onError?.("Voice input could not start. Try again or use text chat.");
        return false;
      }
    },
    stop() {
      abortCapture();
      cancelSpeech();
      if (!disposed) setStatus(recognitionFactory ? "idle" : "unsupported");
    },
    dispose() {
      if (disposed) return;
      abortCapture();
      cancelSpeech();
      disposed = true;
    },
    readAloud(text) {
      if (disposed || !text.trim()) return false;
      if (!speechSynthesis || !createUtterance) {
        options.onError?.("Read aloud is not supported by this browser.");
        return false;
      }
      abortCapture();
      cancelSpeech();
      const id = ++speechId;
      try {
        const utterance = createUtterance(text.trim());
        utterance.onend = () => {
          if (disposed || id !== speechId) return;
          speaking = false;
          setStatus(listening ? "listening" : "idle");
        };
        utterance.onerror = () => {
          if (disposed || id !== speechId) return;
          speaking = false;
          setStatus("error");
          options.onError?.("Read aloud could not finish.");
        };
        speaking = true;
        speechSynthesis.speak(utterance);
        setStatus("speaking");
        return true;
      } catch {
        speaking = false;
        speechId += 1;
        setStatus("error");
        options.onError?.("Read aloud could not start. Try again or use text chat.");
        return false;
      }
    },
    status() {
      return currentStatus;
    },
  };
}

function browserRecognitionFactory(): (() => SpeechRecognitionLike) | undefined {
  if (typeof window === "undefined") return undefined;
  const browser = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  const Recognition = browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
  return Recognition ? () => new Recognition() : undefined;
}

function browserSpeechSynthesis(): SpeechSynthesisLike | undefined {
  return typeof window === "undefined"
    ? undefined
    : (window.speechSynthesis as unknown as SpeechSynthesisLike);
}

function browserUtteranceFactory(): ((text: string) => SpeechUtteranceLike) | undefined {
  if (typeof window === "undefined" || typeof window.SpeechSynthesisUtterance !== "function")
    return undefined;
  return (text) => new window.SpeechSynthesisUtterance(text) as unknown as SpeechUtteranceLike;
}
