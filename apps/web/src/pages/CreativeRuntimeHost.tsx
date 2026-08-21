import type { Bot, CapabilityInstall } from "@rakazo/contracts";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { rpc } from "../lib/rpc";
import { extensionInstructionsForBot } from "./github-extensions.js";
import { VirtualOfficeOverlay } from "./VirtualOfficeOverlay.js";
import { WorkbenchOverlay } from "./WorkbenchOverlay.js";

export function CreativeRuntimeHost() {
  const { botId } = useParams();
  const navigate = useNavigate();
  const [bots, setBots] = useState<Bot[]>([]);
  const [capabilities, setCapabilities] = useState<CapabilityInstall[]>([]);
  const [officeOpen, setOfficeOpen] = useState(false);
  const [workbenchBotId, setWorkbenchBotId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeBot = useMemo(
    () => bots.find((bot) => bot.id === (workbenchBotId ?? botId)) ?? bots[0],
    [bots, botId, workbenchBotId],
  );
  const extensionInstructions = useMemo(
    () => (activeBot ? extensionInstructionsForBot(capabilities, activeBot.id) : []),
    [capabilities, activeBot],
  );

  async function refresh() {
    const [nextBots, nextCapabilities] = await Promise.all([
      rpc.bots.list(),
      rpc.capabilities.list(),
    ]);
    setBots(nextBots);
    setCapabilities(nextCapabilities);
    return nextBots;
  }

  useEffect(() => {
    if (!officeOpen) return;
    void refresh().catch(() => undefined);
    const timer = window.setInterval(() => void refresh().catch(() => undefined), 4_000);
    return () => window.clearInterval(timer);
  }, [officeOpen]);

  async function openOffice() {
    setLoading(true);
    setError(null);
    try {
      await refresh();
      setOfficeOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open the virtual office.");
    } finally {
      setLoading(false);
    }
  }

  async function openWorkbench(targetBotId = botId ?? null) {
    setLoading(true);
    setError(null);
    try {
      const nextBots = await refresh();
      const target = nextBots.find((bot) => bot.id === targetBotId) ?? nextBots[0];
      if (!target) throw new Error("Create a bot before opening the Workbench.");
      if (target.id !== botId) navigate(`/app/${target.id}`);
      setWorkbenchBotId(target.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open the Workbench.");
    } finally {
      setLoading(false);
    }
  }

  async function runWorkbench(prompt: string) {
    if (!activeBot) throw new Error("No bot is selected.");
    await rpc.threads.send({ botId: activeBot.id, text: prompt });
  }

  return (
    <>
      <div className="absolute top-[12px] right-[66px] z-20 flex items-center gap-2">
        <button
          type="button"
          aria-label="Virtual Office"
          onClick={() => void openOffice()}
          disabled={loading}
          className="rounded-full border border-[#2B2C30] bg-[#151618]/95 px-3 py-2 font-medium text-[#C9CAC4] text-[11px] shadow-lg backdrop-blur hover:border-[#BDF268]/35 hover:bg-[#1C1E1A] hover:text-[#E9F9CD] disabled:opacity-45"
        >
          <span aria-hidden="true" className="mr-1.5 text-[#BDF268]">
            ⌂
          </span>
          Virtual Office
        </button>
        <button
          type="button"
          aria-label="Workbench"
          onClick={() => void openWorkbench()}
          disabled={loading}
          className="rounded-full border border-[#2B2C30] bg-[#151618]/95 px-3 py-2 font-medium text-[#C9CAC4] text-[11px] shadow-lg backdrop-blur hover:border-[#8EDFF7]/35 hover:bg-[#161D20] hover:text-[#D8F5FE] disabled:opacity-45"
        >
          <span aria-hidden="true" className="mr-1.5 text-[#8EDFF7]">
            ◫
          </span>
          Workbench
        </button>
      </div>

      {error ? (
        <button
          type="button"
          onClick={() => setError(null)}
          className="absolute top-[56px] right-[66px] z-20 max-w-[360px] rounded-xl border border-red-300/20 bg-[#261719] px-3 py-2 text-left text-red-200 text-xs shadow-xl"
        >
          {error}
        </button>
      ) : null}

      {officeOpen ? (
        <VirtualOfficeOverlay
          bots={bots}
          activeBotId={botId ?? null}
          onSelect={(id) => navigate(`/app/${id}`)}
          onClose={() => setOfficeOpen(false)}
          onOpenWorkbench={(id) => void openWorkbench(id)}
        />
      ) : null}

      {workbenchBotId && activeBot ? (
        <WorkbenchOverlay
          botName={activeBot.name}
          extensionInstructions={extensionInstructions}
          onRun={runWorkbench}
          onClose={() => setWorkbenchBotId(null)}
        />
      ) : null}
    </>
  );
}
