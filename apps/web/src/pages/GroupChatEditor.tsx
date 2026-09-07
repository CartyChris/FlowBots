import type { Bot } from "@rakazo/contracts";
import { flowMembershipFromInstructions } from "@rakazo/core";
import { BotAvatar } from "@rakazo/ui-web";
import { useMemo, useState } from "react";

export function GroupChatEditor({
  bots,
  initialName = "",
  initialBotIds = [],
  mode = "create",
  onSave,
  onClose,
}: {
  bots: Bot[];
  initialName?: string;
  initialBotIds?: string[];
  mode?: "create" | "manage";
  onSave: (input: { name: string; botIds: string[] }) => Promise<void>;
  onClose: () => void;
}) {
  const connected = useMemo(
    () =>
      bots.filter((bot) => flowMembershipFromInstructions(bot.instructions ?? "") === "connected"),
    [bots],
  );
  const [name, setName] = useState(initialName);
  const [selected, setSelected] = useState(() => new Set(initialBotIds));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(botId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(botId)) next.delete(botId);
      else if (next.size < 12) next.add(botId);
      return next;
    });
    setError(null);
  }

  async function submit() {
    const cleanName = name.trim();
    if (!cleanName) {
      setError("Give this group a name.");
      return;
    }
    if (selected.size < 2) {
      setError("Choose at least two connected Flow bots.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({ name: cleanName, botIds: [...selected] });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save this group chat.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-black/75 p-5 backdrop-blur-sm">
      <section className="w-full max-w-[560px] overflow-hidden rounded-[24px] border border-white/10 bg-[#101012] shadow-2xl">
        <header className="flex items-start justify-between border-b border-white/[0.07] px-6 py-5">
          <div>
            <h2 className="text-[19px] font-semibold text-[#F1F1F3]">
              {mode === "create" ? "Create group chat" : "Manage group chat"}
            </h2>
            <p className="mt-1 text-[12.5px] leading-relaxed text-[#77777D]">
              Pick 2–12 connected Flow bots. Separated bots stay private and cannot join.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close group editor"
            className="rounded-lg px-2 py-1 text-[#77777D] hover:bg-white/5 hover:text-white"
          >
            ×
          </button>
        </header>

        <div className="space-y-5 px-6 py-5">
          <label className="block">
            <span className="mb-2 block text-[12px] font-medium text-[#B9B9BE]">Group name</span>
            <input
              aria-label="Group name"
              value={name}
              onChange={(event) => {
                setName(event.currentTarget.value);
                setError(null);
              }}
              placeholder="Launch Room"
              maxLength={80}
              className="w-full rounded-xl border border-white/10 bg-[#080809] px-3.5 py-3 text-[14px] text-[#EEEEF0] outline-none focus:border-[#BDF268]/45"
            />
          </label>

          <div>
            <div className="mb-2 flex items-center justify-between text-[12px]">
              <span className="font-medium text-[#B9B9BE]">Flow members</span>
              <span className="text-[#6F6F74]">{selected.size}/12 selected</span>
            </div>
            <div className="rk-scroll max-h-[330px] space-y-1.5 overflow-y-auto pr-1">
              {connected.map((bot) => {
                const checked = selected.has(bot.id);
                return (
                  <label
                    key={bot.id}
                    className="flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition"
                    style={{
                      borderColor: checked ? `${bot.color}66` : "rgba(255,255,255,0.07)",
                      background: checked ? `${bot.color}12` : "rgba(255,255,255,0.018)",
                    }}
                  >
                    <input
                      type="checkbox"
                      aria-label={bot.name}
                      checked={checked}
                      onChange={() => toggle(bot.id)}
                      className="h-4 w-4 accent-[#BDF268]"
                    />
                    <BotAvatar color={bot.color} size={31} state="idle" label={bot.name} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-medium text-[#E9E9EC]">
                        {bot.name}
                      </span>
                      <span className="block truncate text-[11.5px] text-[#77777D]">
                        {bot.title || bot.description || "Flow bot"}
                      </span>
                    </span>
                  </label>
                );
              })}
              {connected.length < 2 ? (
                <div className="rounded-xl border border-amber-300/15 bg-amber-300/[0.04] p-4 text-[12px] leading-relaxed text-[#A9A18B]">
                  Group chats need at least two bots connected to the Shared Flow. Reconnect bots in
                  Steering Studio to make them available here.
                </div>
              ) : null}
            </div>
          </div>

          {error ? (
            <div className="rounded-xl border border-red-400/15 bg-red-400/[0.05] px-3 py-2.5 text-[12px] text-red-200/80">
              {error}
            </div>
          ) : null}
        </div>

        <footer className="flex justify-end gap-2 border-t border-white/[0.07] px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-4 py-2.5 text-[12.5px] font-medium text-[#99999F] hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={saving || selected.size < 2 || !name.trim()}
            className="rounded-xl bg-[#EDEEF0] px-4 py-2.5 text-[12.5px] font-semibold text-[#111113] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? "Saving…" : mode === "create" ? "Create group" : "Save group"}
          </button>
        </footer>
      </section>
    </div>
  );
}
