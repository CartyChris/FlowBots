export type WebReachability = "checking" | "online" | "offline";
export type ApiReachability = WebReachability | "not-applicable";
export type ConnectionCenterMode = "recovery" | "settings";

export interface RecoveryPageModel {
  currentUrl: string;
  error: string;
  recentUrls: string[];
  appVersion: string;
  platform: string;
  webStatus: WebReachability;
  apiStatus: ApiReachability;
  mode?: ConnectionCenterMode;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function diagnosticsValue(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function statusLabel(status: WebReachability | ApiReachability): string {
  if (status === "online") return "Online";
  if (status === "offline") return "Offline";
  if (status === "not-applicable") return "Remote / managed by web origin";
  return "Checking…";
}

export function diagnosticsText(model: RecoveryPageModel): string {
  return [
    "Rakazo desktop diagnostics",
    `App: ${diagnosticsValue(model.appVersion)}`,
    `Platform: ${diagnosticsValue(model.platform)}`,
    `Target: ${diagnosticsValue(model.currentUrl)}`,
    `Navigation: ${diagnosticsValue(model.error || "none")}`,
    `Web origin: ${model.webStatus}`,
    `Rakazo API: ${model.apiStatus}`,
  ].join("\n");
}

export function recoveryPageHtml(model: RecoveryPageModel): string {
  const mode = model.mode ?? "recovery";
  const recovering = mode === "recovery";
  const lede = recovering
    ? `The desktop app is running, but the Rakazo web origin at <span class="target">${escapeHtml(model.currentUrl)}</span> is not available yet. Connect to a running local or remote Rakazo deployment below—this screen will reconnect automatically when it comes online.`
    : `Choose the local or remote Rakazo deployment this desktop client should use. Your current target is <span class="target">${escapeHtml(model.currentUrl)}</span>.`;
  const recentButtons = model.recentUrls
    .map(
      (url) => `<button class="recent" type="button" data-recent-url="${escapeHtml(url)}"><span></span>${escapeHtml(url)}</button>`,
    )
    .join("");
  const errorBlock = model.error
    ? `<div class="error" id="navigation-error">${escapeHtml(model.error)}</div>`
    : `<div class="hint" id="navigation-error">${recovering ? "Waiting for the web origin…" : "Connection settings"}</div>`;
  const footerState = recovering
    ? '<span class="auto">↻ Auto-reconnect active</span>'
    : "<span>Connection settings</span>";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';" />
  <title>Rakazo Connection Center</title>
  <style>
    :root { color-scheme: dark; font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif; background: #07080c; color: #f6f7fb; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: radial-gradient(circle at 16% 8%, rgba(105, 94, 255, .20), transparent 30rem), radial-gradient(circle at 90% 4%, rgba(66, 211, 146, .10), transparent 26rem), #07080c; }
    main { width: min(900px, calc(100% - 42px)); margin: 0 auto; padding: 52px 0 64px; }
    .brand { display: flex; align-items: center; gap: 11px; color: #afb1c0; font-size: 12px; font-weight: 750; letter-spacing: .08em; text-transform: uppercase; }
    .mark { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 11px; background: linear-gradient(145deg, #756eff, #5048d9); box-shadow: 0 12px 30px rgba(83, 75, 224, .32); font-size: 17px; color: white; }
    h1 { margin: 25px 0 11px; font-size: clamp(36px, 5vw, 52px); line-height: 1.02; letter-spacing: -.045em; }
    .lede { max-width: 760px; margin: 0; color: #a5a7b5; font-size: 16px; line-height: 1.62; }
    .target { color: #d6d3ff; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .92em; overflow-wrap: anywhere; }
    .status-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 11px; margin: 28px 0 13px; }
    .status-card, .panel { border: 1px solid rgba(255,255,255,.085); background: rgba(17, 18, 26, .78); box-shadow: 0 18px 45px rgba(0,0,0,.22), inset 0 1px rgba(255,255,255,.025); backdrop-filter: blur(20px); }
    .status-card { display: flex; align-items: center; justify-content: space-between; gap: 14px; border-radius: 15px; padding: 15px 17px; }
    .status-name { color: #a3a5b4; font-size: 13px; }
    .status-value { display: inline-flex; align-items: center; gap: 7px; font-size: 13px; font-weight: 650; }
    .status-value::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: #f2a65a; box-shadow: 0 0 14px rgba(242,166,90,.55); }
    .status-value[data-status="online"]::before { background: #42d392; box-shadow: 0 0 14px rgba(66,211,146,.55); }
    .status-value[data-status="offline"]::before { background: #ff7474; box-shadow: 0 0 14px rgba(255,116,116,.48); }
    .status-value[data-status="not-applicable"]::before { background: #8e91a0; box-shadow: none; }
    .panel { margin-top: 12px; border-radius: 21px; padding: 21px; }
    .panel h2 { margin: 0 0 6px; font-size: 17px; letter-spacing: -.015em; }
    .copy { margin: 0 0 17px; color: #858896; font-size: 13px; line-height: 1.55; }
    label { display: block; margin-bottom: 8px; color: #b6b8c5; font-size: 12px; font-weight: 650; }
    .connection-row { display: grid; grid-template-columns: 1fr auto; gap: 9px; }
    input { width: 100%; min-width: 0; border: 1px solid rgba(255,255,255,.11); border-radius: 12px; background: #0a0b10; color: #f5f5fa; padding: 12px 13px; outline: none; font: 13px ui-monospace, SFMono-Regular, Menlo, monospace; }
    input:focus { border-color: #7069ff; box-shadow: 0 0 0 3px rgba(112,105,255,.14); }
    button { border: 1px solid rgba(255,255,255,.1); border-radius: 12px; background: rgba(255,255,255,.055); color: #f5f5f8; padding: 11px 14px; font: 650 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; cursor: pointer; }
    button:hover { background: rgba(255,255,255,.09); border-color: rgba(255,255,255,.16); }
    button:active { transform: translateY(1px); }
    button.primary { background: linear-gradient(145deg, #726cff, #5b53e8); border-color: #817bff; box-shadow: 0 10px 22px rgba(91,83,232,.22); white-space: nowrap; }
    .actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
    .error, .hint { margin-top: 14px; border-radius: 12px; padding: 11px 12px; font: 12px ui-monospace, SFMono-Regular, Menlo, monospace; overflow-wrap: anywhere; }
    .error { background: rgba(255,111,111,.075); border: 1px solid rgba(255,111,111,.14); color: #d9a3a3; }
    .hint { background: rgba(112,105,255,.07); border: 1px solid rgba(112,105,255,.13); color: #aaa7d8; }
    .recent-list { display: grid; gap: 7px; }
    .recent { width: 100%; display: flex; align-items: center; gap: 10px; text-align: left; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-weight: 500; color: #c9cad4; }
    .recent span { width: 7px; height: 7px; border-radius: 50%; flex: 0 0 auto; background: #736cff; box-shadow: 0 0 12px rgba(115,108,255,.55); }
    pre { margin: 0; padding: 14px 16px; overflow-x: auto; border: 1px solid rgba(255,255,255,.075); border-radius: 13px; background: #08090d; color: #bfc2d0; font: 12px/1.7 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre-wrap; }
    .footer { margin-top: 18px; display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; color: #686a78; font-size: 11px; }
    .auto { color: #8e90a0; }
    @media (max-width: 660px) { main { width: min(100% - 28px, 900px); padding-top: 36px; } .status-grid, .connection-row { grid-template-columns: 1fr; } .connection-row button { width: 100%; } h1 { font-size: 38px; } }
  </style>
</head>
<body>
  <main>
    <div class="brand"><div class="mark">R</div><span>Rakazo Desktop</span></div>
    <h1>Connection Center</h1>
    <p class="lede">${lede}</p>

    <section class="status-grid" aria-label="Connection health">
      <div class="status-card"><span class="status-name">Web origin</span><span class="status-value" id="web-status" data-status="${model.webStatus}">${statusLabel(model.webStatus)}</span></div>
      <div class="status-card"><span class="status-name">Rakazo API</span><span class="status-value" id="api-status" data-status="${model.apiStatus}">${statusLabel(model.apiStatus)}</span></div>
    </section>

    <section class="panel">
      <h2>Connect</h2>
      <p class="copy">Use the local development origin or a self-hosted Rakazo web URL. Only HTTP and HTTPS endpoints are accepted; credentials are never stored in connection URLs.</p>
      <form id="connection-form">
        <label for="target-url">Rakazo web URL</label>
        <div class="connection-row">
          <input id="target-url" value="${escapeHtml(model.currentUrl)}" spellcheck="false" autocomplete="off" />
          <button class="primary" type="submit">Save &amp; Connect</button>
        </div>
      </form>
      <div class="actions">
        <button type="button" id="retry">Retry</button>
        <button type="button" id="reset">Reset to Local</button>
        <button type="button" id="copy-diagnostics">Copy Diagnostics</button>
      </div>
      ${errorBlock}
    </section>

    ${recentButtons ? `<section class="panel"><h2>Recent connections</h2><p class="copy">Switch deployments without reopening Terminal or changing environment variables.</p><div class="recent-list">${recentButtons}</div></section>` : ""}

    <section class="panel">
      <h2>Starting Rakazo locally</h2>
      <p class="copy">The DMG is the desktop client; the current self-hosted architecture still needs the Rakazo web/API stack. From a Rakazo checkout:</p>
      <pre>docker compose -f infra/compose/docker-compose.yml up postgres -d
pnpm db:migrate
pnpm dev</pre>
      <p class="copy" style="margin: 14px 0 0">Once Vite is listening on <strong>127.0.0.1:5173</strong>, recovery mode reconnects automatically.</p>
    </section>

    <div class="footer"><span>Rakazo ${escapeHtml(model.appVersion)} · ${escapeHtml(model.platform)}</span>${footerState}</div>
  </main>
  <script>
    (() => {
      const bridge = window.rakazoDesktop && window.rakazoDesktop.connection;
      const form = document.getElementById("connection-form");
      const input = document.getElementById("target-url");
      const retry = document.getElementById("retry");
      const reset = document.getElementById("reset");
      const copy = document.getElementById("copy-diagnostics");
      const webStatus = document.getElementById("web-status");
      const apiStatus = document.getElementById("api-status");
      if (!bridge) return;

      const labels = { checking: "Checking…", online: "Online", offline: "Offline", "not-applicable": "Remote / managed by web origin" };
      const setStatus = (node, status) => { node.textContent = labels[status] || status; node.dataset.status = status; };
      const refreshStatus = async () => {
        try {
          const state = await bridge.status();
          setStatus(webStatus, state.webStatus);
          setStatus(apiStatus, state.apiStatus);
        } catch {
          setStatus(webStatus, "offline");
        }
      };

      form.addEventListener("submit", (event) => { event.preventDefault(); bridge.setUrl(input.value); });
      retry.addEventListener("click", () => bridge.retry());
      reset.addEventListener("click", () => bridge.reset());
      copy.addEventListener("click", async () => {
        await bridge.copyDiagnostics();
        const original = copy.textContent;
        copy.textContent = "Copied";
        setTimeout(() => { copy.textContent = original; }, 1400);
      });
      document.querySelectorAll("[data-recent-url]").forEach((button) => {
        button.addEventListener("click", () => bridge.useRecent(button.dataset.recentUrl || ""));
      });
      void refreshStatus();
      setInterval(refreshStatus, 2500);
    })();
  </script>
</body>
</html>`;
}
