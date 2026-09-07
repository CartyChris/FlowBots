import type { Bot } from "@rakazo/contracts";
import {
  type BotSteeringProfile,
  botSteeringSelection,
  type FlowMembership,
  flowMembershipFromInstructions,
} from "@rakazo/core";
import { useEffect, useState } from "react";

const AXES = [
  {
    key: "initiative",
    label: "Initiative",
    detail: "How readily the bot anticipates useful next steps.",
    options: [
      ["reserved", "Reserved"],
      ["balanced", "Balanced"],
      ["proactive", "Proactive"],
    ],
  },
  {
    key: "expressiveness",
    label: "Expressiveness",
    detail: "How much visible energy and personality it uses.",
    options: [
      ["concise", "Concise"],
      ["natural", "Natural"],
      ["animated", "Animated"],
    ],
  },
  {
    key: "challenge",
    label: "Challenge",
    detail: "How aggressively it tests assumptions and weak reasoning.",
    options: [
      ["supportive", "Supportive"],
      ["balanced", "Balanced"],
      ["skeptical", "Skeptical"],
    ],
  },
  {
    key: "collaboration",
    label: "Collaboration",
    detail: "When it should consult or fan work out to teammates.",
    options: [
      ["solo", "Solo"],
      ["consultative", "Consultative"],
      ["team-first", "Team-first"],
    ],
  },
  {
    key: "research",
    label: "Research",
    detail: "How strongly it prefers current public-web evidence.",
    options: [
      ["normal", "Normal"],
      ["web-first", "Web-first"],
      ["verify-current", "Verify current"],
    ],
  },
  {
    key: "depth",
    label: "Depth",
    detail: "How deeply it investigates before presenting the result.",
    options: [
      ["brief", "Brief"],
      ["standard", "Standard"],
      ["exhaustive", "Exhaustive"],
    ],
  },
] as const;

type AxisKey = (typeof AXES)[number]["key"];

export function SteeringStudio({
  bot,
  onSave,
  onClose,
}: {
  bot: Bot;
  onSave: (profile: BotSteeringProfile, membership: FlowMembership) => Promise<void>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<BotSteeringProfile>(() =>
    botSteeringSelection(bot.instructions ?? ""),
  );
  const [membership, setMembership] = useState<FlowMembership>(() =>
    flowMembershipFromInstructions(bot.instructions ?? ""),
  );
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setDraft(botSteeringSelection(bot.instructions ?? ""));
    setMembership(flowMembershipFromInstructions(bot.instructions ?? ""));
  }, [bot.instructions]);

  useEffect(() => {
    setNotice(null);
  }, [bot.id]);

  function setAxis(key: AxisKey, value: string) {
    setDraft((current) => ({ ...current, [key]: value }) as BotSteeringProfile);
    setNotice(null);
  }

  async function save() {
    setSaving(true);
    setNotice(null);
    try {
      await onSave(draft, membership);
      setNotice("Steering saved");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not save steering.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[97] flex items-center justify-center bg-black/80 p-3 backdrop-blur-md sm:p-6">
      <section className="flex max-h-[94vh] w-full max-w-[880px] flex-col overflow-hidden rounded-[30px] border border-white/10 bg-[#0D0E10] text-[#F5F5F1] shadow-[0_40px_120px_rgba(0,0,0,.72)]">
        <header className="flex items-start gap-4 border-white/10 border-b px-5 py-4 sm:px-7">
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-[#8EDFF7] text-[10px] uppercase tracking-[0.24em]">
              Agent Evolution · Steering Profiles 2.0
            </p>
            <h2 className="mt-1 truncate font-semibold text-2xl tracking-tight">Steering Studio</h2>
            <p className="mt-1 text-[#858680] text-xs">
              Tune how {bot.name} takes initiative, communicates, researches, collaborates, and
              challenges ideas. Steering never changes permissions.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close Steering Studio"
            onClick={onClose}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-lg hover:bg-white/[0.08]"
          >
            ×
          </button>
        </header>

        <div className="rk-scroll min-h-0 flex-1 overflow-y-auto p-5 sm:p-7">
          <div className="mb-5 rounded-2xl border border-[#8EDFF7]/15 bg-[#8EDFF7]/[0.045] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-semibold text-sm">{bot.name}</p>
                <p className="mt-1 text-[#8B8C86] text-xs">{bot.title || "FlowBots teammate"}</p>
              </div>
              <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 font-semibold text-[#AEB0AA] text-[9px] uppercase tracking-[0.16em]">
                style ≠ authority
              </span>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {AXES.map((axis) => (
              <label
                key={axis.key}
                className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 transition hover:border-white/15"
              >
                <span className="block font-semibold text-[#E8E9E4] text-xs">{axis.label}</span>
                <span className="mt-1 block min-h-8 text-[#74766F] text-[10.5px] leading-relaxed">
                  {axis.detail}
                </span>
                <select
                  aria-label={axis.label}
                  value={draft[axis.key]}
                  onChange={(event) => setAxis(axis.key, event.currentTarget.value)}
                  className="mt-3 w-full rounded-xl border border-white/10 bg-[#08090A] px-3 py-2.5 font-medium text-[#D7D9D2] text-xs outline-none focus:border-[#8EDFF7]/50"
                >
                  {axis.options.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          <label className="mt-5 block rounded-2xl border border-[#BDF268]/15 bg-[#BDF268]/[0.035] p-4">
            <span className="block font-semibold text-[#E8E9E4] text-xs">Shared Flow</span>
            <span className="mt-1 block text-[#74766F] text-[10.5px] leading-relaxed">
              Connected bots automatically know each other and can consult/delegate within this
              workspace. Separated removes this bot from automatic teammate context and peer tools
              until you reconnect it. This never changes permissions.
            </span>
            <select
              aria-label="Shared Flow"
              value={membership}
              onChange={(event) => {
                setMembership(event.currentTarget.value as FlowMembership);
                setNotice(null);
              }}
              className="mt-3 w-full rounded-xl border border-white/10 bg-[#08090A] px-3 py-2.5 font-medium text-[#D7D9D2] text-xs outline-none focus:border-[#BDF268]/50"
            >
              <option value="connected">Connected</option>
              <option value="isolated">Separated</option>
            </select>
          </label>

          <div className="mt-5 rounded-2xl border border-white/[0.07] bg-black/20 p-4 text-[#858780] text-xs leading-relaxed">
            Profiles are stored inside the bot's existing instructions using a versioned FlowBots
            marker, so your own instructions remain intact and local-first behavior is preserved.
          </div>
        </div>

        <footer className="flex min-h-[72px] flex-wrap items-center gap-3 border-white/10 border-t bg-[#0A0B0C] px-5 py-4 sm:px-7">
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="rounded-xl bg-[#8EDFF7] px-4 py-2.5 font-semibold text-[#081014] text-xs hover:brightness-105 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save steering profile"}
          </button>
          {notice ? (
            <span
              className={`text-xs ${notice === "Steering saved" ? "text-[#BDF268]" : "text-red-300"}`}
              aria-live="polite"
            >
              {notice}
            </span>
          ) : null}
          <span className="ml-auto hidden max-w-[330px] text-right text-[#686A64] text-[10px] sm:block">
            Personality controls style and initiative only. Tool permissions and truthfulness
            boundaries are unchanged.
          </span>
        </footer>
      </section>
    </div>
  );
}
