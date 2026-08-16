export type WebReachability = "checking" | "online" | "offline";
export type ApiReachability = WebReachability | "not-applicable";

export interface RecoveryPageModel {
  currentUrl: string;
  error: string;
  recentUrls: string[];
  appVersion: string;
  platform: string;
  webStatus: WebReachability;
  apiStatus: ApiReachability;
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
  const recentButtons = model.recentUrls
    .map(
      (url) => `
        <button class="recent" type="button" data-recent-url="${escapeHtml(url)}">
          <span class="recent-dot"></span>
          <span>${escapeHtml(url)}</span>
        </button>`,
    )
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';" />
  <title>Rakazo Connection Center</title>
  <style>
    :root {
      color-scheme: dark;
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif;
      background: #07080c;
      color: #f6f7fb;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      overflow-x: hidden;
      background:
        radial-gradient(circle at 18% 12%, rgba(96, 91, 255, .18), transparent 30rem),
        radial-gradient(circle at 88% 2%, rgba(66, 211, 146, .10), transparent 26rem),
        linear-gradient(160deg, #090a10 0%, #050609 70%);
    }
    body::before {
      content: "";
      position: fixed;
      inset: 0;
      pointer-events: none;
      opacity: .18;
      background-image: linear-gradient(rgba(255,255,255,.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.025) 1px, transparent 1px);
      background-size: 32px 32px;
      mask-image: linear-gradient(to bottom, black, transparent 75%);
    }
    main {
      width: min(900px, calc(100% - 48px));
      margin: 0 auto;
      padding: 58px 0 64px;
      position: relative;
    }
    .brand { display: flex; align-items: center; gap: 12px; color: #b9bbca; font-size: 13px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
    .mark {
      display: grid;
      place-items: center;
      width: 34px;
      height: 34px;
      border-radius: 11px;
      color: white;
      background: linear-gradient(145deg, #716cff, #4f46d8);
      box-shadow: 0 12px 30px rgba(83, 75, 224, .35), inset 0 1px rgba(255,255,255,.25);
      font-size: 17px;
    }
    h1 { margin: 26px 0 12px; font-size: clamp(34px, 5vw, 52px); letter-spacing: -.045em; line-height: 1.02; }
    .lede { max-width: 720px; margin: 0; color: #a7a9b7; font-size: 16px; line-height: 1.6; }
    .target-inline { color: #d6d4ff; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .92em; }
    .status-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin: 30px 0 18px; }
    .status-card, .panel {
      border: 1px solid rgba(255,255,255,.085);
      background: rgba(17, 18, 26, .76);
      box-shadow: 0 18px 45px rgba(0,0,0,.22), inset 0 1px rgba(255,255,255,.025);
      backdrop-filter: blur(20px);
    }
    .status-card { border-radius: 16px; padding: 16px 18px; display: flex; align-items: center; justify-content: space-between; gap: 16px; }
    .status-name { color: #a6a8b6; font-size: 13px; }
    .status-value { display: inline-flex; align-items: center; gap: 7px; font-size: 13px; font-weight: 650; }
    .status-value::before { content: ""; width: 7px; height: 7px; border-radius: 999px; background: #f2a65a; box-shadow: 0 0 14px rgba(242,166,90,.55); }
    .panel { border-radius: 22px; padding: 22px; margin-top: 12px; }
    .panel-title { margin: 0 0 6px; font-size: 17px; letter-spacing: -.015em; }
    .panel-copy { margin: 0 0 18px; color: #858896; font-size: 13px; line-height: 1.55; }
    label { display: block; margin-bottom: 8px; color: #b6b8c5; font-size: 12px; font-weight: 650; }
    .connection-row { display: grid; grid-template-columns: 1fr auto; gap: 10px; }
    input {
      width: 100%;
      min-width: 0;
      border: 1px solid rgba(255,255,255,.11);
      border-radius: 12px;
      background: #0a0b10;
      color: #f5f5fa;
      padding: 12px 13px;
      outline: none;
      font: 13px ui-monospace, SFMono-Regular, Menlo, monospace;
      transition: border-color .15s ease, box-shadow .15s ease;
    }
    input:focus { border-color: #7069ff; box-shadow: 0 0 0 3px rgba(112,105,255,.14); }
    button {
      appearance: none;
      border: 1px solid rgba(255,255,255,.1);
      border-radius: 12px;
      background: rgba(255,255,255,.055);
      color: #f5f5f8;
      padding: 11px 14px;
      font: 650 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      cursor: pointer;
      transition: transform .12s ease, background .12s ease, border-color .12s ease;
    }
    button:hover { background: rgba(255,255,255,.09); border-color: rgba(255,255,255,.16); }
    button:active { transform: translateY(1px); }
    button.primary { background: linear-gradient(145deg, #726cff, #5b53e8); border-color: #817bff; box-shadow: 0 10px 22px rgba(91,83,232,.22); white-space: nowrap; }
    .actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
    .error { margin-top: 14px; border-radius: 12px; background: rgba(255, 111, 111, .075); border: 1px solid rgba(255,111,111,.14); padding: 11px 12px; color: #d9a3a3; font: 12px ui-monospace, SFMono-Regular, Menlo, monospace; overflow-wrap: anywhere; }
    .recent-list { display: grid; gap: 7px; }
    .recent { width: 100%; display: flex; align-items: center; gap: 10px; text-align: left; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-weight: 500; color: #c9cad4; }
    .recent-dot { width: 7px; height: 7px; border-radius: 999px; flex: 0 0 auto; background: #736cff; box-shadow: 0 0 12px rgba(115,108,255,.55); }
    .setup { margin: 0; padding: 14px 16px; overflow-x: auto; border: 1px solid rgba(255,255,255,.075); border-radius: 13px; background: #08090d; color: #bfc2d0; font: 12px/1.7 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre-wrap; }
    .footer { margin-top: 18px; display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; color: #676a78; font-size: 11px; }
    .auto { color: #8d90a0; }
    .auto::before { content: "↻"; margin-right: 6px; color: #7c76ff; }
    @media (max-width: 660px) {
      main { width: min(100% - 28px, 900px); padding-top: 38px; }
      .status-grid { grid-template-columns: 1fr; }
      .connection-row { grid-template-columns: 1fr; }
      .connection-row button { width: 100%; }
      h1 { font-size: 38px; }
    }
  </style>
</head>
<body>
  <main>
    <div class="brand"><div class="mark">R</div><span>Rakazo Desktop</span></div>
    <h1>Connection Center</h1>
    <p class="lede">The desktop app is running, but the Rakazo web origin at <span class="target-inline">${escapeHtml(model.currentUrl)}</span> is not available yet. Connect to a running local or remote Rakazo deployment below—this screen will reconnect automatically when it comes online.</p>

    <section class="status-grid" aria-label="Connection health">
      <div class="status-card"><span class="status-name">Web origin</span><span class="status-value" id="web-status">${statusLabel(model.webStatus)}</span></div>
      <div class="status-card"><span class="status-name">Rakazo API</span><span class="status-value" id="api-status">${statusLabel(model.apiStatus)}</span></div>
    </section>

    <section class="panel">
      <h2 class="panel-title">Connect</h2>
      <p class="panel-copy">Use the local development origin or point the desktop client at a self-hosted Rakazo web URL. Only HTTP and HTTPS endpoints are accepted.</p>
      <form id="connection-form">
        <label for="target-url">Rakazo web URL</label>
        <div class="connection-row">
          <input id="target-url" name="target-url" value="${escapeHtml(model.currentUrl)}" spellcheck="false" autocomplete="off" />
          <button class="primary" type="submit">Save &amp; Connect</button>
        </div>
      </form>
      <div class="actions">
        <button type="button" id="retry">Retry</button>
        <button type="button" id="reset">Reset to Local</button>
        <button type="button" id="copy-diagnostics">Copy Diagnostics</button>
      </div>
      <div class="error" id="navigation-error">${escapeHtml(model.error || "Waiting for the web origin…")}</div>
    </section>

    ${recentButtons ? `<section class="panel"><h2 class="panel-title">Recent connections</h2><p class="panel-copy">Switch deployments without reopening Terminal or changing environment variables.</p><div class="recent-list">${recentButtons}</div></section>` : ""}

    <section class="panel">
      <h2 class="panel-title">Starting Rakazo locally</h2>
      <p class="panel-copy">The DMG is the desktop client; the current self-hosted architecture still needs the Rakazo web/API stack. From a Rakazo checkout:</p>
      <pre class="setup">docker compose -f infra/compose/docker-compose.yml up postgres -d
pnpm db:migrate
pnpm dev</pre>
      <p class="panel-copy" style="margin: 14px 0 0">Once Vite is listening on <strong>127.0.0.1:5173</strong>, this window will reconnect automatically.</p>
    </section>

    <div class="footer">
      <span>Rakazo ${escapeHtml(model.appVersion)} · ${escapeHtml(model.platform)}</span>
      <span class="auto">Auto-reconnect active</span>
    </div>
  </main>
  <script>
    (() => {
      const bridge = window.rakazoDesktop && window.rakazoDesktop.connection;
      const form = document.getElementById("connection-form");
      const input = document.getElementById("target-url");
      const retry = document.getElementById("retry");
      const reset = document.getElementById("reset");
      const copy = document.getElementById("copy-diagnostics");
      if (!bridge) return;

      form.addEventListener("submit", (event) => {
        event.preventDefault();
        bridge.setUrl(input.value);
      });
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
    })();
  </script>
</body>
</html>`;
}
