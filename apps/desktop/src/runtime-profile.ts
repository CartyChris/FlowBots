export type RuntimeMode = "lite" | "full-local" | "remote";

export type RuntimeProfile =
  | { mode: "lite" }
  | { mode: "full-local"; serverUrl: string }
  | { mode: "remote"; serverUrl: string };

export interface RuntimeModeOption {
  id: RuntimeMode;
  title: string;
  description: string;
  recommended?: boolean;
}

export const RUNTIME_MODES: RuntimeModeOption[] = [
  {
    id: "lite",
    title: "Lite",
    description:
      "Runs entirely on this Mac. No Docker, separate Postgres, pnpm, or Terminal setup.",
    recommended: true,
  },
  {
    id: "full-local",
    title: "Full Local",
    description:
      "Connect to a full local FlowBots stack with PostgreSQL and your chosen computer provider.",
  },
  {
    id: "remote",
    title: "Remote",
    description: "Connect this desktop client to a trusted FlowBots server.",
  },
];

const DEFAULT_FULL_LOCAL_URL = "http://127.0.0.1:5173";

export function parseRuntimeProfile(value: unknown): RuntimeProfile | null {
  if (!value || typeof value !== "object") return null;
  try {
    return normalizeRuntimeProfile(value as { mode: string; serverUrl?: string });
  } catch {
    return null;
  }
}

export function normalizeRuntimeProfile(value: {
  mode: string;
  serverUrl?: string;
}): RuntimeProfile {
  if (value.mode === "lite") return { mode: "lite" };
  if (value.mode === "full-local") {
    return {
      mode: "full-local",
      serverUrl: normalizeServerUrl(value.serverUrl ?? DEFAULT_FULL_LOCAL_URL, "full-local"),
    };
  }
  if (value.mode === "remote") {
    if (!value.serverUrl?.trim()) throw new Error("A Remote server URL is required.");
    return { mode: "remote", serverUrl: normalizeServerUrl(value.serverUrl, "remote") };
  }
  throw new Error(`Unknown FlowBots runtime mode "${value.mode}".`);
}

function normalizeServerUrl(value: string, mode: "full-local" | "remote"): string {
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new Error("Enter a valid http:// or https:// FlowBots server URL.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("FlowBots server URLs must use http:// or https://.");
  }
  if (parsed.username || parsed.password) {
    throw new Error("Credential-bearing URLs are not allowed. Sign in inside FlowBots instead.");
  }
  if (parsed.search || parsed.hash) {
    throw new Error("FlowBots server URLs cannot include query strings or fragments.");
  }
  if (
    mode === "remote" &&
    parsed.protocol !== "https:" &&
    parsed.hostname !== "127.0.0.1" &&
    parsed.hostname !== "localhost"
  ) {
    throw new Error("Remote FlowBots servers must use HTTPS; HTTP is allowed only for localhost.");
  }
  const pathname = parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/+$/, "");
  return `${parsed.origin}${pathname}`;
}

export async function activateRuntimeProfile(
  value: { mode: string; serverUrl?: string },
  deps: { startLite(): Promise<{ origin: string; stop(): Promise<void> }> },
): Promise<{ mode: RuntimeMode; origin: string; stop?: () => Promise<void> }> {
  const profile = normalizeRuntimeProfile(value);
  if (profile.mode === "lite") {
    const runtime = await deps.startLite();
    return { mode: "lite", origin: runtime.origin, stop: runtime.stop.bind(runtime) };
  }
  return { mode: profile.mode, origin: profile.serverUrl };
}

export function runtimeLauncherHtml(error = ""): string {
  const safeError = escapeHtml(error);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'" />
<title>Choose how FlowBots runs</title>
<style>
:root{color-scheme:dark;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display",Inter,system-ui,sans-serif;background:#090b10;color:#f5f7fb}
*{box-sizing:border-box} body{margin:0;min-height:100vh;display:grid;place-items:center;background:radial-gradient(circle at 50% -10%,#213259 0,#10141e 35%,#090b10 68%)}
main{width:min(900px,calc(100% - 36px));padding:42px 0} .eyebrow{font-size:12px;letter-spacing:.15em;text-transform:uppercase;color:#8ea7d8;font-weight:700}
h1{font-size:clamp(32px,5vw,54px);margin:10px 0 8px;letter-spacing:-.04em}.sub{color:#a8b0bf;max-width:650px;line-height:1.55;margin-bottom:26px}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.card{position:relative;text-align:left;min-height:205px;padding:22px;border:1px solid #293142;border-radius:18px;background:rgba(19,24,34,.88);color:inherit;cursor:pointer;transition:.15s transform,.15s border-color,.15s background}
.card:hover,.card:focus-visible{transform:translateY(-2px);border-color:#6d8ed0;background:#171e2c;outline:none}.card strong{display:block;font-size:22px;margin:8px 0}.card p{margin:0;color:#a8b0bf;line-height:1.5;font-size:14px}.badge{display:inline-flex;border-radius:999px;padding:5px 9px;background:#254a88;color:#dce9ff;font-size:11px;font-weight:800;letter-spacing:.04em}
.remote{display:none;margin-top:12px}.remote.active{display:flex;gap:8px}.remote input{flex:1;padding:12px 13px;border-radius:10px;border:1px solid #344058;background:#0b0e14;color:#fff}.remote button{padding:12px 15px;border:0;border-radius:10px;background:#dce9ff;color:#0b1426;font-weight:800;cursor:pointer}
.error{margin:0 0 16px;padding:12px 14px;border:1px solid #773841;border-radius:10px;background:#30171b;color:#ffbec5}.hint{margin-top:19px;color:#717b8d;font-size:12px}
@media(max-width:720px){.grid{grid-template-columns:1fr}.card{min-height:0}main{padding:24px 0}}
</style></head><body><main>
<div class="eyebrow">FlowBots Runtime</div><h1>How should FlowBots run?</h1>
<p class="sub">Choose the architecture that fits this Mac. You can change it later from the Connection Center.</p>
${safeError ? `<div class="error" role="alert">${safeError}</div>` : ""}
<div class="grid">
<button class="card" data-runtime-mode="lite"><span class="badge">Recommended</span><strong>Lite</strong><p>Runs entirely on this Mac. No Docker, separate Postgres, pnpm, or Terminal setup.</p></button>
<button class="card" data-runtime-mode="full-local"><strong>Full Local</strong><p>Connect to the complete local FlowBots stack with PostgreSQL and your chosen isolated computer provider.</p></button>
<button class="card" data-runtime-mode="remote"><strong>Remote</strong><p>Connect to a trusted FlowBots server over the network.</p></button>
</div>
<form class="remote" id="remote-form"><input id="remote-url" type="url" required placeholder="https://app.example.com" aria-label="Remote FlowBots server URL"/><button type="submit">Connect</button></form>
<div class="hint">Lite keeps your database and agent workspace local. Full Local and Remote never silently fall back to Lite.</div>
</main><script>
const invoke=(profile)=>window.rakazoDesktop?.runtime?.choose?.(profile);
document.querySelector('[data-runtime-mode="lite"]').addEventListener('click',()=>invoke({mode:'lite'}));
document.querySelector('[data-runtime-mode="full-local"]').addEventListener('click',()=>invoke({mode:'full-local'}));
document.querySelector('[data-runtime-mode="remote"]').addEventListener('click',()=>{document.getElementById('remote-form').classList.add('active');document.getElementById('remote-url').focus();});
document.getElementById('remote-form').addEventListener('submit',(event)=>{event.preventDefault();invoke({mode:'remote',serverUrl:document.getElementById('remote-url').value});});
</script></body></html>`;
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char]!,
  );
}
