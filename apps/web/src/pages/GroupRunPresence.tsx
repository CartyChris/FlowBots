import type { GroupChatActiveRun } from "@rakazo/contracts";
import { BotAvatar, botAvatarStateForPresence } from "@rakazo/ui-web";

export function GroupRunPresence({ run }: { run: GroupChatActiveRun }) {
  const state = botAvatarStateForPresence(
    run.presence?.state ?? (run.status === "queued" ? "queued" : "idle"),
  );
  return (
    <div
      data-presence={run.presence?.state ?? run.status}
      className="flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.025] py-1 pl-1 pr-2.5 text-[10.5px] text-[#A8A8AD]"
    >
      <BotAvatar color={run.botColor} size={28} state={state} label={run.botName} />
      <span>{run.botName}</span>
      <span className="text-[#A0ADA5]">
        {run.presence?.summary ?? run.status.replaceAll("_", " ")}
      </span>
    </div>
  );
}
