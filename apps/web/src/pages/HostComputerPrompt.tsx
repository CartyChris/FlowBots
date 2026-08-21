import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { desktopBridge } from "../lib/desktop";
import { DOCKER_SETUP_STORAGE_KEY, dockerSetupPrompt } from "../lib/docker-setup";
import { rpc } from "../lib/rpc";
import { CreativeRuntimeHost } from "./CreativeRuntimeHost.js";

export function HostComputerPrompt() {
  const desktop = desktopBridge();
  const { botId } = useParams();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mac = desktop?.platform === "darwin";
  const hostLabel = mac ? "this Mac" : "this computer";

  useEffect(() => {
    if (!desktop) return;
    void rpc
      .me()
      .then((me) => {
        if (me.canChooseHostComputer && me.computerHost == null) setOpen(true);
      })
      .catch(() => undefined);
  }, [desktop]);

  async function choose(computerHost: "docker" | "this-mac") {
    setPending(true);
    setError(null);
    try {
      await rpc.deployment.update({ computerHost });
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save that choice");
    } finally {
      setPending(false);
    }
  }

  async function askBotToBuildDocker() {
    if (!botId) {
      setError("Open a bot first, then ask it to help set up Docker.");
      return;
    }
    setPending(true);
    setError(null);
    window.localStorage.setItem(DOCKER_SETUP_STORAGE_KEY, "1");
    try {
      // Run this task on the host so the bot can inspect Docker. The task itself requires
      // explicit user approval before privileged or security-sensitive changes.
      await rpc.deployment.update({ computerHost: "this-mac" });
      await rpc.threads.send({ botId, text: dockerSetupPrompt() });
      window.localStorage.removeItem(DOCKER_SETUP_STORAGE_KEY);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start Docker setup help");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <CreativeRuntimeHost />
      {open ? (
        <div className="absolute inset-0 z-40 grid place-items-center bg-[#050506]/80 px-6">
          <div className="w-[460px] rounded-[20px] border border-[#26262A] bg-[#121214] p-6">
            <h2 className="font-medium text-[#F1F1F2] text-[22px]">Where should bots run?</h2>
            <p className="mt-2 text-[#85858A] text-[14px] leading-relaxed">
              Docker is the default: each bot gets an isolated Linux desktop with a browser.
              {mac
                ? " macOS will not ask for extra permission if you let bots run on this Mac — they run as you."
                : ` Your OS will not ask for extra permission if you let bots run on ${hostLabel} — they run as you.`}
            </p>
            {error ? <p className="mt-3 text-[#E65707] text-sm">{error}</p> : null}
            <div className="mt-5 flex flex-col gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => void choose("docker")}
                className="rounded-[11px] bg-[#F1F1EF] px-5 py-2.5 text-[#17171A] disabled:opacity-40"
              >
                Docker (recommended)
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => void askBotToBuildDocker()}
                className="rounded-[11px] border border-[#315B48] bg-[#13251D] px-5 py-2.5 text-[#9AD7B4] disabled:opacity-40"
              >
                Have a bot help me set up Docker
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => void choose("this-mac")}
                className="rounded-[11px] border border-[#26262A] px-5 py-2.5 text-[#ECECEE] disabled:opacity-40"
              >
                Use {hostLabel}
              </button>
            </div>
            <p className="mt-3 text-[#6C6C70] text-[12px] leading-relaxed">
              The setup-helper option temporarily runs a bot on {hostLabel} so it can inspect Docker and
              guide the setup. It must ask before installing system software, using administrator
              privileges, or changing host security settings.
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}
