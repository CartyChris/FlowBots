import type { ConnectionCatalogItem } from "@rakazo/contracts";
import { Button } from "@rakazo/ui-web";
import { useEffect, useMemo, useState } from "react";
import { rpc } from "../lib/rpc";

let cachedCatalog: ConnectionCatalogItem[] = [];

function markConnected(items: ConnectionCatalogItem[], slug: string, connected: boolean) {
  return items.map((entry) => (entry.slug === slug ? { ...entry, connected } : entry));
}

type ComposioStatus = {
  configured: boolean;
  source: "local" | "environment" | "none";
};

export function PluginsOverlay({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [catalog, setCatalog] = useState<ConnectionCatalogItem[]>(cachedCatalog);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(cachedCatalog.length === 0);
  const [status, setStatus] = useState<ComposioStatus>({ configured: false, source: "none" });
  const [apiKey, setApiKey] = useState("");
  const [savingKey, setSavingKey] = useState(false);

  async function refresh() {
    const nextStatus = await rpc.connections.composioStatus();
    setStatus(nextStatus);
    if (!nextStatus.configured) {
      cachedCatalog = [];
      setCatalog([]);
      return [];
    }
    const items = await rpc.connections.catalog({});
    cachedCatalog = items;
    setCatalog(items);
    return items;
  }

  useEffect(() => {
    void refresh()
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Could not load catalog"),
      )
      .finally(() => setLoading(false));
  }, []);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return catalog;
    return catalog.filter(
      (item) =>
        item.name.toLowerCase().includes(needle) || item.slug.toLowerCase().includes(needle),
    );
  }, [catalog, query]);

  function setItemConnected(slug: string, connected: boolean) {
    cachedCatalog = markConnected(cachedCatalog, slug, connected);
    setCatalog((prev) => markConnected(prev, slug, connected));
  }

  async function saveComposioKey() {
    const key = apiKey.trim();
    if (key.length < 8) return;
    setSavingKey(true);
    setError(null);
    try {
      await rpc.connections.configureComposio({ apiKey: key });
      setApiKey("");
      setStatus({ configured: true, source: "local" });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not configure Composio");
    } finally {
      setSavingKey(false);
    }
  }

  async function clearComposioKey() {
    setSavingKey(true);
    setError(null);
    try {
      await rpc.connections.clearComposio();
      setApiKey("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not clear local Composio key");
    } finally {
      setSavingKey(false);
    }
  }

  async function connect(item: ConnectionCatalogItem) {
    setError(null);
    setPending(item.slug);
    try {
      const started = await rpc.connections.begin({ provider: item.slug, displayName: item.name });
      if (started.authorizationUrl)
        window.open(started.authorizationUrl, "_blank", "noopener,noreferrer");
      if (item.noAuth && !started.authorizationUrl) {
        setItemConnected(item.slug, true);
        return;
      }
      for (let i = 0; i < 45; i += 1) {
        const row = await rpc.connections
          .complete({ connectionId: started.connectionId })
          .catch(() => undefined);
        if (row?.status === "connected") {
          setItemConnected(item.slug, true);
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not connect");
    } finally {
      setPending(null);
    }
  }

  async function revoke(item: ConnectionCatalogItem) {
    setError(null);
    setPending(item.slug);
    try {
      const rows = await rpc.connections.list();
      const row = rows.find(
        (entry) => entry.provider === item.slug && entry.status === "connected",
      );
      if (!row) {
        setError(`No connection record found for ${item.name}.`);
        return;
      }
      await rpc.connections.revoke({ connectionId: row.id });
      setItemConnected(item.slug, false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not revoke connection");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-[rgba(4,4,5,.62)] p-10">
      <div className="flex h-[800px] w-[1080px] max-w-full flex-col overflow-hidden rounded-[26px] border border-[#232326] bg-[#141416] shadow-[0_40px_90px_rgba(0,0,0,.55)]">
        <div className="flex items-start justify-between border-b border-[#202023] px-8 py-6">
          <div>
            <div className="text-2xl font-medium text-[#F1F1F2]">Connections</div>
            <p className="mt-1 text-[13.5px] text-[#7A7A80]">
              Composio runs directly from your FlowBots instance. Keys stay encrypted locally.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close plugins"
            onClick={onClose}
            className="text-[#85858A]"
          >
            ✕
          </button>
        </div>

        <div className="border-b border-[#202023] px-8 py-5">
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-[320px] flex-1 text-[12.5px] text-[#85858A]">
              Composio API key
              <input
                type="password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder={status.configured ? "Configured — enter a new key to rotate" : "ak_…"}
                autoComplete="off"
                className="mt-1.5 w-full rounded-[11px] border border-[#2A2A2E] bg-[#0D0D0F] px-3.5 py-3 font-mono text-[13px] text-[#ECECEE] outline-none"
              />
            </label>
            <Button
              type="button"
              variant="pill"
              size="sm"
              disabled={apiKey.trim().length < 8 || savingKey}
              onClick={() => void saveComposioKey()}
            >
              {savingKey ? "Saving…" : status.configured ? "Rotate key" : "Connect Composio"}
            </Button>
            {status.source === "local" ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={savingKey}
                onClick={() => void clearComposioKey()}
              >
                Remove local key
              </Button>
            ) : null}
          </div>
          <p className="mt-2 text-[11.5px] text-[#696970]">
            Status: {status.configured ? `connected via ${status.source}` : "not configured"}. The key
            is never returned to this screen after saving.
          </p>
        </div>

        <div className="px-8 pt-4">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search apps — Gmail, GitHub, Slack, Vercel…"
            disabled={!status.configured}
            className="w-full rounded-[13px] border border-[#26262A] bg-[#101012] px-4 py-3 text-[15px] text-[#ECECEE] outline-none disabled:opacity-40"
          />
        </div>
        <div className="rk-scroll flex-1 overflow-y-auto px-8 py-6">
          {error ? <p className="mb-4 text-sm text-[#C94244]">{error}</p> : null}
          {!loading && !status.configured ? (
            <div className="rounded-[16px] border border-dashed border-[#2A2A2E] p-6 text-[#78787E]">
              Add your Composio key above to unlock the app catalog locally. Browser, web fetch,
              shell, files, computer use, and MCP do not depend on Composio.
            </div>
          ) : null}
          {status.configured && !loading && catalog.length === 0 ? (
            <p className="text-[#6C6C70]">Connected, but the app catalog is currently unavailable.</p>
          ) : null}
          {visible.map((item) => (
            <div key={item.slug} className="flex items-center gap-4 rounded-[13px] px-3 py-2.5 hover:bg-[#18181B]">
              {item.logo ? (
                <img
                  src={item.logo}
                  alt=""
                  className="h-[42px] w-[42px] rounded-xl bg-[#2C2C30] object-contain"
                />
              ) : (
                <div className="grid h-[42px] w-[42px] place-items-center rounded-xl bg-[#2C2C30] font-semibold">
                  {item.name[0]}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="text-[15.5px] font-medium text-[#ECECEE]">{item.name}</div>
                <div className="text-[13.5px] text-[#7A7A80]">
                  {item.slug}
                  {item.noAuth ? " · no auth" : ""}
                </div>
              </div>
              {item.connected ? (
                <Button
                  type="button"
                  variant="pill"
                  size="sm"
                  disabled={pending === item.slug}
                  onClick={() => void revoke(item)}
                >
                  {pending === item.slug ? "Revoking…" : "Revoke"}
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="pill"
                  size="sm"
                  disabled={pending === item.slug}
                  onClick={() => void connect(item)}
                >
                  {pending === item.slug ? "Connecting…" : "Connect"}
                </Button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
