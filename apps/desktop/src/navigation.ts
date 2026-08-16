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
    return {
      ok: false,
      url,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function shouldAutoRetry(state: { connected: boolean; windowDestroyed: boolean }): boolean {
  return !state.connected && !state.windowDestroyed;
}
