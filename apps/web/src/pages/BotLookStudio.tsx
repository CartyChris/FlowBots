import type {
  Bot,
  BotAccessory,
  BotAppearance,
  BotEyeStyle,
  BotGlow,
  BotPattern,
} from "@rakazo/contracts";
import {
  appearanceForPreset,
  avatarVariantForColor,
  BOT_AVATAR_FACE_CHOICES,
  BotAvatar,
  type BotAvatarState,
} from "@rakazo/ui-web";
import { type ReactNode, useMemo, useState } from "react";

const EYE_STYLES: Array<{ id: BotEyeStyle; label: string; glyph: string }> = [
  { id: "classic", label: "Classic", glyph: "••" },
  { id: "mono", label: "Mono", glyph: "●" },
  { id: "sleepy", label: "Sleepy", glyph: "⌒⌒" },
  { id: "star", label: "Stars", glyph: "✦✦" },
  { id: "pixel", label: "Pixel", glyph: "▪▪" },
];

const ACCESSORIES: Array<{ id: BotAccessory; label: string; glyph: string }> = [
  { id: "none", label: "None", glyph: "—" },
  { id: "antenna", label: "Antenna", glyph: "⌁" },
  { id: "headphones", label: "Headphones", glyph: "◖◗" },
  { id: "crown", label: "Crown", glyph: "♛" },
  { id: "glasses", label: "Glasses", glyph: "◎◎" },
  { id: "cap", label: "Cap", glyph: "⌒" },
];

const PATTERNS: Array<{ id: BotPattern; label: string; glyph: string }> = [
  { id: "solid", label: "Solid", glyph: "●" },
  { id: "stripe", label: "Stripe", glyph: "///" },
  { id: "dots", label: "Dots", glyph: "⠿" },
  { id: "circuit", label: "Circuit", glyph: "⌗" },
];

const GLOWS: Array<{ id: BotGlow; label: string }> = [
  { id: "off", label: "Off" },
  { id: "soft", label: "Soft" },
  { id: "strong", label: "Strong" },
];

const PREVIEW_STATES: Array<{ id: BotAvatarState; label: string }> = [
  { id: "idle", label: "Idle" },
  { id: "thinking", label: "Thinking" },
  { id: "working", label: "Working" },
  { id: "happy", label: "Done" },
  { id: "error", label: "Error" },
];

export function BotLookStudio({
  bot,
  appearance,
  onSave,
  onClose,
}: {
  bot: Bot;
  appearance?: BotAppearance;
  onSave: (input: { color: string; appearance: BotAppearance }) => Promise<void>;
  onClose: () => void;
}) {
  const fallback = useMemo(
    () => appearanceForPreset(avatarVariantForColor(bot.color)) satisfies BotAppearance,
    [bot.color],
  );
  const [primaryColor, setPrimaryColor] = useState(bot.color);
  const [draft, setDraft] = useState<BotAppearance>(appearance ?? fallback);
  const [previewState, setPreviewState] = useState<BotAvatarState>("working");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  function choosePreset(index: number) {
    const preset = BOT_AVATAR_FACE_CHOICES[index];
    if (!preset) return;
    setPrimaryColor(preset.color);
    setDraft((current) => ({
      ...current,
      variant: preset.variant,
      secondaryColor: preset.secondaryColor,
    }));
    setNotice(null);
  }

  function randomize() {
    const preset = BOT_AVATAR_FACE_CHOICES[Math.floor(Math.random() * BOT_AVATAR_FACE_CHOICES.length)];
    const eye = EYE_STYLES[Math.floor(Math.random() * EYE_STYLES.length)];
    const accessory = ACCESSORIES[Math.floor(Math.random() * ACCESSORIES.length)];
    const pattern = PATTERNS[Math.floor(Math.random() * PATTERNS.length)];
    const glow = GLOWS[Math.floor(Math.random() * GLOWS.length)];
    if (!preset || !eye || !accessory || !pattern || !glow) return;
    setPrimaryColor(preset.color);
    setDraft({
      variant: preset.variant,
      secondaryColor: preset.secondaryColor,
      eyeStyle: eye.id,
      accessory: accessory.id,
      pattern: pattern.id,
      glow: glow.id,
    });
    setNotice("Randomized a new look. Nothing is saved yet.");
  }

  async function save() {
    setSaving(true);
    setNotice(null);
    try {
      await onSave({ color: primaryColor, appearance: draft });
      setNotice("Look saved. Chat and office avatars are synced.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not save this look.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[96] flex items-center justify-center bg-black/80 p-3 backdrop-blur-md sm:p-6">
      <div className="flex max-h-[96vh] w-full max-w-[1180px] flex-col overflow-hidden rounded-[30px] border border-white/10 bg-[#0D0E10] text-[#F5F5F1] shadow-[0_40px_120px_rgba(0,0,0,.7)]">
        <header className="flex items-center gap-4 border-white/10 border-b px-5 py-4 sm:px-7">
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-[#BDF268] text-[10px] uppercase tracking-[0.24em]">
              FlowBots identity lab
            </p>
            <h2 className="mt-1 truncate font-semibold text-2xl tracking-tight">
              Look Studio · {bot.name}
            </h2>
            <p className="mt-1 text-[#858680] text-xs">
              Build one persistent identity for chat, the Virtual Office, and live work states.
            </p>
          </div>
          <button
            type="button"
            onClick={randomize}
            className="hidden rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 font-medium text-[#C7C8C2] text-xs hover:bg-white/[0.08] sm:block"
          >
            ✦ Randomize
          </button>
          <button
            type="button"
            aria-label="Close Look Studio"
            onClick={onClose}
            className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-lg hover:bg-white/[0.08]"
          >
            ×
          </button>
        </header>

        <div className="grid min-h-0 flex-1 lg:grid-cols-[390px_1fr]">
          <aside className="relative overflow-hidden border-white/10 border-b bg-[#090A0B] p-5 lg:border-r lg:border-b-0 sm:p-7">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 opacity-70"
              style={{
                background: `radial-gradient(circle at 50% 32%, ${draft.secondaryColor}26, transparent 30%), radial-gradient(circle at 50% 46%, ${primaryColor}1f, transparent 45%)`,
              }}
            />
            <div className="relative flex h-full min-h-[420px] flex-col">
              <div className="flex flex-wrap gap-2">
                {PREVIEW_STATES.map((state) => (
                  <button
                    key={state.id}
                    type="button"
                    onClick={() => setPreviewState(state.id)}
                    className={`rounded-full border px-2.5 py-1 text-[9px] uppercase tracking-[0.12em] ${
                      previewState === state.id
                        ? "border-white/25 bg-white/10 text-white"
                        : "border-white/[0.07] bg-black/20 text-[#676863] hover:text-[#B8B9B3]"
                    }`}
                  >
                    {state.label}
                  </button>
                ))}
              </div>

              <div className="flex flex-1 flex-col items-center justify-center py-8">
                <div className="relative grid h-[245px] w-[245px] place-items-center rounded-[54px] border border-white/[0.08] bg-black/25 shadow-[inset_0_1px_rgba(255,255,255,.04)]">
                  <div
                    aria-hidden="true"
                    className="absolute inset-5 rounded-[44px] blur-3xl"
                    style={{ backgroundColor: `${draft.secondaryColor}16` }}
                  />
                  <BotAvatar
                    color={primaryColor}
                    size={170}
                    state={previewState}
                    appearance={draft}
                    label={`${bot.name} preview`}
                  />
                </div>
                <div className="relative mt-5 h-3 w-[210px] rounded-[50%] bg-black/80 blur-sm" />
                <p className="mt-5 font-semibold text-lg">{bot.name}</p>
                <p className="mt-1 max-w-[300px] truncate text-[#777872] text-xs">
                  {bot.title || "FlowBots employee"}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-3 text-[10px]">
                <LookDatum label="Body" value={draft.variant} />
                <LookDatum label="Eyes" value={draft.eyeStyle} />
                <LookDatum label="Accessory" value={draft.accessory} />
                <LookDatum label="Surface" value={`${draft.pattern} · ${draft.glow} glow`} />
              </div>
            </div>
          </aside>

          <main className="rk-scroll min-h-0 overflow-y-auto p-5 sm:p-7">
            <EditorSection
              eyebrow="01 · Base character"
              title="15 bot types"
              detail="The original five remain intact; ten new silhouettes add much stronger personality."
            >
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {BOT_AVATAR_FACE_CHOICES.map((preset, index) => {
                  const selected = draft.variant === preset.variant;
                  return (
                    <button
                      key={preset.variant}
                      type="button"
                      aria-label={`Use ${preset.label} bot type`}
                      aria-pressed={selected}
                      onClick={() => choosePreset(index)}
                      className={`group rounded-2xl border p-2.5 text-center transition ${
                        selected
                          ? "border-[#BDF268]/55 bg-[#BDF268]/10"
                          : "border-white/[0.07] bg-white/[0.025] hover:border-white/15 hover:bg-white/[0.05]"
                      }`}
                    >
                      <div className="mx-auto grid h-[62px] w-[62px] place-items-center rounded-xl bg-black/25">
                        <BotAvatar
                          color={preset.color}
                          size={48}
                          variant={preset.variant}
                          state="idle"
                        />
                      </div>
                      <span className="mt-2 block truncate font-medium text-[10px] text-[#B8B9B3]">
                        {preset.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </EditorSection>

            <EditorSection
              eyebrow="02 · Palette"
              title="Custom color DNA"
              detail="Primary drives the body. Secondary colors the details, patterns, accessories, and glow."
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <ColorControl
                  label="Primary"
                  value={primaryColor}
                  onChange={(value) => setPrimaryColor(value)}
                />
                <ColorControl
                  label="Secondary"
                  value={draft.secondaryColor}
                  onChange={(value) =>
                    setDraft((current) => ({ ...current, secondaryColor: value }))
                  }
                />
              </div>
            </EditorSection>

            <EditorSection eyebrow="03 · Expression" title="Eye system">
              <ChoiceGrid
                choices={EYE_STYLES}
                value={draft.eyeStyle}
                onChange={(eyeStyle) => setDraft((current) => ({ ...current, eyeStyle }))}
              />
            </EditorSection>

            <EditorSection eyebrow="04 · Personality" title="Accessories">
              <ChoiceGrid
                choices={ACCESSORIES}
                value={draft.accessory}
                onChange={(accessory) => setDraft((current) => ({ ...current, accessory }))}
              />
            </EditorSection>

            <EditorSection eyebrow="05 · Material" title="Surface pattern">
              <ChoiceGrid
                choices={PATTERNS}
                value={draft.pattern}
                onChange={(pattern) => setDraft((current) => ({ ...current, pattern }))}
              />
            </EditorSection>

            <EditorSection eyebrow="06 · Presence" title="Ambient glow">
              <div className="grid grid-cols-3 gap-2">
                {GLOWS.map((glow) => (
                  <button
                    key={glow.id}
                    type="button"
                    aria-pressed={draft.glow === glow.id}
                    onClick={() => setDraft((current) => ({ ...current, glow: glow.id }))}
                    className={`rounded-xl border px-3 py-3 font-medium text-xs ${
                      draft.glow === glow.id
                        ? "border-[#8EDFF7]/55 bg-[#8EDFF7]/10 text-[#D8F5FE]"
                        : "border-white/[0.07] bg-white/[0.025] text-[#8C8D87] hover:bg-white/[0.05]"
                    }`}
                  >
                    {glow.label}
                  </button>
                ))}
              </div>
            </EditorSection>

            <div className="sticky bottom-0 mt-6 flex flex-wrap items-center gap-3 border-white/10 border-t bg-[#0D0E10]/95 pt-4 pb-1 backdrop-blur-xl">
              <button
                type="button"
                onClick={() => {
                  setPrimaryColor(bot.color);
                  setDraft(appearance ?? fallback);
                  setNotice("Reverted the editor to the currently saved look.");
                }}
                className="rounded-xl border border-white/10 px-4 py-2.5 font-medium text-[#8B8C86] text-xs hover:bg-white/[0.04]"
              >
                Revert changes
              </button>
              <button
                type="button"
                onClick={randomize}
                className="rounded-xl border border-white/10 px-4 py-2.5 font-medium text-[#B8B9B3] text-xs hover:bg-white/[0.04] sm:hidden"
              >
                ✦ Randomize
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void save()}
                className="ml-auto rounded-xl bg-[#BDF268] px-5 py-2.5 font-semibold text-[#11140B] text-xs shadow-[0_8px_25px_rgba(189,242,104,.14)] hover:brightness-105 disabled:opacity-45"
              >
                {saving ? "Saving look…" : "Save bot look"}
              </button>
              {notice ? (
                <p role="status" className="w-full text-[#858680] text-[10.5px]">
                  {notice}
                </p>
              ) : null}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

function EditorSection({
  eyebrow,
  title,
  detail,
  children,
}: {
  eyebrow: string;
  title: string;
  detail?: string;
  children: ReactNode;
}) {
  return (
    <section className="border-white/[0.07] border-b py-5 first:pt-0 last:border-0">
      <p className="font-semibold text-[#696A64] text-[9px] uppercase tracking-[0.2em]">{eyebrow}</p>
      <h3 className="mt-1 font-semibold text-base">{title}</h3>
      {detail ? <p className="mt-1 text-[#777872] text-[11px] leading-5">{detail}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function ChoiceGrid<T extends string>({
  choices,
  value,
  onChange,
}: {
  choices: Array<{ id: T; label: string; glyph: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {choices.map((choice) => (
        <button
          key={choice.id}
          type="button"
          aria-pressed={value === choice.id}
          onClick={() => onChange(choice.id)}
          className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left ${
            value === choice.id
              ? "border-[#D8C5FF]/50 bg-[#D8C5FF]/10 text-[#F0E8FF]"
              : "border-white/[0.07] bg-white/[0.025] text-[#8C8D87] hover:bg-white/[0.05]"
          }`}
        >
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-black/25 font-mono text-[11px]">
            {choice.glyph}
          </span>
          <span className="truncate font-medium text-xs">{choice.label}</span>
        </button>
      ))}
    </div>
  );
}

function ColorControl({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.025] p-3 text-[#8D8E88] text-xs">
      <input
        type="color"
        aria-label={`${label} bot color`}
        value={value}
        onChange={(event) => onChange(event.target.value.toUpperCase())}
        className="h-10 w-12 cursor-pointer rounded-lg border-0 bg-transparent p-0"
      />
      <span className="min-w-0 flex-1">
        <span className="block font-medium text-[#C6C7C1]">{label}</span>
        <span className="mt-0.5 block font-mono text-[10px]">{value.toUpperCase()}</span>
      </span>
    </label>
  );
}

function LookDatum({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <span className="block text-[#5E5F5A] uppercase tracking-[0.12em]">{label}</span>
      <span className="mt-0.5 block truncate font-medium text-[#B6B7B1] capitalize">{value}</span>
    </div>
  );
}
