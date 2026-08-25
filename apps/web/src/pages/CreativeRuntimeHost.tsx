import type { Bot, BotAppearance, CapabilityInstall } from "@rakazo/contracts";
import { applyBotSteeringProfile, type BotSteeringProfile } from "@rakazo/core";
import { BotAvatar, registerBotAvatarAppearances } from "@rakazo/ui-web";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { rpc } from "../lib/rpc";
import { BotLookStudio } from "./BotLookStudio.js";
import {
  appearanceCapabilityForBot,
  appearanceForBot,
  botAppearanceCapabilityConfig,
  botAppearanceSource,
  botAvatarAppearanceRegistrations,
} from "./bot-appearance.js";
import { extensionInstructionsForBot } from "./github-extensions.js";
import { SteeringStudio } from "./SteeringStudio.js";
import { VirtualOfficeOverlay } from "./VirtualOfficeOverlay.js";
import { WorkbenchOverlay } from "./WorkbenchOverlay.js";

export function CreativeRuntimeHost() {
  const { botId } = useParams();
  const navigate = useNavigate();
  const [bots, setBots] = useState<Bot[]>([]);
  const [capabilities, setCapabilities] = useState<CapabilityInstall[]>([]);
  const [officeOpen, setOfficeOpen] = useState(false);
  const [workbenchBotId, setWorkbenchBotId] = useState<string | null>(null);
  const [lookBotId, setLookBotId] = useState<string | null>(null);
  const [steeringBotId, setSteeringBotId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chatBot = useMemo(() => bots.find((bot) => bot.id === botId) ?? bots[0], [bots, botId]);
  const activeBot = useMemo(
    () => bots.find((bot) => bot.id === (workbenchBotId ?? botId)) ?? bots[0],
    [bots, botId, workbenchBotId],
  );
  const lookBot = useMemo(
    () => bots.find((bot) => bot.id === (lookBotId ?? botId)) ?? bots[0],
    [bots, botId, lookBotId],
  );
  const steeringBot = useMemo(
    () => bots.find((bot) => bot.id === (steeringBotId ?? botId)) ?? bots[0],
    [bots, botId, steeringBotId],
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
    return { bots: nextBots, capabilities: nextCapabilities };
  }

  useEffect(() => {
    void refresh().catch(() => undefined);
    const timer = window.setInterval(() => void refresh().catch(() => undefined), 8_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    registerBotAvatarAppearances(botAvatarAppearanceRegistrations(bots, capabilities));
  }, [bots, capabilities]);

  useEffect(() => {
    if (!officeOpen) return;
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
      const next = await refresh();
      const target = next.bots.find((bot) => bot.id === targetBotId) ?? next.bots[0];
      if (!target) throw new Error("Create a bot before opening the Workbench.");
      if (target.id !== botId) navigate(`/app/${target.id}`);
      setWorkbenchBotId(target.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open the Workbench.");
    } finally {
      setLoading(false);
    }
  }

  async function openLookStudio(targetBotId = botId ?? null) {
    setLoading(true);
    setError(null);
    try {
      const next = await refresh();
      const target = next.bots.find((bot) => bot.id === targetBotId) ?? next.bots[0];
      if (!target) throw new Error("Create a bot before opening Look Studio.");
      setLookBotId(target.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open Look Studio.");
    } finally {
      setLoading(false);
    }
  }

  async function openSteeringStudio(targetBotId = botId ?? null) {
    setLoading(true);
    setError(null);
    try {
      const next = await refresh();
      const target = next.bots.find((bot) => bot.id === targetBotId) ?? next.bots[0];
      if (!target) throw new Error("Create a bot before opening Steering Studio.");
      setSteeringBotId(target.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open Steering Studio.");
    } finally {
      setLoading(false);
    }
  }

  async function saveLook(input: { color: string; appearance: BotAppearance }) {
    if (!lookBot) throw new Error("No bot is selected.");
    const existing = appearanceCapabilityForBot(capabilities, lookBot.id);
    const created = await rpc.capabilities.install({
      kind: "plugin",
      name: `${lookBot.name} appearance`,
      source: botAppearanceSource(lookBot.id),
      config: botAppearanceCapabilityConfig(lookBot.id, input.appearance),
    });

    try {
      await rpc.bots.update({ botId: lookBot.id, color: input.color });
    } catch (err) {
      await rpc.capabilities.remove({ id: created.id }).catch(() => undefined);
      throw err;
    }

    if (existing && existing.id !== created.id) {
      await rpc.capabilities.remove({ id: existing.id }).catch(() => undefined);
    }
    await refresh();
  }

  async function saveSteering(profile: BotSteeringProfile) {
    if (!steeringBot) throw new Error("No bot is selected.");
    const instructions = applyBotSteeringProfile(steeringBot.instructions ?? "", profile);
    await rpc.bots.update({ botId: steeringBot.id, instructions });
    await refresh();
  }

  async function runWorkbench(prompt: string) {
    if (!activeBot) throw new Error("No bot is selected.");
    await rpc.threads.send({ botId: activeBot.id, text: prompt });
  }

  return (
    <>
      <div className="absolute top-[10px] right-[62px] z-20 flex items-center gap-1 rounded-2xl border border-white/[0.07] bg-[#101113]/92 p-1.5 shadow-[0_12px_36px_rgba(0,0,0,.35)] backdrop-blur-xl">
        {chatBot ? (
          <button
            type="button"
            aria-label={`Customize ${chatBot.name} look`}
            onClick={() => void openLookStudio(chatBot.id)}
            disabled={loading}
            className="group hidden items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-white/[0.055] disabled:opacity-45 md:flex"
          >
            <BotAvatar
              color={chatBot.color}
              size={27}
              state={chatBot.status === "idle" ? "idle" : "working"}
              label={chatBot.name}
            />
            <span className="hidden max-w-[90px] truncate font-medium text-[#D3D4CE] text-[10.5px] xl:block">
              {chatBot.name}
            </span>
            <span className="hidden rounded-full bg-[#D8C5FF]/10 px-1.5 py-0.5 font-semibold text-[#D8C5FF] text-[7px] uppercase tracking-wider group-hover:bg-[#D8C5FF]/15 xl:inline">
              look
            </span>
          </button>
        ) : null}
        <span className="mx-0.5 hidden h-6 w-px bg-white/[0.07] md:block" aria-hidden="true" />
        <button
          type="button"
          aria-label="Virtual Office"
          onClick={() => void openOffice()}
          disabled={loading}
          className="rounded-xl px-2 py-2 font-medium text-[#AAAFA4] text-[10.5px] hover:bg-[#BDF268]/[0.08] hover:text-[#E9F9CD] disabled:opacity-45 sm:px-2.5"
        >
          <span aria-hidden="true" className="mr-1 text-[#BDF268] sm:mr-1.5">
            ⌂
          </span>
          <span className="hidden sm:inline">Office</span>
        </button>
        <button
          type="button"
          aria-label="Workbench"
          onClick={() => void openWorkbench()}
          disabled={loading}
          className="rounded-xl px-2 py-2 font-medium text-[#AAAFA4] text-[10.5px] hover:bg-[#8EDFF7]/[0.08] hover:text-[#D8F5FE] disabled:opacity-45 sm:px-2.5"
        >
          <span aria-hidden="true" className="mr-1 text-[#8EDFF7] sm:mr-1.5">
            ◫
          </span>
          <span className="hidden sm:inline">Workbench</span>
        </button>
        <button
          type="button"
          aria-label="Steering Studio"
          onClick={() => void openSteeringStudio()}
          disabled={loading}
          className="rounded-xl px-2 py-2 font-medium text-[#AAAFA4] text-[10.5px] hover:bg-[#8EDFF7]/[0.08] hover:text-[#D8F5FE] disabled:opacity-45 sm:px-2.5"
        >
          <span aria-hidden="true" className="mr-1 text-[#8EDFF7] sm:mr-1.5">
            ◈
          </span>
          <span className="hidden sm:inline">Steer</span>
        </button>
        <button
          type="button"
          aria-label="Look Studio"
          onClick={() => void openLookStudio()}
          disabled={loading}
          className="rounded-xl px-2 py-2 font-medium text-[#AAAFA4] text-[10.5px] hover:bg-[#D8C5FF]/[0.08] hover:text-[#F0E8FF] disabled:opacity-45 sm:px-2.5"
        >
          <span aria-hidden="true" className="mr-1 text-[#D8C5FF] sm:mr-1.5">
            ✦
          </span>
          <span className="hidden sm:inline">Look</span>
        </button>
      </div>

      {error ? (
        <button
          type="button"
          onClick={() => setError(null)}
          className="absolute top-[58px] right-[66px] z-20 max-w-[360px] rounded-xl border border-red-300/20 bg-[#261719] px-3 py-2 text-left text-red-200 text-xs shadow-xl"
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
          onCustomize={(id) => void openLookStudio(id)}
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

      {lookBotId && lookBot ? (
        <BotLookStudio
          key={lookBot.id}
          bot={lookBot}
          appearance={appearanceForBot(capabilities, lookBot.id)}
          onSave={saveLook}
          onClose={() => setLookBotId(null)}
        />
      ) : null}

      {steeringBotId && steeringBot ? (
        <SteeringStudio
          key={steeringBot.id}
          bot={steeringBot}
          onSave={saveSteering}
          onClose={() => setSteeringBotId(null)}
        />
      ) : null}
    </>
  );
}
