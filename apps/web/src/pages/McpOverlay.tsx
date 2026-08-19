import type { CapabilityInstall } from "@rakazo/contracts";
import { Button } from "@rakazo/ui-web";
import { useEffect, useMemo, useState } from "react";
import { rpc } from "../lib/rpc";

type Transport = "http" | "stdio";

export function McpOverlay({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<CapabilityInstall[]>([]);
  const [transport, setTransport] = useState<Transport>("http");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [command, setCommand] = useState("");
  const [argsText, setArgsText] = useState("");
  const [cwd, setCwd] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function refresh() {
    const installed = await rpc.capabilities.list();
    setRows(installed.filter((row) => row.kind === "mcp"));
  }

  useEffect(() => {
    void refresh().catch((err: unknown) =>
      setError(err instanceof Error ? err.message : "Could not load MCP servers"),
    );
  }, []);

  const canSave = useMemo(() => {
    if (!name.trim()) return false;
    return transport === "http" ? /^https?:\/\//i.test(url.trim()) : Boolean(command.trim());
  }, [command, name, transport, url]);

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const id = slugify(name);
      const config =
        transport === "http"
          ? { id, name: name.trim(), transport, url: url.trim() }
          : {
              id,
              name: name.trim(),
              transport,
              command: command.trim(),
              args: argsText
                .split(/\r?\n/)
                .map((line) => line.trim())
                .filter(Boolean),
              ...(cwd.trim() ? { cwd: cwd.trim() } : {}),
            };
      await rpc.capabilities.install({
        kind: "mcp",
        name: id,
        source: transport === "http" ? url.trim() : `stdio://${command.trim()}`,
        config,
      });
      setName("");
      setUrl("");
      setCommand("");
      setArgsText("");
      setCwd("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save MCP server");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-[rgba(4,4,5,.68)] p-8">
      <div className="flex h-[780px] w-[980px] max-w-full flex-col overflow-hidden rounded-[26px] border border-[#26262A] bg-[#141416] shadow-[0_40px_100px_rgba(0,0,0,.58)]">
        <div className="flex items-start justify-between border-b border-[#202023] px-8 py-6">
          <div>
            <h2 className="text-2xl font-medium text-[#F1F1F2]">MCP servers</h2>
            <p className="mt-1 text-[13.5px] text-[#7A7A80]">
              Give every bot local or remote MCP tools. Saved servers are discovered on each turn.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close MCP servers"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-[#85858A] hover:bg-[#202023] hover:text-[#ECECEE]"
          >
            ✕
          </button>
        </div>

        <div className="rk-scroll grid flex-1 gap-6 overflow-y-auto px-8 py-6 lg:grid-cols-[.9fr_1.1fr]">
          <section>
            <div className="mb-3 text-[13px] font-medium uppercase tracking-[.08em] text-[#66666C]">
              Configured
            </div>
            <div className="space-y-2">
              {rows.length === 0 ? (
                <div className="rounded-[14px] border border-dashed border-[#2A2A2E] p-5 text-[13px] leading-5 text-[#737379]">
                  No MCP servers yet. Add an HTTP MCP or a local stdio server. Stdio commands run
                  directly with <code>shell:false</code> in the local desktop runtime.
                </div>
              ) : null}
              {rows.map((row) => {
                const config = row.config as Record<string, unknown>;
                return (
                  <div
                    key={row.id}
                    className="rounded-[14px] border border-[#26262A] bg-[#101012] p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-[15px] font-medium text-[#ECECEE]">
                          {row.name}
                        </div>
                        <div className="mt-1 truncate font-mono text-[11.5px] text-[#6D6D73]">
                          {String(config.transport ?? "mcp")} · {row.source}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void rpc.capabilities.remove({ id: row.id }).then(refresh)}
                        className="rounded-lg px-2 py-1 text-[12px] text-[#8A6668] hover:bg-[#251719] hover:text-[#E58A8F]"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="rounded-[18px] border border-[#2A2A2E] bg-[#101012] p-5">
            <h3 className="text-[16px] font-medium text-[#ECECEE]">Add MCP server</h3>
            <div className="mt-4 flex gap-2">
              {(["http", "stdio"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTransport(value)}
                  className={`rounded-full px-3 py-1.5 text-[12.5px] ${
                    transport === value
                      ? "bg-[#F1F1EF] text-[#17171A]"
                      : "bg-[#202023] text-[#8D8D93]"
                  }`}
                >
                  {value === "http" ? "HTTP / SSE" : "Local stdio"}
                </button>
              ))}
            </div>
            <label className="mt-4 block text-[12.5px] text-[#85858A]">
              Name
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="My docs server"
                className="mt-1.5 w-full rounded-[11px] border border-[#2A2A2E] bg-[#0D0D0F] px-3.5 py-3 text-[13px] text-[#ECECEE] outline-none"
              />
            </label>
            {transport === "http" ? (
              <label className="mt-4 block text-[12.5px] text-[#85858A]">
                MCP URL
                <input
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="http://127.0.0.1:3000/mcp"
                  spellCheck={false}
                  className="mt-1.5 w-full rounded-[11px] border border-[#2A2A2E] bg-[#0D0D0F] px-3.5 py-3 font-mono text-[12.5px] text-[#ECECEE] outline-none"
                />
              </label>
            ) : (
              <>
                <label className="mt-4 block text-[12.5px] text-[#85858A]">
                  Executable
                  <input
                    value={command}
                    onChange={(event) => setCommand(event.target.value)}
                    placeholder="npx"
                    spellCheck={false}
                    className="mt-1.5 w-full rounded-[11px] border border-[#2A2A2E] bg-[#0D0D0F] px-3.5 py-3 font-mono text-[12.5px] text-[#ECECEE] outline-none"
                  />
                </label>
                <label className="mt-4 block text-[12.5px] text-[#85858A]">
                  Arguments — one per line
                  <textarea
                    value={argsText}
                    onChange={(event) => setArgsText(event.target.value)}
                    rows={4}
                    spellCheck={false}
                    className="mt-1.5 w-full resize-none rounded-[11px] border border-[#2A2A2E] bg-[#0D0D0F] px-3.5 py-3 font-mono text-[12.5px] text-[#ECECEE] outline-none"
                  />
                </label>
                <label className="mt-4 block text-[12.5px] text-[#85858A]">
                  Working directory (optional)
                  <input
                    value={cwd}
                    onChange={(event) => setCwd(event.target.value)}
                    placeholder="Defaults to FlowBots data directory"
                    spellCheck={false}
                    className="mt-1.5 w-full rounded-[11px] border border-[#2A2A2E] bg-[#0D0D0F] px-3.5 py-3 font-mono text-[12.5px] text-[#ECECEE] outline-none"
                  />
                </label>
                <p className="mt-3 text-[11.5px] leading-5 text-[#696970]">
                  Local stdio MCPs can execute the program you specify. Only add servers you trust.
                  FlowBots passes argv directly and never joins it into a shell command.
                </p>
              </>
            )}
            {error ? <p className="mt-3 text-[12.5px] text-[#D85C60]">{error}</p> : null}
            <Button
              type="button"
              variant="pill"
              size="sm"
              disabled={!canSave || saving}
              onClick={() => void save()}
              className="mt-5"
            >
              {saving ? "Saving…" : "Add server"}
            </Button>
          </section>
        </div>
      </div>
    </div>
  );
}

function slugify(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "mcp"
  );
}
