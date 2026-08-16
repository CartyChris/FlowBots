export interface ConnectionSettings {
  activeUrl?: string;
  recentUrls: string[];
}

const DEFAULT_WEB_URL = "http://127.0.0.1:5173";
const MAX_RECENT_URLS = 5;

export function normalizeWebUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("A web URL is required.");

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("Enter a valid http:// or https:// URL.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Rakazo connections must use http:// or https://.");
  }
  if (parsed.username || parsed.password) {
    throw new Error(
      "Credential-bearing URLs are not allowed. Enter credentials inside Rakazo instead.",
    );
  }

  const pathname = parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/+$/, "");
  return `${parsed.origin}${pathname}${parsed.search}${parsed.hash}`;
}

export function defaultWebUrl(env: NodeJS.ProcessEnv = process.env): string {
  return normalizeWebUrl(env.RAKAZO_WEB_URL ?? DEFAULT_WEB_URL);
}

export function rememberWebUrl(settings: ConnectionSettings, value: string): ConnectionSettings {
  const url = normalizeWebUrl(value);
  const recentUrls = [
    url,
    ...settings.recentUrls.flatMap((candidate) => {
      try {
        const normalized = normalizeWebUrl(candidate);
        return normalized === url ? [] : [normalized];
      } catch {
        return [];
      }
    }),
  ].filter((candidate, index, all) => all.indexOf(candidate) === index);

  return {
    activeUrl: url,
    recentUrls: recentUrls.slice(0, MAX_RECENT_URLS),
  };
}

export function localApiHealthUrl(webUrl: string): string | undefined {
  const parsed = new URL(normalizeWebUrl(webUrl));
  if (parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost") return undefined;
  return "http://127.0.0.1:3100/health";
}

export function isTrustedConnectionCenterDocument(
  senderUrl: string,
  expectedDocumentUrl: string,
): boolean {
  return expectedDocumentUrl.length > 0 && senderUrl === expectedDocumentUrl;
}
