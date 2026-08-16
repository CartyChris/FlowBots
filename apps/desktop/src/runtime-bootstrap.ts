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

export function trustedTerminalSender(
  senderUrl: string | undefined,
  activeRuntimeOrigin: string | undefined,
): boolean {
  if (!senderUrl || !activeRuntimeOrigin) return false;
  try {
    const sender = new URL(senderUrl);
    const active = new URL(activeRuntimeOrigin);
    if (sender.protocol !== "http:" || active.protocol !== "http:") return false;
    if (sender.username || sender.password || active.username || active.password) return false;
    if (!isLoopbackHost(active.hostname)) return false;
    return sender.origin === active.origin;
  } catch {
    return false;
  }
}

function isLoopbackHost(hostname: string): boolean {
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "[::1]";
}