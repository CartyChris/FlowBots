import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  normalizeRuntimeProfile,
  parseRuntimeProfile,
  type RuntimeProfile,
} from "./runtime-profile.js";

export async function readRuntimeProfile(filePath: string): Promise<RuntimeProfile | null> {
  try {
    return parseRuntimeProfile(JSON.parse(await readFile(filePath, "utf8")));
  } catch {
    return null;
  }
}

export async function writeRuntimeProfile(
  filePath: string,
  profile: { mode: string; serverUrl?: string },
): Promise<void> {
  const normalized = normalizeRuntimeProfile(profile);
  const directory = path.dirname(filePath);
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await mkdir(directory, { recursive: true });
  try {
    await writeFile(tempPath, `${JSON.stringify(normalized, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    await rename(tempPath, filePath);
  } finally {
    await rm(tempPath, { force: true }).catch(() => undefined);
  }
}
