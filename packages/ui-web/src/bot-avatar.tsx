import { useId, useSyncExternalStore } from "react";
import { cn } from "./lib/utils.js";

export type BotAvatarState = "idle" | "thinking" | "working" | "happy" | "error" | "surprised";
export type BotAvatarVariant =
  | "orb"
  | "blob"
  | "cat"
  | "robot"
  | "spark"
  | "fox"
  | "bunny"
  | "ghost"
  | "slime"
  | "cyclops"
  | "astro"
  | "dragon"
  | "cloud"
  | "cube"
  | "skull";
export type BotAvatarEyeStyle = "classic" | "mono" | "sleepy" | "star" | "pixel";
export type BotAvatarAccessory = "none" | "antenna" | "headphones" | "crown" | "glasses" | "cap";
export type BotAvatarPattern = "solid" | "stripe" | "dots" | "circuit";
export type BotAvatarGlow = "off" | "soft" | "strong";

export type BotAvatarAppearance = {
  variant: BotAvatarVariant;
  secondaryColor: string;
  eyeStyle: BotAvatarEyeStyle;
  accessory: BotAvatarAccessory;
  pattern: BotAvatarPattern;
  glow: BotAvatarGlow;
};

export const BOT_AVATAR_VARIANTS: BotAvatarVariant[] = [
  "orb",
  "blob",
  "cat",
  "robot",
  "spark",
  "fox",
  "bunny",
  "ghost",
  "slime",
  "cyclops",
  "astro",
  "dragon",
  "cloud",
  "cube",
  "skull",
];

export const BOT_AVATAR_FACE_CHOICES = [
  { variant: "orb", label: "Orb", color: "#C1F54B", secondaryColor: "#F4FFD6" },
  { variant: "blob", label: "Blob", color: "#7E3EA1", secondaryColor: "#E1B7FF" },
  { variant: "cat", label: "Cat", color: "#88D6CD", secondaryColor: "#E5FFFB" },
  { variant: "robot", label: "Robot", color: "#68CFD2", secondaryColor: "#C9FFFF" },
  { variant: "spark", label: "Spark", color: "#EBE611", secondaryColor: "#FFF8A8" },
  { variant: "fox", label: "Fox", color: "#F59B55", secondaryColor: "#FFE0BF" },
  { variant: "bunny", label: "Bunny", color: "#D9B9FF", secondaryColor: "#FFF1FF" },
  { variant: "ghost", label: "Ghost", color: "#A6DFFF", secondaryColor: "#F1FBFF" },
  { variant: "slime", label: "Slime", color: "#69E08A", secondaryColor: "#D8FFE2" },
  { variant: "cyclops", label: "Cyclops", color: "#FF7676", secondaryColor: "#FFD1D1" },
  { variant: "astro", label: "Astro", color: "#7D91FF", secondaryColor: "#E0E6FF" },
  { variant: "dragon", label: "Dragon", color: "#43C99B", secondaryColor: "#D2FFF0" },
  { variant: "cloud", label: "Cloud", color: "#BFC7D8", secondaryColor: "#FFFFFF" },
  { variant: "cube", label: "Cube", color: "#FFB54A", secondaryColor: "#FFF0C9" },
  { variant: "skull", label: "Skull", color: "#D6D3CB", secondaryColor: "#FFFFFF" },
] as const satisfies ReadonlyArray<{
  variant: BotAvatarVariant;
  label: string;
  color: string;
  secondaryColor: string;
}>;

const DEFAULT_APPEARANCE: BotAvatarAppearance = {
  variant: "orb",
  secondaryColor: "#F4F4F1",
  eyeStyle: "classic",
  accessory: "none",
  pattern: "solid",
  glow: "off",
};

type AppearanceRegistration = {
  name: string;
  color: string;
  appearance: Partial<BotAvatarAppearance>;
};

const appearanceRegistry = new Map<string, BotAvatarAppearance>();
const appearanceListeners = new Set<() => void>();
let appearanceVersion = 0;

function registryKey(name: string | undefined, color: string) {
  return `${name ?? ""}\u0000${color.toUpperCase()}`;
}

function subscribeAppearanceRegistry(listener: () => void) {
  appearanceListeners.add(listener);
  return () => appearanceListeners.delete(listener);
}

function appearanceSnapshot() {
  return appearanceVersion;
}

export function registerBotAvatarAppearances(items: AppearanceRegistration[]) {
  const next = new Map<string, BotAvatarAppearance>();
  for (const item of items) {
    next.set(registryKey(item.name, item.color), normalizeAppearance(item.appearance, item.color));
  }

  const before = JSON.stringify([...appearanceRegistry.entries()]);
  const after = JSON.stringify([...next.entries()]);
  if (before === after) return;

  appearanceRegistry.clear();
  for (const [key, value] of next) appearanceRegistry.set(key, value);
  appearanceVersion += 1;
  for (const listener of appearanceListeners) listener();
}

function registeredAppearance(name: string | undefined, color: string) {
  return appearanceRegistry.get(registryKey(name, color));
}

export function avatarVariantForColor(color: string): BotAvatarVariant {
  const preset = BOT_AVATAR_FACE_CHOICES.find(
    (choice) => choice.color.toUpperCase() === color.toUpperCase(),
  );
  if (preset) return preset.variant;
  let hash = 0;
  for (const char of color) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return BOT_AVATAR_VARIANTS[hash % BOT_AVATAR_VARIANTS.length] ?? "orb";
}

export function appearanceForPreset(variant: BotAvatarVariant): BotAvatarAppearance {
  const preset = BOT_AVATAR_FACE_CHOICES.find((choice) => choice.variant === variant);
  return {
    ...DEFAULT_APPEARANCE,
    variant,
    secondaryColor: preset?.secondaryColor ?? DEFAULT_APPEARANCE.secondaryColor,
  };
}

export function BotAvatar({
  color,
  size = 38,
  className,
  state = "idle",
  variant,
  label,
  appearance,
}: {
  color: string;
  size?: number;
  className?: string;
  state?: BotAvatarState;
  variant?: BotAvatarVariant;
  label?: string;
  appearance?: Partial<BotAvatarAppearance>;
}) {
  useSyncExternalStore(subscribeAppearanceRegistry, appearanceSnapshot, appearanceSnapshot);
  const registryAppearance = registeredAppearance(label, color);
  const resolvedAppearance = normalizeAppearance(
    appearance ?? registryAppearance ?? { variant: variant ?? avatarVariantForColor(color) },
    color,
  );
  if (variant) resolvedAppearance.variant = variant;

  const resolvedVariant = resolvedAppearance.variant;
  const effectiveEyeStyle =
    resolvedVariant === "cyclops" && resolvedAppearance.eyeStyle === "classic"
      ? "mono"
      : resolvedAppearance.eyeStyle;
  const eyeY = state === "happy" ? 48 : state === "surprised" ? 44 : 46;
  const eyeScaleY = state === "happy" ? 0.55 : state === "error" ? 0.72 : 1;
  const pupil = state === "surprised" ? 4.4 : 3.4;
  const expressionClass = state === "working" || state === "thinking" ? "rk-bot-busy" : "";
  const accessibleLabel = label ? `${label} — ${state}` : undefined;
  const showStatusEffects = size >= 30;
  const patternId = `rk-bot-pattern-${useId().replace(/:/g, "")}`;
  const shellFill = resolvedAppearance.pattern === "solid" ? color : `url(#${patternId})`;

  return (
    <span
      className={cn(
        "rk-bot-avatar relative inline-grid shrink-0 place-items-center",
        expressionClass,
        resolvedAppearance.glow !== "off" ? "rk-bot-glow" : "",
        className,
      )}
      data-bot-state={state}
      data-bot-variant={resolvedVariant}
      data-bot-eye-style={effectiveEyeStyle}
      data-bot-pattern={resolvedAppearance.pattern}
      data-bot-glow={resolvedAppearance.glow}
      data-bot-accessory={resolvedAppearance.accessory}
      role="img"
      aria-label={accessibleLabel}
      aria-hidden={accessibleLabel ? undefined : true}
      title={accessibleLabel ? `${label} · ${state}` : undefined}
      style={
        {
          width: size,
          height: size,
          flex: "none",
          "--rk-bot-primary": color,
          "--rk-bot-secondary": resolvedAppearance.secondaryColor,
        } as React.CSSProperties
      }
    >
      <svg
        viewBox="0 0 100 100"
        width={size}
        height={size}
        aria-hidden="true"
        className="overflow-visible"
      >
        <defs>
          <pattern id={patternId} width="14" height="14" patternUnits="userSpaceOnUse">
            <rect width="14" height="14" fill={color} />
            {resolvedAppearance.pattern === "stripe" ? (
              <path
                d="M-3 14 14-3M4 18 18 4"
                stroke={resolvedAppearance.secondaryColor}
                strokeWidth="4"
                opacity=".34"
              />
            ) : null}
            {resolvedAppearance.pattern === "dots" ? (
              <circle cx="7" cy="7" r="2.2" fill={resolvedAppearance.secondaryColor} opacity=".5" />
            ) : null}
            {resolvedAppearance.pattern === "circuit" ? (
              <path
                d="M1 4h5v5h7M9 1v4M4 10v3"
                fill="none"
                stroke={resolvedAppearance.secondaryColor}
                strokeWidth="1.2"
                opacity=".48"
              />
            ) : null}
          </pattern>
        </defs>

        <VariantBackDetails
          variant={resolvedVariant}
          fill={shellFill}
          primary={color}
          secondary={resolvedAppearance.secondaryColor}
        />

        <path
          d={avatarShape(resolvedVariant)}
          fill={shellFill}
          stroke={resolvedAppearance.secondaryColor}
          strokeWidth={resolvedVariant === "cloud" ? 1.8 : 1.2}
          strokeOpacity=".28"
          className={cn(
            "rk-bot-shell",
            resolvedVariant === "spark" ? "rk-bot-spark" : "",
            resolvedAppearance.pattern !== "solid" ? "rk-bot-pattern" : "",
          )}
        />

        <VariantFrontDetails
          variant={resolvedVariant}
          secondary={resolvedAppearance.secondaryColor}
        />

        <rect
          x={resolvedVariant === "cloud" ? 20 : 19}
          y="30"
          width={resolvedVariant === "cloud" ? 60 : 62}
          height="38"
          rx={resolvedVariant === "robot" || resolvedVariant === "cube" ? 10 : 19}
          fill="rgba(9,9,12,.78)"
          stroke={resolvedAppearance.secondaryColor}
          strokeWidth="1"
          strokeOpacity=".18"
          className="rk-bot-visor"
        />

        <EyeLayer
          style={effectiveEyeStyle}
          state={state}
          eyeY={eyeY}
          eyeScaleY={eyeScaleY}
          pupil={pupil}
          secondary={resolvedAppearance.secondaryColor}
        />

        {state === "surprised" ? (
          <ellipse cx="50" cy="59" rx="4" ry="5" fill="#fff" opacity=".86" />
        ) : state === "error" ? (
          <path d="M43 59h14" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity=".86" />
        ) : state === "happy" ? (
          <path
            d="M43 57c2.6 4 11.4 4 14 0"
            fill="none"
            stroke="#fff"
            strokeWidth="2.7"
            strokeLinecap="round"
            opacity=".9"
          />
        ) : null}

        <AccessoryLayer
          accessory={resolvedAppearance.accessory}
          primary={color}
          secondary={resolvedAppearance.secondaryColor}
        />

        {state === "working" ? (
          <g className="rk-bot-work-sparks" fill="#fff">
            <circle cx="85" cy="22" r="2.4" />
            <circle cx="91" cy="31" r="1.5" />
            <circle cx="82" cy="13" r="1.2" />
          </g>
        ) : null}
      </svg>

      {showStatusEffects && state === "working" ? (
        <span className="rk-bot-emote-stage" aria-hidden="true">
          <span className="rk-bot-emote-cycle rk-bot-emote-keyboard">⌨</span>
          <span className="rk-bot-emote-cycle rk-bot-emote-code">{"</>"}</span>
          <span className="rk-bot-emote-cycle rk-bot-emote-file">▧</span>
        </span>
      ) : null}

      {showStatusEffects && state === "thinking" ? (
        <span className="rk-bot-thought-orbit" aria-hidden="true">
          <span>•</span>
          <span>✦</span>
          <span>?</span>
        </span>
      ) : null}

      {showStatusEffects && state === "happy" ? (
        <span className="rk-bot-success-burst" aria-hidden="true">
          <span>✦</span>
          <span>★</span>
          <span>+</span>
        </span>
      ) : null}

      {(state === "working" || state === "thinking") && showStatusEffects ? (
        <span
          className="rk-bot-presence absolute -right-[1px] -bottom-[1px] h-[8px] w-[8px] rounded-full border-2 border-[#0D0D0E] bg-[#79E39C]"
          aria-hidden="true"
        />
      ) : null}
    </span>
  );
}

function normalizeAppearance(
  appearance: Partial<BotAvatarAppearance>,
  color: string,
): BotAvatarAppearance {
  const variant = appearance.variant ?? avatarVariantForColor(color);
  const preset = BOT_AVATAR_FACE_CHOICES.find((choice) => choice.variant === variant);
  return {
    variant,
    secondaryColor:
      appearance.secondaryColor ?? preset?.secondaryColor ?? DEFAULT_APPEARANCE.secondaryColor,
    eyeStyle: appearance.eyeStyle ?? DEFAULT_APPEARANCE.eyeStyle,
    accessory: appearance.accessory ?? DEFAULT_APPEARANCE.accessory,
    pattern: appearance.pattern ?? DEFAULT_APPEARANCE.pattern,
    glow: appearance.glow ?? DEFAULT_APPEARANCE.glow,
  };
}

function EyeLayer({
  style,
  state,
  eyeY,
  eyeScaleY,
  pupil,
  secondary,
}: {
  style: BotAvatarEyeStyle;
  state: BotAvatarState;
  eyeY: number;
  eyeScaleY: number;
  pupil: number;
  secondary: string;
}) {
  if (style === "mono") {
    return (
      <g className="rk-bot-eyes rk-bot-gaze" style={{ transformOrigin: "50px 47px" }}>
        <ellipse cx="50" cy={eyeY} rx="12" ry={9 * eyeScaleY} fill="#fff" />
        <circle cx="51" cy={eyeY} r={pupil + 1.8} fill="#17171A" className="rk-bot-pupil" />
        <circle cx="48.8" cy={eyeY - 2} r="1.6" fill="#fff" opacity=".9" />
      </g>
    );
  }

  if (style === "sleepy") {
    return (
      <g className="rk-bot-eyes rk-bot-gaze" fill="none" stroke="#fff" strokeWidth="3.4">
        <path d={`M30 ${eyeY + 2}c4-5 10-5 14 0`} strokeLinecap="round" />
        <path d={`M56 ${eyeY + 2}c4-5 10-5 14 0`} strokeLinecap="round" />
      </g>
    );
  }

  if (style === "pixel") {
    return (
      <g className="rk-bot-eyes rk-bot-gaze">
        <rect x="30" y={eyeY - 6} width="13" height="12" rx="2" fill="#fff" />
        <rect x="57" y={eyeY - 6} width="13" height="12" rx="2" fill="#fff" />
        <rect x="35" y={eyeY - 1} width="5" height="5" fill="#17171A" />
        <rect x="62" y={eyeY - 1} width="5" height="5" fill="#17171A" />
      </g>
    );
  }

  if (style === "star") {
    return (
      <g className="rk-bot-eyes rk-bot-gaze" fill={secondary}>
        <path d={`M37 ${eyeY - 8}l2.4 5 5.6.8-4 4 .9 5.6-4.9-2.6-4.9 2.6.9-5.6-4-4 5.6-.8Z`} />
        <path d={`M63 ${eyeY - 8}l2.4 5 5.6.8-4 4 .9 5.6-4.9-2.6-4.9 2.6.9-5.6-4-4 5.6-.8Z`} />
      </g>
    );
  }

  return (
    <g className="rk-bot-eyes" style={{ transformOrigin: "50px 47px" }}>
      <g className="rk-bot-gaze">
        <ellipse
          cx="37"
          cy={eyeY}
          rx="7"
          ry={7 * eyeScaleY}
          fill="#fff"
          className="rk-bot-eye rk-bot-eye-left"
        />
        <ellipse
          cx="63"
          cy={eyeY}
          rx="7"
          ry={7 * eyeScaleY}
          fill="#fff"
          className="rk-bot-eye rk-bot-eye-right"
        />
        <circle cx="38" cy={eyeY} r={pupil} fill="#17171A" className="rk-bot-pupil" />
        <circle cx="64" cy={eyeY} r={pupil} fill="#17171A" className="rk-bot-pupil" />
        <circle cx="36.8" cy={eyeY - 1.3} r="1.15" fill="#fff" opacity=".9" />
        <circle cx="62.8" cy={eyeY - 1.3} r="1.15" fill="#fff" opacity=".9" />
      </g>
    </g>
  );
}

function AccessoryLayer({
  accessory,
  primary,
  secondary,
}: {
  accessory: BotAvatarAccessory;
  primary: string;
  secondary: string;
}) {
  if (accessory === "none") return null;
  if (accessory === "antenna") {
    return (
      <g className="rk-bot-accessory" stroke={secondary} strokeWidth="3" strokeLinecap="round">
        <path d="M50 12V2" />
        <circle cx="50" cy="-1" r="4" fill={secondary} stroke="none" />
      </g>
    );
  }
  if (accessory === "headphones") {
    return (
      <g className="rk-bot-accessory" fill="none" stroke={secondary} strokeWidth="4">
        <path d="M18 46c0-20 12-31 32-31s32 11 32 31" />
        <rect x="12" y="43" width="10" height="22" rx="4" fill={primary} />
        <rect x="78" y="43" width="10" height="22" rx="4" fill={primary} />
      </g>
    );
  }
  if (accessory === "crown") {
    return (
      <path
        className="rk-bot-accessory"
        d="m28 20 5-15 16 11L61 3l7 16Z"
        fill={secondary}
        stroke="rgba(9,9,12,.35)"
        strokeWidth="1.5"
      />
    );
  }
  if (accessory === "glasses") {
    return (
      <g className="rk-bot-accessory" fill="none" stroke={secondary} strokeWidth="2.6">
        <circle cx="37" cy="47" r="12" />
        <circle cx="63" cy="47" r="12" />
        <path d="M49 47h2M25 44l-9-4M75 44l9-4" />
      </g>
    );
  }
  return (
    <g className="rk-bot-accessory">
      <path d="M25 25c5-17 45-20 53-2L55 26Z" fill={secondary} />
      <path d="M53 24h31c-5 5-17 8-30 7Z" fill={secondary} opacity=".72" />
    </g>
  );
}

function VariantBackDetails({
  variant,
  fill,
  primary,
  secondary,
}: {
  variant: BotAvatarVariant;
  fill: string;
  primary: string;
  secondary: string;
}) {
  if (variant === "cat") {
    return (
      <g fill={fill} className="rk-bot-ears">
        <path d="M18 31 22 7 40 22Z" />
        <path d="m82 31-4-24-18 15Z" />
      </g>
    );
  }
  if (variant === "fox") {
    return (
      <g className="rk-bot-ears">
        <path d="M13 34 19 2 42 24Z" fill={primary} />
        <path d="m87 34-6-32-23 22Z" fill={primary} />
        <path d="M20 24 22 10 33 22Z" fill={secondary} opacity=".7" />
        <path d="m80 24-2-14-11 12Z" fill={secondary} opacity=".7" />
      </g>
    );
  }
  if (variant === "bunny") {
    return (
      <g className="rk-bot-ears">
        <ellipse cx="34" cy="12" rx="10" ry="24" fill={primary} transform="rotate(-9 34 12)" />
        <ellipse cx="66" cy="12" rx="10" ry="24" fill={primary} transform="rotate(9 66 12)" />
        <ellipse cx="34" cy="12" rx="4" ry="17" fill={secondary} opacity=".55" transform="rotate(-9 34 12)" />
        <ellipse cx="66" cy="12" rx="4" ry="17" fill={secondary} opacity=".55" transform="rotate(9 66 12)" />
      </g>
    );
  }
  if (variant === "dragon") {
    return (
      <g className="rk-bot-ears" fill={primary} stroke={secondary} strokeWidth="1.2" strokeOpacity=".45">
        <path d="M20 31 14 7 37 23Z" />
        <path d="m80 31 6-24-23 16Z" />
        <path d="M42 12 50 0l8 12Z" />
      </g>
    );
  }
  if (variant === "astro") {
    return (
      <g fill="none" stroke={secondary} strokeWidth="5" opacity=".6">
        <circle cx="50" cy="50" r="48" />
        <path d="M7 49h8M85 49h8" />
      </g>
    );
  }
  return null;
}

function VariantFrontDetails({
  variant,
  secondary,
}: {
  variant: BotAvatarVariant;
  secondary: string;
}) {
  if (variant === "cube") {
    return (
      <g fill="none" stroke={secondary} strokeWidth="1.5" opacity=".35">
        <path d="M18 26 50 11l32 15M50 11v16M18 74l32 15 32-15" />
      </g>
    );
  }
  if (variant === "skull") {
    return (
      <g fill={secondary} opacity=".32">
        <circle cx="30" cy="70" r="5" />
        <circle cx="70" cy="70" r="5" />
        <rect x="40" y="78" width="20" height="7" rx="2" />
      </g>
    );
  }
  if (variant === "fox") {
    return <path d="m45 66 5 5 5-5-5-3Z" fill={secondary} opacity=".75" />;
  }
  if (variant === "slime") {
    return (
      <g fill={secondary} opacity=".28">
        <circle cx="28" cy="72" r="4" />
        <circle cx="73" cy="75" r="3" />
      </g>
    );
  }
  return null;
}

function avatarShape(variant: BotAvatarVariant): string {
  if (variant === "blob")
    return "M51 5C72 5 91 21 93 43c2 22-7 46-30 51-22 5-47-1-55-23C0 50 6 24 26 12 34 7 42 5 51 5Z";
  if (variant === "robot" || variant === "cube")
    return "M25 9h50c10 0 18 8 18 18v48c0 10-8 18-18 18H25C15 93 7 85 7 75V27C7 17 15 9 25 9Z";
  if (variant === "spark")
    return "M50 2 61 31 92 28 69 50 91 73 61 69 50 98 39 69 9 73 31 50 8 28 39 31Z";
  if (variant === "ghost")
    return "M50 6C25 6 10 23 10 47v45l12-10 11 10 10-10 10 10 11-10 14 10V47C78 23 73 6 50 6Z";
  if (variant === "slime")
    return "M50 8C28 8 12 25 12 47v34c0 8 7 13 14 9 6-3 5-12 11-12 8 0 5 17 16 17 12 0 8-15 18-15 7 0 5 11 11 11 5 0 8-5 8-12V47C90 25 73 8 50 8Z";
  if (variant === "cloud")
    return "M28 78C14 78 5 68 7 55c2-11 11-18 22-18 5-17 19-27 35-22 10 3 17 11 19 22 11 1 19 9 19 20 0 12-10 21-23 21Z";
  if (variant === "skull")
    return "M50 6C26 6 10 22 10 45c0 17 8 29 21 35v12h38V80c13-6 21-18 21-35C90 22 74 6 50 6Z";
  if (variant === "astro")
    return "M50 7c25 0 42 16 42 41 0 24-17 43-42 43S8 72 8 48C8 23 25 7 50 7Z";
  return "M50 5a45 45 0 1 1 0 90 45 45 0 0 1 0-90Z";
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <BotAvatar color="#30B6A0" size={44} state="happy" label="FlowBots" />
      <span className="font-[Aeonik,ui-sans-serif] text-[28px] tracking-tight text-[#1B1B1E]">
        FlowBots
      </span>
    </div>
  );
}
