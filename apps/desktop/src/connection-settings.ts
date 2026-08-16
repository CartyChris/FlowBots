import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { type ConnectionSettings, normalizeWebUrl } from "./connection.js";

function safeUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    return normalizeWebUrl(value);
  } catch {
    return undefined;
  }
}

function sanitizeSettings(value: unknown): ConnectionSettings {
  if (!value || typeof value !== "object") return { recentUrls: [] };
  const source = value as Record<string, unknown>;
  const activeUrl = safeUrl(source.activeUrl);
  const rawRecent = Array.isArray(source.recentUrls) ? source.recentUrls : [];
  const recentUrls = rawRecent
    .map(safeUrl)
    .filter((url): url is string => Boolean(url))
    .filter((url, index, all) => all.indexOf(url) === index)
    .slice(0, 5);

  return activeUrl ? { activeUrl, recentUrls } : { recentUrls };
}

export async function readConnectionSettings(filePath: string): Promise<ConnectionSettings> {
  try {
    const source = await readFile(filePath, "utf8");
    return sanitizeSettings(JSON.parse(source));
  } catch {
    return { recentUrls: [] };
  }
}

export async function writeConnectionSettings(
  filePath: string,
  settings: ConnectionSettings,
): Promise<void> {
  const sanitized = sanitizeSettings(settings);
  const tempPath = `${filePath}.tmp`;
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(tempPath, `${JSON.stringify(sanitized, null, 2)}\n`, "utf8");
  await rename(tempPath, filePath);
}
