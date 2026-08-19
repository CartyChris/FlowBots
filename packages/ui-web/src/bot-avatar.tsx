import { cn } from "./lib/utils.js";

export type BotAvatarState = "idle" | "thinking" | "working" | "happy" | "error" | "surprised";
export type BotAvatarVariant = "orb" | "blob" | "cat" | "robot" | "spark";

export const BOT_AVATAR_VARIANTS: BotAvatarVariant[] = ["orb", "blob", "cat", "robot", "spark"];

export const BOT_AVATAR_FACE_CHOICES = [
  { variant: "orb", label: "Orb", color: "#C1F54B" },
  { variant: "blob", label: "Blob", color: "#7E3EA1" },
  { variant: "cat", label: "Cat", color: "#88D6CD" },
  { variant: "robot", label: "Robot", color: "#68CFD2" },
  { variant: "spark", label: "Spark", color: "#EBE611" },
] as const satisfies ReadonlyArray<{
  variant: BotAvatarVariant;
  label: string;
  color: string;
}>;

export function avatarVariantForColor(color: string): BotAvatarVariant {
  let hash = 0;
  for (const char of color) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return BOT_AVATAR_VARIANTS[hash % BOT_AVATAR_VARIANTS.length] ?? "orb";
}

export function BotAvatar({
  color,
  size = 38,
  className,
  state = "idle",
  variant,
  label,
}: {
  color: string;
  size?: number;
  className?: string;
  state?: BotAvatarState;
  variant?: BotAvatarVariant;
  label?: string;
}) {
  const resolvedVariant = variant ?? avatarVariantForColor(color);
  const shape = avatarShape(resolvedVariant);
  const eyeY = state === "happy" ? 48 : state === "surprised" ? 44 : 46;
  const eyeScaleY = state === "happy" ? 0.55 : state === "error" ? 0.72 : 1;
  const pupil = state === "surprised" ? 4.4 : 3.4;
  const expressionClass = state === "working" || state === "thinking" ? "rk-bot-busy" : "";
  const accessibleLabel = label ? `${label} — ${state}` : undefined;

  return (
    <span
      className={cn(
        "rk-bot-avatar relative inline-grid shrink-0 place-items-center",
        expressionClass,
        className,
      )}
      data-bot-state={state}
      data-bot-variant={resolvedVariant}
      role={accessibleLabel ? "img" : undefined}
      aria-label={accessibleLabel}
      aria-hidden={accessibleLabel ? undefined : true}
      title={accessibleLabel ? `${label} · ${state}` : undefined}
      style={{ width: size, height: size, flex: "none" }}
    >
      <svg
        viewBox="0 0 100 100"
        width={size}
        height={size}
        aria-hidden="true"
        className="overflow-visible"
      >
        {resolvedVariant === "cat" ? (
          <g fill={color} className="rk-bot-ears">
            <path d="M18 31 22 7 40 22Z" />
            <path d="m82 31-4-24-18 15Z" />
          </g>
        ) : null}
        {resolvedVariant === "spark" ? (
          <path
            d="M50 2 61 31 92 28 69 50 91 73 61 69 50 98 39 69 9 73 31 50 8 28 39 31Z"
            fill={color}
            className="rk-bot-shell rk-bot-spark"
          />
        ) : (
          <path d={shape} fill={color} className="rk-bot-shell" />
        )}

        <rect
          x="19"
          y="30"
          width="62"
          height="38"
          rx={resolvedVariant === "robot" ? 10 : 19}
          fill="rgba(9,9,12,.78)"
          className="rk-bot-visor"
        />

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

        {state === "working" ? (
          <g className="rk-bot-work-sparks" fill="#fff">
            <circle cx="85" cy="22" r="2.4" />
            <circle cx="91" cy="31" r="1.5" />
            <circle cx="82" cy="13" r="1.2" />
          </g>
        ) : null}
      </svg>
      {(state === "working" || state === "thinking") && size >= 30 ? (
        <span
          className="rk-bot-presence absolute -right-[1px] -bottom-[1px] h-[8px] w-[8px] rounded-full border-2 border-[#0D0D0E] bg-[#79E39C]"
          aria-hidden="true"
        />
      ) : null}
    </span>
  );
}

function avatarShape(variant: BotAvatarVariant): string {
  if (variant === "blob")
    return "M51 5C72 5 91 21 93 43c2 22-7 46-30 51-22 5-47-1-55-23C0 50 6 24 26 12 34 7 42 5 51 5Z";
  if (variant === "robot")
    return "M25 9h50c10 0 18 8 18 18v48c0 10-8 18-18 18H25C15 93 7 85 7 75V27C7 17 15 9 25 9Z";
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
