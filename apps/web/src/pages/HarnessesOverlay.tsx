import { Button } from "@rakazo/ui-web";
import { useEffect, useMemo, useState } from "react";
import { rpc } from "../lib/rpc";

type HarnessRow = {
  id: string;
  label: string;
  kind: string;
  interactions: string[];
  workspacePolicies: string[];
  scheduleable: boolean;
  resident: boolean;
  outerVerificationRequired: boolean;
  available: boolean;
  version?: string;
  detail?: string;
};

export function HarnessesOverlay({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<HarnessRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [executable, setExecutable] = useState("");
  const [argsText, setArgsText] = useState("");
  const [testing, setTesting] = useState(false);
  const [customResult, setCustomResult] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      setRows(await rpc.harnesses.list());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not probe coding harnesses");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  const availableCount = useMemo(() => rows.filter((row) => row.available).length, [rows]);

  async function testCustomHarness() {
    const command = executable.trim();
    if (!command) return;
    setTesting(true);
    setError(null);
    setCustomResult(null);
    try {
      const args = argsText
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      const result = await rpc.harnesses.probeCustom({ executable: command, args });
      if (result.available) {
        setCustomResult(
          `Custom harness available${result.version ? ` · ${result.version}` : ""}`,
        );
      } else {
        setCustomResult(`Custom harness unavailable${result.detail ? ` · ${result.detail}` : ""}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not test custom harness");
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-[rgba(4,4,5,.68)] p-8">
      <div className="flex h-[780px] w-[1040px] max-w-full flex-col overflow-hidden rounded-[26px] border border-[#26262A] bg-[#141416] shadow-[0_40px_100px_rgba(0,0,0,.58)]">
        <div className="flex items-start justify-between border-b border-[#202023] px-8 py-6">
          <div>
            <h2 className="text-2xl font-medium text-[#F1F1F2]">Harness Center</h2>
            <p className="mt-1 text-[13.5px] text-[#7A7A80]">
              {loading
                ? "Probing installed coding agents…"
                : `${availableCount} of ${rows.length} built-in harnesses available`}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close harness center"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-[#85858A] hover:bg-[#202023] hover:text-[#ECECEE]"
          >
            ✕
          </button>
        </div>

        <div className="rk-scroll flex-1 overflow-y-auto px-8 py-6">
          {error ? <p className="mb-4 text-sm text-[#D85C60]">{error}</p> : null}

          <div className="grid gap-3 md:grid-cols-2">
            {rows.map((row) => (
              <div
                key={row.id}
                className="rounded-[16px] border border-[#26262A] bg-[#101012] p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-[15.5px] font-medium text-[#ECECEE]">{row.label}</div>
                    <div className="mt-1 truncate font-mono text-[11.5px] text-[#68686E]">
                      {row.id}
                    </div>
                  </div>
                  <div
                    className={`shrink-0 rounded-full border px-2.5 py-1 text-[11.5px] ${
                      row.available
                        ? "border-[#315B48] bg-[#173126] text-[#9AD7B4]"
                        : "border-[#3A3A3F] bg-[#1C1C1F] text-[#77777D]"
                    }`}
                  >
                    {row.available ? "Available" : "Not found"}
                  </div>
                </div>
                {row.version ? (
                  <div className="mt-3 truncate text-[12.5px] text-[#AAAAB0]">{row.version}</div>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {row.interactions.map((mode) => (
                    <span
                      key={`${row.id}:interaction:${mode}`}
                      className="rounded-full bg-[#202023] px-2 py-1 text-[11px] text-[#94949A]"
                    >
                      {mode}
                    </span>
                  ))}
                  {row.workspacePolicies.map((policy) => (
                    <span
                      key={`${row.id}:policy:${policy}`}
                      className="rounded-full bg-[#202023] px-2 py-1 text-[11px] text-[#94949A]"
                    >
                      {policy}
                    </span>
                  ))}
                </div>
                <p className="mt-3 text-[12px] leading-5 text-[#696970]">
                  Uses this CLI's existing login. FlowBots does not copy its OAuth session.
                  {row.outerVerificationRequired ? " Changes remain subject to outer verification." : ""}
                </p>
                {!row.available && row.detail ? (
                  <p className="mt-2 line-clamp-2 text-[11.5px] text-[#5F5F65]">{row.detail}</p>
                ) : null}
              </div>
            ))}
          </div>

          <section className="mt-7 rounded-[18px] border border-[#2A2A2E] bg-[#111113] p-5">
            <div className="flex items-start justify-between gap-5">
              <div>
                <h3 className="text-[16px] font-medium text-[#ECECEE]">Custom CLI harness</h3>
                <p className="mt-1 max-w-[680px] text-[12.5px] leading-5 text-[#737379]">
                  Enter an executable and discrete argv values. Each line below is passed as one
                  argument; FlowBots never joins this into a shell command string.
                </p>
              </div>
              <Button
                type="button"
                variant="pill"
                size="sm"
                disabled={!executable.trim() || testing}
                onClick={() => void testCustomHarness()}
              >
                {testing ? "Testing…" : "Test custom harness"}
              </Button>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <input
                value={executable}
                onChange={(event) => setExecutable(event.target.value)}
                placeholder="Executable (for example, gemini)"
                spellCheck={false}
                className="rounded-[11px] border border-[#2A2A2E] bg-[#0D0D0F] px-3.5 py-3 font-mono text-[13px] text-[#ECECEE] outline-none focus:border-[#44444A]"
              />
              <textarea
                value={argsText}
                onChange={(event) => setArgsText(event.target.value)}
                placeholder="One argument per line"
                rows={3}
                spellCheck={false}
                className="resize-none rounded-[11px] border border-[#2A2A2E] bg-[#0D0D0F] px-3.5 py-3 font-mono text-[13px] text-[#ECECEE] outline-none focus:border-[#44444A]"
              />
            </div>
            {customResult ? (
              <p className="mt-3 text-[12.5px] text-[#A7A7AC]">{customResult}</p>
            ) : null}
          </section>
        </div>

        <div className="flex justify-between border-t border-[#202023] px-8 py-4">
          <p className="text-[12px] text-[#626268]">
            CLI-owned authentication stays in the tool that created it.
          </p>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="text-[12.5px] text-[#A7A7AC] hover:text-[#ECECEE] disabled:opacity-40"
          >
            {loading ? "Probing…" : "Probe again"}
          </button>
        </div>
      </div>
    </div>
  );
}
