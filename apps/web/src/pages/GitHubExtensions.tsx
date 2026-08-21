import type { Bot, CapabilityInstall } from "@rakazo/contracts";
import { Button } from "@rakazo/ui-web";
import { useEffect, useMemo, useState } from "react";
import { rpc } from "../lib/rpc";
import {
  type GitHubExtensionScope,
  normalizeGitHubRepoUrl,
  sanitizeExtensionInstructions,
} from "./github-extensions.js";

const SCOPES: Array<{ id: GitHubExtensionScope; label: string; detail: string }> = [
  {
    id: "bot-instructions",
    label: "Bot instructions",
    detail: "Inject bounded repository guidance into targeted bot Workbench jobs.",
  },
  {
    id: "workflow-prompts",
    label: "Workflow prompts",
    detail: "Add reusable workflow guidance when a targeted bot launches structured work.",
  },
  {
    id: "workspace-feature",
    label: "Workspace feature",
    detail:
      "Register the repository as a declarative FlowBots feature descriptor for future adapters.",
  },
];

function isFlowBotsGitHubExtension(install: CapabilityInstall) {
  return (
    install.kind === "plugin" &&
    install.source.startsWith("https://github.com/") &&
    install.config.flowbotsExtension === true
  );
}

export function GitHubExtensions() {
  const [bots, setBots] = useState<Bot[]>([]);
  const [installs, setInstalls] = useState<CapabilityInstall[]>([]);
  const [repoUrl, setRepoUrl] = useState("");
  const [name, setName] = useState("");
  const [scope, setScope] = useState<GitHubExtensionScope>("bot-instructions");
  const [instructions, setInstructions] = useState("");
  const [botIds, setBotIds] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function refresh() {
    const [nextBots, nextInstalls] = await Promise.all([rpc.bots.list(), rpc.capabilities.list()]);
    setBots(nextBots);
    setInstalls(nextInstalls);
  }

  useEffect(() => {
    void refresh().catch((err: unknown) =>
      setError(err instanceof Error ? err.message : "Could not load GitHub extensions"),
    );
  }, []);

  const extensions = useMemo(() => installs.filter(isFlowBotsGitHubExtension), [installs]);

  async function register() {
    setError(null);
    setNotice(null);
    let source: string;
    try {
      source = normalizeGitHubRepoUrl(repoUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Enter a valid GitHub repository URL.");
      return;
    }
    const boundedInstructions = sanitizeExtensionInstructions(instructions);
    const repoName = source.split("/").slice(-2).join("/");
    const displayName = name.trim() || repoName;
    setPending(true);
    try {
      await rpc.capabilities.install({
        kind: "plugin",
        name: displayName,
        source,
        config: {
          flowbotsExtension: true,
          scope,
          instructions: boundedInstructions,
          botIds,
        },
      });
      setRepoUrl("");
      setName("");
      setInstructions("");
      setBotIds([]);
      setNotice(`${displayName} registered as a declarative GitHub extension.`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not register GitHub extension");
    } finally {
      setPending(false);
    }
  }

  async function remove(id: string) {
    setError(null);
    try {
      await rpc.capabilities.remove({ id });
      setInstalls((current) => current.filter((install) => install.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove GitHub extension");
    }
  }

  function toggleBot(id: string) {
    setBotIds((current) =>
      current.includes(id) ? current.filter((botId) => botId !== id) : [...current, id],
    );
  }

  return (
    <section className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
      <div className="mx-auto max-w-4xl">
        <div className="rounded-[24px] border border-[#313236] bg-[#17181A] p-5 sm:p-6">
          <p className="font-semibold text-[#BDF268] text-[10px] uppercase tracking-[0.22em]">
            Safe extension registry
          </p>
          <h3 className="mt-2 font-semibold text-xl">GitHub Extensions</h3>
          <p className="mt-2 max-w-3xl text-[#9B9C96] text-sm leading-6">
            Register a public GitHub repository as declarative guidance or a FlowBots feature
            descriptor. Registration persists the source and bounded configuration; it does not
            execute repository JavaScript, install scripts, shell commands, or binaries on your
            host.
          </p>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-[#A8A9A3] text-xs md:col-span-2">
              GitHub repository URL
              <input
                aria-label="GitHub repository URL"
                value={repoUrl}
                onChange={(event) => setRepoUrl(event.target.value)}
                placeholder="https://github.com/owner/repository"
                className="rounded-xl border border-[#34353A] bg-[#0D0E10] px-3 py-3 text-[#F4F4F1] outline-none placeholder:text-[#555650] focus:border-[#BDF268]/60"
              />
            </label>
            <label className="grid gap-2 text-[#A8A9A3] text-xs">
              Display name
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Optional — defaults to owner/repository"
                className="rounded-xl border border-[#34353A] bg-[#0D0E10] px-3 py-3 text-[#F4F4F1] outline-none placeholder:text-[#555650] focus:border-[#BDF268]/60"
              />
            </label>
            <label className="grid gap-2 text-[#A8A9A3] text-xs">
              Extension scope
              <select
                aria-label="Extension scope"
                value={scope}
                onChange={(event) => setScope(event.target.value as GitHubExtensionScope)}
                className="rounded-xl border border-[#34353A] bg-[#0D0E10] px-3 py-3 text-[#F4F4F1] outline-none focus:border-[#BDF268]/60"
              >
                {SCOPES.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-4 rounded-2xl border border-[#2C2D31] bg-[#101113] px-4 py-3 text-[#8F908A] text-xs">
            {SCOPES.find((option) => option.id === scope)?.detail}
          </div>

          <label className="mt-4 grid gap-2 text-[#A8A9A3] text-xs">
            Extension instructions
            <textarea
              aria-label="Extension instructions"
              value={instructions}
              maxLength={4_000}
              onChange={(event) => setInstructions(event.target.value)}
              rows={5}
              placeholder="Optional bounded guidance: conventions, workflow rules, or how bots should use this repository's documented ideas."
              className="resize-y rounded-2xl border border-[#34353A] bg-[#0D0E10] px-4 py-3 text-sm text-[#F4F4F1] leading-6 outline-none placeholder:text-[#555650] focus:border-[#BDF268]/60"
            />
            <span className="text-right text-[#61625D]">{instructions.length}/4000</span>
          </label>

          <fieldset className="mt-4">
            <legend className="text-[#A8A9A3] text-xs">Target bots</legend>
            <p className="mt-1 text-[#686963] text-[11px]">
              Leave all unchecked to apply to every bot.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {bots.map((bot) => (
                <label
                  key={bot.id}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-xs ${
                    botIds.includes(bot.id)
                      ? "border-[#BDF268]/45 bg-[#BDF268]/10 text-[#EAFACF]"
                      : "border-[#303135] bg-[#111214] text-[#A6A7A1]"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={botIds.includes(bot.id)}
                    onChange={() => toggleBot(bot.id)}
                    className="accent-[#BDF268]"
                  />
                  <span className="truncate">{bot.name}</span>
                </label>
              ))}
              {bots.length === 0 ? <p className="text-[#696A64] text-xs">No bots yet.</p> : null}
            </div>
          </fieldset>

          {error ? (
            <div
              role="alert"
              className="mt-4 rounded-xl border border-red-400/25 bg-red-400/10 px-3 py-2 text-red-200 text-xs"
            >
              {error}
            </div>
          ) : null}
          {notice ? (
            <div
              role="status"
              className="mt-4 rounded-xl border border-[#BDF268]/20 bg-[#BDF268]/10 px-3 py-2 text-[#E5F7C7] text-xs"
            >
              {notice}
            </div>
          ) : null}

          <Button
            type="button"
            disabled={pending || !repoUrl.trim()}
            onClick={() => void register()}
            className="mt-5 w-full sm:w-auto"
          >
            {pending ? "Registering…" : "Register extension"}
          </Button>
        </div>

        <div className="mt-5">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <p className="font-semibold text-[#777871] text-[10px] uppercase tracking-[0.2em]">
                Installed manifests
              </p>
              <h4 className="mt-1 font-semibold text-base">
                {extensions.length} GitHub extension{extensions.length === 1 ? "" : "s"}
              </h4>
            </div>
          </div>

          <div className="grid gap-3">
            {extensions.map((install) => {
              const config = install.config;
              const targets = Array.isArray(config.botIds) ? (config.botIds as string[]) : [];
              const targetNames = targets
                .map((id) => bots.find((bot) => bot.id === id)?.name)
                .filter(Boolean)
                .join(", ");
              return (
                <article
                  key={install.id}
                  className="rounded-2xl border border-[#303135] bg-[#151618] p-4"
                >
                  <div className="flex items-start gap-3">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#222329] font-bold text-[#BDF268] text-xs">
                      GH
                    </div>
                    <div className="min-w-0 flex-1">
                      <h5 className="truncate font-semibold text-sm">{install.name}</h5>
                      <p className="mt-1 truncate text-[#747570] text-[11px]">{install.source}</p>
                      <div className="mt-3 flex flex-wrap gap-2 text-[10px]">
                        <span className="rounded-full bg-white/[0.06] px-2 py-1 text-[#A4A59F]">
                          {String(config.scope ?? "bot-instructions")}
                        </span>
                        <span className="rounded-full bg-white/[0.06] px-2 py-1 text-[#A4A59F]">
                          {targets.length === 0
                            ? "All bots"
                            : targetNames || `${targets.length} targeted bots`}
                        </span>
                      </div>
                      {String(config.instructions ?? "").trim() ? (
                        <p className="mt-3 line-clamp-3 text-[#A2A39D] text-xs leading-5">
                          {String(config.instructions)}
                        </p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => void remove(install.id)}
                      className="rounded-lg border border-[#37383D] px-2.5 py-1.5 text-[#8F908B] text-[11px] hover:border-red-300/30 hover:text-red-200"
                    >
                      Remove
                    </button>
                  </div>
                </article>
              );
            })}
            {extensions.length === 0 ? (
              <div className="rounded-2xl border border-[#2D2E32] border-dashed px-5 py-9 text-center text-[#73746E] text-sm">
                No GitHub extensions registered yet.
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
