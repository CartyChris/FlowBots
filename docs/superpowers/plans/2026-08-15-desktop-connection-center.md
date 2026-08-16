# Desktop Connection Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the packaged desktop black screen with a recoverable Connection Center, saved connection profiles, and live diagnostics/auto-reconnect.

**Architecture:** Keep Electron as a client of a Rakazo web origin. Move URL/settings/navigation behavior into small testable desktop modules, let `main.ts` orchestrate Electron and IPC, and render a local recovery page whenever remote navigation fails. Persist only non-secret endpoint history under Electron `userData`.

**Tech Stack:** Electron 37, TypeScript 5.9, Vitest 4, Node.js fs/http primitives, existing pnpm/turbo/biome toolchain.

## Global Constraints

- Only `http:` and `https:` web targets are accepted.
- Never store provider credentials, cookies, tokens, headers, or environment-variable contents in desktop settings or diagnostics.
- Keep `nodeIntegration: false`, `contextIsolation: true`, and `sandbox: true`.
- Recovery UI must render without any external web server.
- `recentUrls` is newest-first, de-duplicated, and capped at five.
- A saved active URL overrides `RAKAZO_WEB_URL`; reset returns to `RAKAZO_WEB_URL` or `http://127.0.0.1:5173`.
- Do not bundle Postgres/Docker/backend orchestration in this pass.
- Every production behavior is introduced through a failing test first.

---

## File structure

- Create `apps/desktop/src/connection.ts` — pure URL/settings rules.
- Create `apps/desktop/src/connection.test.ts` — URL/settings regression tests.
- Create `apps/desktop/src/connection-settings.ts` — JSON persistence.
- Create `apps/desktop/src/connection-settings.test.ts` — persistence tests using a temporary directory.
- Create `apps/desktop/src/navigation.ts` — dependency-injected remote navigation state.
- Create `apps/desktop/src/navigation.test.ts` — black-screen regression test.
- Create `apps/desktop/src/recovery-page.ts` — escaped local Connection Center HTML.
- Create `apps/desktop/src/recovery-page.test.ts` — recovery copy/actions/escaping tests.
- Modify `apps/desktop/src/main.ts` — Electron orchestration, IPC, menu, diagnostics, retry timer.
- Modify `apps/desktop/src/preload.cjs` — restricted connection bridge.
- Modify `README.md` — correct installer expectations and explain Connection Center.
- Modify `CHANGELOG.md` — record desktop reliability/features.

---

### Task 1: Prove the black-screen navigation bug

**Files:**
- Create: `apps/desktop/src/navigation.test.ts`
- Create after RED: `apps/desktop/src/navigation.ts`

**Interfaces:**
- Produces: `attemptNavigation(load: (url: string) => Promise<void>, url: string): Promise<NavigationResult>`
- Produces type: `NavigationResult = { ok: true; url: string } | { ok: false; url: string; error: string }`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { attemptNavigation } from "./navigation.js";

describe("desktop navigation", () => {
  it("returns recovery state when the web origin cannot be loaded", async () => {
    const result = await attemptNavigation(
      async () => {
        throw new Error("ERR_CONNECTION_REFUSED (-102)");
      },
      "http://127.0.0.1:5173",
    );

    expect(result).toEqual({
      ok: false,
      url: "http://127.0.0.1:5173",
      error: "ERR_CONNECTION_REFUSED (-102)",
    });
  });

  it("returns connected state when navigation succeeds", async () => {
    const result = await attemptNavigation(async () => undefined, "https://rakazo.example");
    expect(result).toEqual({ ok: true, url: "https://rakazo.example" });
  });
});
```

- [ ] **Step 2: Run the targeted test and verify RED**

Run: `pnpm --filter @rakazo/desktop test -- navigation.test.ts`
Expected: FAIL because `./navigation.js` / `attemptNavigation` does not exist.

- [ ] **Step 3: Implement minimal navigation helper**

```ts
export type NavigationResult =
  | { ok: true; url: string }
  | { ok: false; url: string; error: string };

export async function attemptNavigation(
  load: (url: string) => Promise<void>,
  url: string,
): Promise<NavigationResult> {
  try {
    await load(url);
    return { ok: true, url };
  } catch (error) {
    return { ok: false, url, error: error instanceof Error ? error.message : String(error) };
  }
}
```

- [ ] **Step 4: Re-run targeted test and verify GREEN**

Run: `pnpm --filter @rakazo/desktop test -- navigation.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `test: capture desktop navigation failure`

---

### Task 2: URL validation and saved profile rules

**Files:**
- Create: `apps/desktop/src/connection.test.ts`
- Create after RED: `apps/desktop/src/connection.ts`

**Interfaces:**

```ts
export interface ConnectionSettings {
  activeUrl?: string;
  recentUrls: string[];
}
export function normalizeWebUrl(value: string): string;
export function defaultWebUrl(env?: NodeJS.ProcessEnv): string;
export function rememberWebUrl(settings: ConnectionSettings, url: string): ConnectionSettings;
export function localApiHealthUrl(webUrl: string): string | undefined;
```

- [ ] **Step 1: Write failing tests**

Cover all of these behaviors in `connection.test.ts`:

```ts
expect(normalizeWebUrl(" https://example.com/ ")).toBe("https://example.com");
expect(normalizeWebUrl("http://127.0.0.1:5173/room/")).toBe("http://127.0.0.1:5173/room");
expect(() => normalizeWebUrl("file:///tmp/index.html")).toThrow(/http/i);
expect(() => normalizeWebUrl("javascript:alert(1)")).toThrow(/http/i);
expect(defaultWebUrl({ RAKAZO_WEB_URL: "https://host.example/" } as NodeJS.ProcessEnv)).toBe("https://host.example");
expect(defaultWebUrl({} as NodeJS.ProcessEnv)).toBe("http://127.0.0.1:5173");
expect(rememberWebUrl({ recentUrls: ["https://b.test", "https://a.test"] }, "https://a.test")).toEqual({
  activeUrl: "https://a.test",
  recentUrls: ["https://a.test", "https://b.test"],
});
expect(rememberWebUrl({ recentUrls: ["https://1.test", "https://2.test", "https://3.test", "https://4.test", "https://5.test"] }, "https://6.test").recentUrls).toHaveLength(5);
expect(localApiHealthUrl("http://127.0.0.1:5173")).toBe("http://127.0.0.1:3100/health");
expect(localApiHealthUrl("http://localhost:5173/foo")).toBe("http://127.0.0.1:3100/health");
expect(localApiHealthUrl("https://rakazo.example")).toBeUndefined();
```

- [ ] **Step 2: Verify RED**

Run: `pnpm --filter @rakazo/desktop test -- connection.test.ts`
Expected: FAIL because `connection.ts` does not exist.

- [ ] **Step 3: Implement minimal pure rules**

Implementation requirements:
- `new URL(value.trim())`;
- reject any protocol other than `http:` or `https:`;
- strip trailing slash from pathname except root;
- remove root trailing slash by returning `url.origin` when pathname is `/` and there is no query/hash;
- de-duplicate recents and slice to five;
- normalize the environment/default URL through the same validator.

- [ ] **Step 4: Verify GREEN**

Run: `pnpm --filter @rakazo/desktop test -- connection.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `feat: add desktop connection profile rules`

---

### Task 3: Persist connection settings safely

**Files:**
- Create: `apps/desktop/src/connection-settings.test.ts`
- Create after RED: `apps/desktop/src/connection-settings.ts`

**Interfaces:**

```ts
export async function readConnectionSettings(filePath: string): Promise<ConnectionSettings>;
export async function writeConnectionSettings(filePath: string, settings: ConnectionSettings): Promise<void>;
```

- [ ] **Step 1: Write failing tests**

Use `mkdtemp`, `tmpdir`, and `path.join` to prove:
- missing file returns `{ recentUrls: [] }`;
- malformed JSON returns `{ recentUrls: [] }`;
- valid JSON round-trips `activeUrl` and `recentUrls`;
- invalid URL entries in stored JSON are discarded rather than crashing;
- write creates parent directory when absent.

- [ ] **Step 2: Verify RED**

Run: `pnpm --filter @rakazo/desktop test -- connection-settings.test.ts`
Expected: FAIL because persistence module is missing.

- [ ] **Step 3: Implement minimal persistence**

Implementation requirements:
- parse JSON defensively;
- normalize any retained URL through `normalizeWebUrl`;
- use `{ recentUrls: [] }` on missing/malformed content;
- write JSON to `${filePath}.tmp`, then `rename()` over the destination;
- `mkdir(dirname(filePath), { recursive: true })` before write.

- [ ] **Step 4: Verify GREEN**

Run: `pnpm --filter @rakazo/desktop test -- connection-settings.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `feat: persist desktop connection settings`

---

### Task 4: Recovery Center HTML and diagnostics copy

**Files:**
- Create: `apps/desktop/src/recovery-page.test.ts`
- Create after RED: `apps/desktop/src/recovery-page.ts`

**Interfaces:**

```ts
export interface RecoveryPageModel {
  currentUrl: string;
  error: string;
  recentUrls: string[];
  appVersion: string;
  platform: string;
  webStatus: "checking" | "offline";
  apiStatus: "checking" | "online" | "offline" | "not-applicable";
}
export function recoveryPageHtml(model: RecoveryPageModel): string;
export function diagnosticsText(model: RecoveryPageModel): string;
```

- [ ] **Step 1: Write failing tests**

Assert that generated HTML:
- contains `Connection Center`, `Retry`, `Save & Connect`, `Reset to Local`, `Copy Diagnostics`;
- contains the local quick-start commands `docker compose -f infra/compose/docker-compose.yml up postgres -d` and `pnpm dev`;
- renders recent endpoints;
- escapes `<script>alert(1)</script>` from both URL/error fields;
- does not contain `process.env`, cookie/header dumps, or provider key names.

Assert diagnostics text contains only app/platform/URL/error/web/API fields.

- [ ] **Step 2: Verify RED**

Run: `pnpm --filter @rakazo/desktop test -- recovery-page.test.ts`
Expected: FAIL because renderer does not exist.

- [ ] **Step 3: Implement minimal renderer**

Use a local `escapeHtml()` helper for every interpolated value. Inline page JavaScript may call only:
- `window.rakazoDesktop.connection.retry()`;
- `window.rakazoDesktop.connection.setUrl(value)`;
- `window.rakazoDesktop.connection.reset()`;
- `window.rakazoDesktop.connection.useRecent(url)`;
- `window.rakazoDesktop.connection.copyDiagnostics()`.

Keep the visual treatment dark and consistent with the existing app, but do not add external fonts/assets.

- [ ] **Step 4: Verify GREEN**

Run: `pnpm --filter @rakazo/desktop test -- recovery-page.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `feat: add desktop connection recovery screen`

---

### Task 5: Wire Electron orchestration and auto-reconnect

**Files:**
- Modify: `apps/desktop/src/main.ts`
- Modify: `apps/desktop/src/preload.cjs`

**Interfaces consumed:**
- `attemptNavigation()` from Task 1;
- connection/profile helpers from Task 2;
- settings persistence from Task 3;
- recovery renderer/diagnostics from Task 4.

- [ ] **Step 1: Add a failing integration-shaped unit test before orchestration changes**

Extend `navigation.test.ts` with a retry-controller test around a new pure helper:

```ts
export function shouldAutoRetry(state: { connected: boolean; windowDestroyed: boolean }): boolean;
```

Expected behavior:
- false when connected;
- false when window destroyed;
- true only while disconnected and window alive.

Run the targeted test and verify it fails because the helper is missing.

- [ ] **Step 2: Implement the minimal retry helper and verify GREEN**

Run: `pnpm --filter @rakazo/desktop test -- navigation.test.ts`
Expected: PASS.

- [ ] **Step 3: Replace fire-and-forget startup navigation**

In `main.ts`:
- resolve settings path with `path.join(app.getPath("userData"), "connection-settings.json")`;
- load settings on ready;
- compute current target as `settings.activeUrl ?? defaultWebUrl(process.env)`;
- call `attemptNavigation((url) => win.loadURL(url), target)`;
- on `{ ok: false }`, render `recoveryPageHtml()` via a local `data:text/html;charset=utf-8,` URL;
- never leave a rejected `loadURL()` unhandled.

- [ ] **Step 4: Add restricted IPC actions**

Register handlers:
- `desktop.connection.retry`;
- `desktop.connection.setUrl`;
- `desktop.connection.reset`;
- `desktop.connection.useRecent`;
- `desktop.connection.copyDiagnostics`;
- `desktop.connection.open`.

`setUrl` and `useRecent` must call `normalizeWebUrl()` before persistence/navigation.

- [ ] **Step 5: Extend preload bridge**

Expose only those connection actions under `window.rakazoDesktop.connection`. Do not expose filesystem, shell execution, environment access, arbitrary IPC send/invoke, or Node objects.

- [ ] **Step 6: Add app menu access**

Use Electron `Menu` to add **Connection…** with accelerator `CmdOrCtrl+,`. Selecting it renders Connection Center even if the current web origin is healthy.

- [ ] **Step 7: Add bounded health probes and auto-retry**

- Web probe: `fetch(target, { signal: AbortSignal.timeout(2500) })`; any HTTP response counts as reachable.
- Local API probe only when `localApiHealthUrl(target)` returns a URL; parse `/health` JSON and require `ok === true` for online.
- Retry interval: 5 seconds while recovery page is displayed.
- Clear retry timer on successful navigation, window close, and app quit.
- A failed health probe updates recovery state but never crashes main process.

- [ ] **Step 8: Run desktop tests**

Run: `pnpm --filter @rakazo/desktop test`
Expected: all desktop tests PASS.

- [ ] **Step 9: Commit**

Commit message: `fix: recover from unavailable desktop web origin`

---

### Task 6: Documentation and full repository verification

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Update README**

Replace ambiguous “Ships as a real Mac app” wording with accurate client wording. In **Run the desktop app**, explain:
- local stack still provides API/worker/database/sandbox services;
- packaged desktop now shows Connection Center if the web origin is unavailable;
- use **Rakazo → Connection…** / `Cmd+,` to switch endpoint;
- saved endpoint selection removes the need to launch Electron from a shell just to set `RAKAZO_WEB_URL`.

- [ ] **Step 2: Update CHANGELOG**

Add bullets under current **Fixed/Added** sections for:
- no more black screen on unreachable web origin;
- Connection Center;
- recent endpoint profiles;
- live health diagnostics and auto-reconnect.

- [ ] **Step 3: Run formatting/lint**

Run: `pnpm lint`
Expected: PASS with no errors.

- [ ] **Step 4: Run type checking**

Run: `pnpm check`
Expected: PASS.

- [ ] **Step 5: Run fast verification**

Run: `pnpm verify:fast`
Expected: PASS.

- [ ] **Step 6: Commit**

Commit message: `docs: explain desktop connection requirements`

---

### Task 7: GitHub Actions package gate and delivery

**Files:**
- No workflow changes expected unless verification proves the existing package workflow insufficient.

- [ ] **Step 1: Push branch and inspect Actions**

Require the existing CI and `macOS package` workflows to run against the branch/PR.

- [ ] **Step 2: Verify CI**

Pass conditions:
- `pnpm lint` success;
- `pnpm check` success;
- `pnpm verify:fast` success.

- [ ] **Step 3: Verify macOS packaging**

Pass conditions:
- `macos-14` package job success;
- `electron-builder --mac --universal` success;
- shell assertion finds `apps/desktop/out/*.dmg`;
- artifact upload success.

- [ ] **Step 4: Review final PR diff skeptically**

Confirm:
- no secret/env dumps in diagnostics;
- no Node integration/security regression;
- invalid URL schemes rejected;
- no infinite retry timer after successful connection/window close;
- README no longer implies standalone backend bundling.

- [ ] **Step 5: Merge only after exact head SHA is green**

Use a normal merge commit into `main` and verify post-merge CI/package on the exact merge SHA.

- [ ] **Step 6: Download final DMG and checksum it**

Deliver the fresh universal `.dmg` and SHA-256. Record the existing confirmed limitation that the CI build is unsigned/unnotarized because `CSC_IDENTITY_AUTO_DISCOVERY=false`.
