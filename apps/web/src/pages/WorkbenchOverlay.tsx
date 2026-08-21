import { useMemo, useState } from "react";
import {
  type ArtifactFormat,
  buildArtifactTask,
  buildSandboxTask,
  type SandboxIsolation,
  type SandboxTemplate,
} from "./workbench.js";

const ARTIFACT_FORMATS: Array<{ id: ArtifactFormat; label: string; detail: string }> = [
  { id: "pdf", label: "PDF", detail: "Portable report" },
  { id: "docx", label: "DOCX", detail: "Editable document" },
  { id: "pptx", label: "PPTX", detail: "Presentation deck" },
  { id: "html", label: "HTML", detail: "App / game / site" },
  { id: "md", label: "Markdown", detail: "Portable source" },
  { id: "csv", label: "CSV", detail: "Structured data" },
];

export function WorkbenchOverlay({
  botName,
  extensionInstructions,
  onRun,
  onClose,
}: {
  botName: string;
  extensionInstructions: string[];
  onRun: (prompt: string) => Promise<void> | void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"sandbox" | "artifacts">("sandbox");
  const [template, setTemplate] = useState<SandboxTemplate>("prototype");
  const [isolation, setIsolation] = useState<SandboxIsolation>("auto");
  const [workingDirectory, setWorkingDirectory] = useState("");
  const [task, setTask] = useState("");
  const [brief, setBrief] = useState("");
  const [formats, setFormats] = useState<ArtifactFormat[]>(["html"]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const stageLabel = useMemo(() => {
    if (tab === "sandbox") return ["Inspect", "Execute", "Verify"];
    return ["Compose", "Render files", "Validate"];
  }, [tab]);

  async function submitSandbox() {
    if (!task.trim()) {
      setNotice("Describe the sandbox job first.");
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      await onRun(
        buildSandboxTask({
          botName,
          template,
          task,
          isolation,
          workingDirectory,
          extensionInstructions,
        }),
      );
      setNotice(
        "Sandbox job dispatched to the bot. Completion remains tied to its real run and verification.",
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not dispatch the sandbox job.");
    } finally {
      setBusy(false);
    }
  }

  async function submitArtifacts() {
    if (!brief.trim()) {
      setNotice("Describe the artifact set first.");
      return;
    }
    if (formats.length === 0) {
      setNotice("Choose at least one output format.");
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      await onRun(buildArtifactTask({ botName, brief, formats, extensionInstructions }));
      setNotice(
        "Artifact job dispatched. FlowBots will only report files that the bot actually creates.",
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not dispatch the artifact job.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/75 p-3 backdrop-blur-sm sm:p-6">
      <div className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-[28px] border border-white/10 bg-[#111214] text-[#F5F5F2] shadow-2xl">
        <header className="flex items-center gap-4 border-white/10 border-b px-5 py-4 sm:px-7">
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-[#BDF268] text-[11px] uppercase tracking-[0.22em]">
              Creative runtime · {botName}
            </p>
            <h2 className="mt-1 font-semibold text-2xl tracking-tight">Bot Workbench</h2>
            <p className="mt-1 max-w-2xl text-[#A6A6A1] text-sm">
              Stage real bot work through a visible sandbox control surface or generate verified
              project files. The UI simulates the workflow; your configured FlowBots runtime remains
              the actual execution boundary.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close workbench"
            onClick={onClose}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/10 bg-white/5 text-lg hover:bg-white/10"
          >
            ×
          </button>
        </header>

        <div className="grid min-h-0 flex-1 lg:grid-cols-[220px_1fr]">
          <aside className="border-white/10 border-b bg-[#0B0C0D] p-4 lg:border-r lg:border-b-0">
            <div
              role="tablist"
              aria-label="Workbench modes"
              className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1"
            >
              <button
                type="button"
                role="tab"
                aria-selected={tab === "sandbox"}
                onClick={() => setTab("sandbox")}
                className={`rounded-2xl border p-3 text-left transition ${
                  tab === "sandbox"
                    ? "border-[#BDF268]/45 bg-[#BDF268]/10 text-white"
                    : "border-white/10 bg-white/[0.03] text-[#A6A6A1] hover:bg-white/[0.06]"
                }`}
              >
                <span className="block font-semibold text-sm">Sandbox Lab</span>
                <span className="mt-1 block text-[11px] opacity-70">
                  Build · test · research · transform
                </span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === "artifacts"}
                onClick={() => setTab("artifacts")}
                className={`rounded-2xl border p-3 text-left transition ${
                  tab === "artifacts"
                    ? "border-[#8EDFF7]/45 bg-[#8EDFF7]/10 text-white"
                    : "border-white/10 bg-white/[0.03] text-[#A6A6A1] hover:bg-white/[0.06]"
                }`}
              >
                <span className="block font-semibold text-sm">Artifact Studio</span>
                <span className="mt-1 block text-[11px] opacity-70">PDF · docs · decks · apps</span>
              </button>
            </div>

            <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
              <p className="font-semibold text-[10px] text-[#777871] uppercase tracking-[0.18em]">
                Extension layer
              </p>
              <p className="mt-2 text-[#B7B7B0] text-xs leading-5">
                {extensionInstructions.length > 0
                  ? `${extensionInstructions.length} registered GitHub extension instruction${extensionInstructions.length === 1 ? "" : "s"} will be injected.`
                  : "No targeted GitHub extension guidance is active for this bot."}
              </p>
            </div>
          </aside>

          <main className="min-h-0 overflow-y-auto p-5 sm:p-7">
            <section className="grid gap-3 sm:grid-cols-3">
              {stageLabel.map((label, index) => (
                <div
                  key={label}
                  className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#17181A] p-4"
                >
                  <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-[#BDF268] via-[#8EDFF7] to-[#D8C5FF] opacity-70" />
                  <p className="text-[#73746F] text-[10px] uppercase tracking-[0.2em]">
                    Stage {index + 1}
                  </p>
                  <p className="mt-2 font-semibold text-sm">{label}</p>
                  <div className="mt-3 flex gap-1">
                    {Array.from({ length: 5 }).map((_, marker) => (
                      <span
                        key={marker}
                        className={`h-1 flex-1 rounded-full ${marker <= index + 1 ? "bg-[#BDF268]/70" : "bg-white/10"}`}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </section>

            {tab === "sandbox" ? (
              <div className="mt-6 grid gap-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="grid gap-2 text-[#9B9C96] text-xs">
                    Job template
                    <select
                      value={template}
                      onChange={(event) => setTemplate(event.target.value as SandboxTemplate)}
                      className="rounded-xl border border-white/10 bg-[#090A0B] px-3 py-3 text-white outline-none focus:border-[#BDF268]/60"
                    >
                      <option value="prototype">Prototype / build</option>
                      <option value="test-fix">Test, diagnose, and fix</option>
                      <option value="research">Research with evidence</option>
                      <option value="transform">Transform existing files</option>
                    </select>
                  </label>
                  <label className="grid gap-2 text-[#9B9C96] text-xs">
                    Requested isolation
                    <select
                      value={isolation}
                      onChange={(event) => setIsolation(event.target.value as SandboxIsolation)}
                      className="rounded-xl border border-white/10 bg-[#090A0B] px-3 py-3 text-white outline-none focus:border-[#BDF268]/60"
                    >
                      <option value="auto">Auto — use configured runtime</option>
                      <option value="container">Container</option>
                      <option value="desktop">Desktop computer</option>
                      <option value="e2b">E2B cloud sandbox</option>
                    </select>
                  </label>
                </div>
                <label className="grid gap-2 text-[#9B9C96] text-xs">
                  Working directory hint
                  <input
                    value={workingDirectory}
                    onChange={(event) => setWorkingDirectory(event.target.value)}
                    placeholder="projects/my-app (optional)"
                    className="rounded-xl border border-white/10 bg-[#090A0B] px-3 py-3 text-white outline-none placeholder:text-[#555650] focus:border-[#BDF268]/60"
                  />
                </label>
                <label className="grid gap-2 text-[#9B9C96] text-xs">
                  Sandbox task
                  <textarea
                    value={task}
                    onChange={(event) => setTask(event.target.value)}
                    placeholder="Build, debug, test, research, or transform something inside the bot's actual runtime…"
                    rows={7}
                    className="resize-y rounded-2xl border border-white/10 bg-[#090A0B] px-4 py-3 text-sm text-white leading-6 outline-none placeholder:text-[#555650] focus:border-[#BDF268]/60"
                  />
                </label>
                <div className="rounded-2xl border border-[#BDF268]/15 bg-[#BDF268]/[0.04] p-4 text-[#ADAEA8] text-xs leading-5">
                  <strong className="text-[#DDF8AB]">Boundary rule:</strong> FlowBots will
                  explicitly report the actual runtime it receives and must run a failable
                  verification before calling the job complete. The visual lab itself never pretends
                  to be the security boundary.
                </div>
                <button
                  type="button"
                  disabled={busy || !task.trim()}
                  onClick={() => void submitSandbox()}
                  className="rounded-2xl bg-[#BDF268] px-5 py-3 font-semibold text-[#11120E] text-sm transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {busy ? "Dispatching…" : `Run sandbox job with ${botName}`}
                </button>
              </div>
            ) : (
              <div className="mt-6 grid gap-5">
                <label className="grid gap-2 text-[#9B9C96] text-xs">
                  Artifact brief
                  <textarea
                    value={brief}
                    onChange={(event) => setBrief(event.target.value)}
                    placeholder="Create a polished investor deck and a companion single-file HTML demo…"
                    rows={7}
                    className="resize-y rounded-2xl border border-white/10 bg-[#090A0B] px-4 py-3 text-sm text-white leading-6 outline-none placeholder:text-[#555650] focus:border-[#8EDFF7]/60"
                  />
                </label>
                <div>
                  <p className="mb-2 text-[#9B9C96] text-xs">Output formats</p>
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {ARTIFACT_FORMATS.map((format) => {
                      const selected = formats.includes(format.id);
                      return (
                        <button
                          key={format.id}
                          type="button"
                          aria-pressed={selected}
                          onClick={() =>
                            setFormats((current) =>
                              selected
                                ? current.filter((value) => value !== format.id)
                                : [...current, format.id],
                            )
                          }
                          className={`rounded-2xl border p-3 text-left ${
                            selected
                              ? "border-[#8EDFF7]/55 bg-[#8EDFF7]/10"
                              : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
                          }`}
                        >
                          <span className="block font-semibold text-sm">{format.label}</span>
                          <span className="mt-1 block text-[#858680] text-[11px]">
                            {format.detail}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="rounded-2xl border border-[#8EDFF7]/15 bg-[#8EDFF7]/[0.04] p-4 text-[#ADAEA8] text-xs leading-5">
                  <strong className="text-[#BCEFFF]">Real-file rule:</strong> requested deliverables
                  are written under <code>flowbots-exports/</code>. The bot must verify the path
                  before reporting it; changing a file extension does not count as generating a
                  valid document or presentation.
                </div>
                <button
                  type="button"
                  disabled={busy || !brief.trim() || formats.length === 0}
                  onClick={() => void submitArtifacts()}
                  className="rounded-2xl bg-[#8EDFF7] px-5 py-3 font-semibold text-[#071317] text-sm transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {busy
                    ? "Dispatching…"
                    : `Generate ${formats.length} format${formats.length === 1 ? "" : "s"} with ${botName}`}
                </button>
              </div>
            )}

            {notice ? (
              <div
                role="status"
                className="mt-5 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-[#C8C8C1] text-xs"
              >
                {notice}
              </div>
            ) : null}
          </main>
        </div>
      </div>
    </div>
  );
}
