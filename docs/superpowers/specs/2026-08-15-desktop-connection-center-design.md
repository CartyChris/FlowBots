# Desktop Connection Center Design

## Problem

The packaged Electron app currently opens a `BrowserWindow` and immediately calls `loadURL()` for `RAKAZO_WEB_URL`, defaulting to `http://127.0.0.1:5173`. The installer only contains the Electron desktop bundle; it does not contain or start the Vite web server, API, worker, Postgres, or sandbox supervisor. When the web origin is absent, the `loadURL()` rejection is ignored and the user sees a black window.

This is consistent with the current README, which states that packaged builds still require a running API and web origin, but the runtime experience gives the user no explanation or recovery path.

## Goal

Make the macOS desktop client fail visibly and recoverably instead of showing a black screen, while making local and remote Rakazo deployments easy to select and diagnose.

This pass does **not** attempt to bundle the full self-hosted Rakazo backend into the DMG. Doing that correctly would require a separate deployment architecture for Postgres, Graphile Worker, sandbox lifecycle, secrets, migrations, Docker/E2B, upgrades, and failure recovery.

## Chosen approach

Keep Electron as a client of a Rakazo web origin, but add a native desktop connection layer around navigation.

On launch, Electron resolves the configured web URL and attempts to load it. If navigation succeeds, the normal Rakazo UI is shown. If it fails, Electron renders a local Connection Center page inside the same window. The Connection Center is available manually from the application menu as well, so changing deployments does not require environment variables or Terminal.

## Feature 1: Startup Recovery Center

When `BrowserWindow.loadURL()` rejects, the app must never remain blank. It must render a local recovery page that includes:

- the failed URL;
- the normalized Electron error;
- a Retry action;
- a URL field with Save & Connect;
- Reset to Local (`http://127.0.0.1:5173`);
- concise local setup commands copied from the documented quick start;
- current app version and platform;
- a clear statement that the desktop client requires a Rakazo web/API deployment.

The page uses the existing sandboxed, context-isolated preload. It does not enable Node integration.

## Feature 2: Saved connection profiles

Persist non-secret connection settings under Electron `userData` in `connection-settings.json`.

Schema:

```ts
export interface ConnectionSettings {
  activeUrl?: string;
  recentUrls: string[];
}
```

Rules:

- Only `http:` and `https:` URLs are accepted.
- URLs are normalized to origin/path without a trailing slash.
- `recentUrls` is de-duplicated, newest first, and capped at five entries.
- The active saved URL takes precedence over `RAKAZO_WEB_URL`; reset clears the saved override and returns to the environment/default URL.
- The Connection Center shows recent endpoints as one-click choices.
- The native application menu exposes **Connection…** with `CmdOrCtrl+,`.

No credentials, API keys, cookies, or tokens are stored in this file.

## Feature 3: Live diagnostics and auto-reconnect

While the Connection Center is visible:

- Electron probes the configured web origin on a bounded timeout.
- For local targets (`localhost` / `127.0.0.1`), it also probes `http://127.0.0.1:3100/health` so the page can distinguish “web server down” from “API down”.
- The app retries automatically on a short interval while preserving manual Retry.
- If the web origin becomes reachable, Electron reconnects automatically.
- A Copy Diagnostics action copies a small plaintext report containing app version, platform, target URL, last navigation error, web reachability, and API health state. It must never include environment variables, secrets, cookies, or headers.

Remote endpoints are treated as web-origin connections. The desktop client does not guess remote internal API ports.

## Architecture and file boundaries

### `apps/desktop/src/connection.ts`
Pure URL/settings/domain logic:

- `normalizeWebUrl(value: string): string`
- `defaultWebUrl(env?: NodeJS.ProcessEnv): string`
- `rememberWebUrl(settings: ConnectionSettings, url: string): ConnectionSettings`
- `localApiHealthUrl(webUrl: string): string | undefined`

This file contains no Electron imports and is unit-tested directly.

### `apps/desktop/src/connection-settings.ts`
Filesystem persistence behind a tiny interface:

- `readConnectionSettings(filePath: string): Promise<ConnectionSettings>`
- `writeConnectionSettings(filePath: string, settings: ConnectionSettings): Promise<void>`

Malformed or missing files resolve to `{ recentUrls: [] }`; write uses a temporary file plus rename to avoid partial JSON.

### `apps/desktop/src/navigation.ts`
Small dependency-injected navigation coordinator:

- attempt remote navigation;
- convert failure into a typed result;
- never swallow an error without returning recovery state.

This is the regression seam for the black-screen bug.

### `apps/desktop/src/recovery-page.ts`
Pure HTML renderer. All user-controlled text is HTML-escaped. The page talks only to the restricted `window.rakazoDesktop.connection` preload bridge.

### `apps/desktop/src/main.ts`
Electron orchestration only:

- resolve settings path;
- register IPC handlers;
- build native menu;
- connect / retry / reset;
- schedule and clear reconnect timer;
- render Connection Center on failure;
- copy diagnostics with Electron clipboard.

### `apps/desktop/src/preload.cjs`
Extend the existing bridge with connection actions; do not expose Node primitives.

## Error handling

- Invalid saved URLs are ignored and reported as a settings-level diagnostic rather than crashing startup.
- Navigation errors are normalized into short text for the page and full Electron error text for diagnostics.
- Recovery rendering itself uses a `data:text/html` URL generated locally, so it does not depend on the unavailable web server.
- Auto-retry is stopped as soon as a remote page loads successfully or the window closes.
- Failed API health probes never prevent a working web origin from loading.

## Testing

TDD is required.

1. Add a failing navigation regression test proving a rejected `loadURL()` returns recovery state rather than being silently ignored.
2. Add failing URL/settings tests for validation, normalization, recents, and local API health derivation.
3. Add failing recovery HTML tests for escaping and required actions/copy.
4. Implement the minimal production code to make each test pass.
5. Run desktop tests, repository `lint`, `check`, and `verify:fast`.
6. Package on GitHub Actions and require the universal DMG artifact assertion to pass.

## Documentation

README desktop packaging language must explicitly state:

- the installer is a client, not the full self-hosted server stack;
- opening the app without a reachable web origin now shows Connection Center instead of a blank window;
- how to run the local stack;
- how to point the app at a remote/self-hosted Rakazo origin without setting a shell environment variable.

CHANGELOG must record the black-screen recovery fix and the three desktop features.

## Non-goals

- Bundling Postgres into Electron.
- Automatically installing Docker Desktop.
- Running arbitrary shell commands from the Connection Center.
- Storing provider credentials in desktop settings.
- Replacing the existing web/API architecture.
