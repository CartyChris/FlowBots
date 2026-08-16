import path from "node:path";
import { runtimeLauncherHtml } from "./runtime-profile.js";

export interface RuntimePathContext {
  isPackaged: boolean;
  appPath: string;
  resourcesPath: string;
  userData: string;
}

export interface RuntimeResourcePaths {
  dataDir: string;
  migrationsDir: string;
  webDir: string;
}

export function resolveRuntimeResourcePaths(context: RuntimePathContext): RuntimeResourcePaths {
  const dataDir = path.join(context.userData, "lite");
  if (context.isPackaged) {
    return {
      dataDir,
      migrationsDir: path.join(context.resourcesPath, "migrations"),
      webDir: path.join(context.resourcesPath, "web"),
    };
  }

  const repoRoot = path.resolve(context.appPath, "../..");
  return {
    dataDir,
    migrationsDir: path.join(repoRoot, "packages", "db", "prisma", "migrations"),
    webDir: path.join(repoRoot, "apps", "web", "dist"),
  };
}

export function launcherDocumentUrl(error = ""): string {
  return `data:text/html;charset=utf-8,${encodeURIComponent(runtimeLauncherHtml(error))}`;
}

export function trustedRuntimeSender(senderUrl: string | undefined, launcherUrl: string): boolean {
  return Boolean(senderUrl && senderUrl === launcherUrl);
}

export function trustedTerminalSender(senderUrl: string | undefined): boolean {
  if (!senderUrl) return false;
  try {
    const parsed = new URL(senderUrl);
    if (parsed.protocol !== "http:") return false;
    if (parsed.username || parsed.password) return false;
    return parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost" || parsed.hostname === "[::1]";
  } catch {
    return false;
  }
}
