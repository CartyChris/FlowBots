import { type ChildProcess, spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { expect, test } from "@playwright/test";

const require = createRequire(import.meta.url);
const electronPath = require("electron") as string;
const desktopDir = path.resolve(import.meta.dirname, "..");
const FATAL_STARTUP_PATTERN =
  /ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING|Uncaught Exception|A JavaScript error occurred in the main process/i;

test("launches FlowBots without a fatal main-process startup error", async () => {
  const args = process.platform === "linux" ? ["--no-sandbox", "."] : ["."];
  const child = spawn(electronPath, args, {
    cwd: desktopDir,
    env: { ...process.env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout?.on("data", (chunk) => {
    output += String(chunk);
  });
  child.stderr?.on("data", (chunk) => {
    output += String(chunk);
  });

  const exited = processExit(child);
  try {
    const earlyExit = await Promise.race([exited, sleep(12_000).then(() => null)]);

    expect(earlyExit, `FlowBots exited during startup.\n${output}`).toBeNull();
    expect(output).not.toMatch(FATAL_STARTUP_PATTERN);
  } finally {
    await stopProcess(child, exited);
  }
});

function processExit(
  child: ChildProcess,
): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
}

async function stopProcess(
  child: ChildProcess,
  exited: Promise<{ code: number | null; signal: NodeJS.Signals | null }>,
): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  const stopped = await Promise.race([exited.then(() => true), sleep(2_000).then(() => false)]);
  if (!stopped && child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL");
    await Promise.race([exited, sleep(1_000)]);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
