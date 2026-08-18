import type { RuntimeHealthResult, RuntimeHealthTarget } from "./runtime-health.js";
import type { RuntimeMode, RuntimeProfile } from "./runtime-profile.js";

export interface ActiveRuntime {
  mode: RuntimeMode;
  origin: string;
  stop?: () => Promise<void>;
}

export interface DesktopRuntimeSessionDeps {
  activate(profile: RuntimeProfile): Promise<ActiveRuntime>;
  probe(target: RuntimeHealthTarget): Promise<RuntimeHealthResult>;
  navigate(origin: string): Promise<void>;
  persist(profile: RuntimeProfile): Promise<void>;
  showLauncher(error: string): Promise<void>;
}

export type RuntimeSelectionResult = { ok: true } | { ok: false; error: string };

export class DesktopRuntimeSession {
  private active?: ActiveRuntime;

  constructor(private readonly deps: DesktopRuntimeSessionDeps) {}

  async start(profile: RuntimeProfile | null): Promise<RuntimeSelectionResult | void> {
    if (!profile) {
      await this.deps.showLauncher("");
      return;
    }
    return this.choose(profile);
  }

  async choose(profile: RuntimeProfile): Promise<RuntimeSelectionResult> {
    await this.releaseActive();

    let next: ActiveRuntime | undefined;
    try {
      next = await this.deps.activate(profile);
      const health = await this.deps.probe({ mode: next.mode, origin: next.origin });
      if (!health.ok) {
        await next.stop?.().catch(() => undefined);
        await this.deps.showLauncher(health.error);
        return health;
      }

      await this.deps.persist(profile);
      const destination =
        next.mode === "lite" ? `${next.origin.replace(/\/+$/, "")}/local-bootstrap` : next.origin;
      await this.deps.navigate(destination);
      this.active = next;
      return { ok: true };
    } catch (error) {
      await next?.stop?.().catch(() => undefined);
      const message = runtimeErrorMessage(error);
      await this.deps.showLauncher(message);
      return { ok: false, error: message };
    }
  }

  async showLauncher(): Promise<void> {
    await this.releaseActive();
    await this.deps.showLauncher("");
  }

  async stop(): Promise<void> {
    await this.releaseActive();
  }

  private async releaseActive(): Promise<void> {
    const current = this.active;
    this.active = undefined;
    await current?.stop?.().catch(() => undefined);
  }
}

function runtimeErrorMessage(error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error || "unknown error");
  return `Could not load the selected Rakazo runtime: ${detail}`;
}
