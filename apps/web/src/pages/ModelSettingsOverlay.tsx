import { Button } from "@rakazo/ui-web";
import { useEffect, useMemo, useRef, useState } from "react";
import { rpc } from "../lib/rpc";

type CatalogEntry = Awaited<ReturnType<typeof rpc.models.list>>[number];
type Credential = Awaited<ReturnType<typeof rpc.models.credentials>>[number];

type OAuthAttempt = {
  loginId: string;
  verificationUri: string;
  userCode: string;
};

export function ModelSettingsOverlay({ onClose }: { onClose: () => void }) {
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [query, setQuery] = useState("");
  const [provider, setProvider] = useState("");
  const [modelId, setModelId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [current, setCurrent] = useState<{ provider: string | null; model: string | null }>({
    provider: null,
    model: null,
  });
  const [oauth, setOauth] = useState<OAuthAttempt | null>(null);
  const authRun = useRef(0);

  async function refresh(refreshCatalog = false) {
    const [models, connected, me] = await Promise.all([
      rpc.models.list({ refresh: refreshCatalog }),
      rpc.models.credentials(),
      rpc.me(),
    ]);
    setCatalog(models);
    setCredentials(connected);
    setCurrent({ provider: me.defaultProvider, model: me.defaultModel });
    const nextProvider =
      (provider && models.some((entry) => entry.provider === provider) ? provider : "") ||
      me.defaultProvider ||
      models[0]?.provider ||
      "";
    setProvider(nextProvider);
    const preferredModel = models.find(
      (entry) => entry.provider === nextProvider && entry.id === me.defaultModel,
    );
    const nextModel = preferredModel ?? models.find((entry) => entry.provider === nextProvider);
    setModelId(nextModel?.id ?? "");
  }

  useEffect(() => {
    void refresh(true)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Could not load model settings"),
      )
      .finally(() => setLoading(false));
    return () => {
      authRun.current += 1;
    };
  }, []);

  const providers = useMemo(() => {
    const seen = new Set<string>();
    const rows: Array<{ id: string; name: string }> = [];
    for (const entry of catalog) {
      if (seen.has(entry.provider)) continue;
      seen.add(entry.provider);
      rows.push({ id: entry.provider, name: entry.providerName ?? entry.provider });
    }
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(
      (row) => row.name.toLowerCase().includes(needle) || row.id.toLowerCase().includes(needle),
    );
  }, [catalog, query]);

  const providerModels = catalog.filter((entry) => entry.provider === provider);
  const selected = providerModels.find((entry) => entry.id === modelId) ?? providerModels[0];
  const providerCredential = credentials.find((row) => row.provider === provider);
  const providerName =
    selected?.providerName ?? providers.find((row) => row.id === provider)?.name ?? provider;

  async function connectWithKey() {
    if (!selected || apiKey.trim().length < 8) return;
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      await rpc.models.connect({
        provider: selected.provider,
        apiKey: apiKey.trim(),
        label: providerName || selected.provider,
        modelId: selected.id,
      });
      setApiKey("");
      setNotice(`${providerName} connected and set as the default.`);
      await refresh(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not connect model provider");
    } finally {
      setPending(false);
    }
  }

  async function makeDefault() {
    if (!selected || (!providerCredential && selected.provider !== "ollama")) return;
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      await rpc.models.setDefault({ provider: selected.provider, modelId: selected.id });
      setNotice(`${selected.label} is now the default model.`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change the default model");
    } finally {
      setPending(false);
    }
  }

  async function beginDeviceSignIn() {
    if (!selected) return;
    const run = ++authRun.current;
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const started = await rpc.models.beginOAuth({
        provider: selected.provider,
        modelId: selected.id,
        label: providerName || selected.provider,
      });
      setOauth(started);
      window.open(started.verificationUri, "_blank", "noopener,noreferrer");
      for (let i = 0; i < 90 && authRun.current === run; i += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 2000));
        if (authRun.current !== run) return;
        const result = await rpc.models.completeOAuth({ loginId: started.loginId });
        if (result.status === "pending") continue;
        if (result.status === "error") throw new Error(result.error || "Model sign-in failed");
        if (result.status === "connected") {
          await rpc.models.setDefault({ provider: selected.provider, modelId: selected.id });
          setOauth(null);
          setNotice(`${providerName} connected and set as the default.`);
          await refresh(true);
          return;
        }
      }
      if (authRun.current === run) throw new Error("Model sign-in timed out. Try again.");
    } catch (err) {
      if (authRun.current === run) {
        setError(err instanceof Error ? err.message : "Could not sign in to model provider");
      }
    } finally {
      if (authRun.current === run) setPending(false);
    }
  }

  function close() {
    authRun.current += 1;
    onClose();
  }

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-[rgba(4,4,5,.68)] p-10">
      <div className="flex h-[760px] w-[980px] max-w-full overflow-hidden rounded-[26px] border border-[#232326] bg-[#141416] shadow-[0_40px_90px_rgba(0,0,0,.55)]">
        <aside className="w-[300px] shrink-0 border-r border-[#202023] p-6">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-2xl font-medium text-[#F1F1F2]">Models</h2>
            <button
              type="button"
              aria-label="Close model settings"
              onClick={close}
              className="text-[#85858A]"
            >
              ✕
            </button>
          </div>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search providers"
            className="mb-4 w-full rounded-[11px] border border-[#29292D] bg-[#0E0E10] px-3.5 py-2.5 text-[14px] text-[#ECECEE] outline-none"
          />
          <div className="rk-scroll max-h-[610px] overflow-y-auto">
            {providers.map((row) => {
              const connected = credentials.some((credential) => credential.provider === row.id);
              return (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => {
                    setProvider(row.id);
                    const first = catalog.find((entry) => entry.provider === row.id);
                    setModelId(first?.id ?? "");
                    setError(null);
                    setNotice(null);
                  }}
                  className={`mb-1 flex w-full items-center justify-between rounded-[11px] px-3 py-2.5 text-left ${
                    provider === row.id ? "bg-[#252529]" : "hover:bg-[#1D1D20]"
                  }`}
                >
                  <span className="truncate text-[14.5px] text-[#ECECEE]">{row.name}</span>
                  {connected ? <span className="text-[11px] text-[#63D27B]">connected</span> : null}
                </button>
              );
            })}
          </div>
        </aside>

        <section className="rk-scroll min-w-0 flex-1 overflow-y-auto p-8">
          {loading ? <p className="text-[#85858A]">Loading model catalog…</p> : null}
          {!loading && !selected ? (
            <p className="text-[#85858A]">No models are currently available for this provider.</p>
          ) : null}
          {selected ? (
            <>
              <div className="mb-6">
                <div className="text-[13px] text-[#77777D]">Provider</div>
                <div className="mt-1 text-xl font-medium text-[#F1F1F2]">{providerName}</div>
                <div className="mt-1 text-[13px] text-[#77777D]">
                  Current default:{" "}
                  {current.provider && current.model
                    ? `${current.provider} · ${current.model}`
                    : "none"}
                </div>
              </div>

              <label className="block text-[13px] text-[#85858A]">
                Model
                <select
                  value={selected.id}
                  onChange={(event) => setModelId(event.target.value)}
                  className="mt-2 w-full rounded-[11px] border border-[#29292D] bg-[#0E0E10] px-3.5 py-3 text-[14px] text-[#ECECEE]"
                >
                  {providerModels.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="mt-6 rounded-[16px] border border-[#242428] bg-[#101012] p-5">
                {providerCredential ? (
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="text-[14.5px] text-[#ECECEE]">{providerCredential.label}</div>
                      <div className="mt-1 text-[12.5px] text-[#77777D]">
                        Credential is encrypted and never displayed after saving.
                      </div>
                    </div>
                    <Button type="button" disabled={pending} onClick={() => void makeDefault()}>
                      {current.provider === selected.provider && current.model === selected.id
                        ? "Default"
                        : "Set default"}
                    </Button>
                  </div>
                ) : selected.signIn === "device-code" ? (
                  <div>
                    <Button
                      type="button"
                      disabled={pending}
                      onClick={() => void beginDeviceSignIn()}
                    >
                      {pending
                        ? "Waiting for sign-in…"
                        : selected.oauthLabel || `Sign in to ${providerName}`}
                    </Button>
                    {oauth ? (
                      <div className="mt-4 rounded-[12px] bg-[#19191C] p-4 text-[13px] text-[#B8B8BD]">
                        Open {oauth.verificationUri} and enter code{" "}
                        <strong className="font-mono text-[#ECECEE]">{oauth.userCode}</strong>.
                      </div>
                    ) : null}
                  </div>
                ) : selected.provider === "ollama" ? (
                  <div>
                    <p className="text-[13.5px] leading-6 text-[#8C8C92]">
                      Ollama runs locally and does not need an API key. Refresh discovers the tags
                      installed on this computer, and the selected local model is stored as this
                      workspace's default without creating a secret.
                    </p>
                    <Button
                      type="button"
                      className="mt-3"
                      disabled={pending}
                      onClick={() => void makeDefault()}
                    >
                      {current.provider === "ollama" && current.model === selected.id
                        ? "Default"
                        : "Set default"}
                    </Button>
                  </div>
                ) : (
                  <div>
                    <label className="block text-[13px] text-[#85858A]">
                      API key
                      <input
                        type="password"
                        value={apiKey}
                        onChange={(event) => setApiKey(event.target.value)}
                        placeholder="Paste provider API key"
                        autoComplete="off"
                        className="mt-2 w-full rounded-[11px] border border-[#29292D] bg-[#0B0B0D] px-3.5 py-3 font-mono text-[13px] text-[#ECECEE] outline-none"
                      />
                    </label>
                    <Button
                      type="button"
                      className="mt-3"
                      disabled={pending || apiKey.trim().length < 8}
                      onClick={() => void connectWithKey()}
                    >
                      {pending ? "Saving…" : `Connect ${providerName}`}
                    </Button>
                  </div>
                )}
              </div>

              <Button
                type="button"
                variant="outline"
                className="mt-5"
                disabled={pending}
                onClick={() => void refresh(true)}
              >
                Refresh model catalog
              </Button>
            </>
          ) : null}
          {notice ? <p className="mt-5 text-[13.5px] text-[#63D27B]">{notice}</p> : null}
          {error ? <p className="mt-5 text-[13.5px] text-[#D66B6D]">{error}</p> : null}
        </section>
      </div>
    </div>
  );
}
