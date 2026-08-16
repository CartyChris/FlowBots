import path from "node:path";
import { describe, expect, test, vi } from "vitest";
import { type PtyFactory, type PtyProcess, TerminalSessionManager } from "./terminal-session.js";

function fakePty() {
  const dataListeners = new Set<(data: string) => void>();
  const exitListeners = new Set<(event: { exitCode: number; signal?: number }) => void>();
  const process: PtyProcess = {
    pid: 4242,
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    onData(listener) {
      dataListeners.add(listener);
      return { dispose: () => dataListeners.delete(listener) };
    },
    onExit(listener) {
      exitListeners.add(listener);
      return { dispose: () => exitListeners.delete(listener) };
    },
  };
  return {
    process,
    emitData: (data: string) => {
      dataListeners.forEach((listener) => {
        listener(data);
      });
    },
    emitExit: (event: { exitCode: number; signal?: number }) => {
      exitListeners.forEach((listener) => {
        listener(event);
      });
    },
  };
}

function harness() {
  const pty = fakePty();
  const spawn = vi.fn(() => pty.process);
  const factory: PtyFactory = { spawn };
  const activity: Array<{ type: string; sessionId: string; data?: unknown }> = [];
  const manager = new TerminalSessionManager({
    factory,
    allowedRoots: ["/Users/chris/Projects", "/Users/chris/Brain"],
    defaultShell: "/bin/zsh",
    homeDir: "/Users/chris",
    onActivity: (event) => activity.push(event),
  });
  return { manager, pty, spawn, activity };
}

describe("integrated terminal session manager", () => {
  test("creates a real PTY with fixed shell argv and a canonical allowed cwd", () => {
    const h = harness();
    const session = h.manager.create({
      cwd: "/Users/chris/Projects/rakazo/../rakazo",
      cols: 120,
      rows: 40,
    });

    expect(h.spawn).toHaveBeenCalledWith(
      "/bin/zsh",
      [],
      expect.objectContaining({
        cwd: path.resolve("/Users/chris/Projects/rakazo"),
        cols: 120,
        rows: 40,
      }),
    );
    expect(session.pid).toBe(4242);
    expect(h.activity[0]).toMatchObject({ type: "terminal.started", sessionId: session.id });
  });

  test("rejects a cwd outside approved roots before spawning anything", () => {
    const h = harness();
    expect(() => h.manager.create({ cwd: "/etc", cols: 80, rows: 24 })).toThrow(
      /allowed|approved/i,
    );
    expect(h.spawn).not.toHaveBeenCalled();
  });

  test("writes raw terminal input without constructing a shell command", () => {
    const h = harness();
    const session = h.manager.create({ cwd: "/Users/chris/Projects", cols: 80, rows: 24 });
    h.manager.write(session.id, "echo 'hello; still user input'\r");
    expect(h.pty.process.write).toHaveBeenCalledWith("echo 'hello; still user input'\r");
  });

  test("resize clamps dimensions and interrupt sends Ctrl-C through the PTY", () => {
    const h = harness();
    const session = h.manager.create({ cwd: "/Users/chris/Projects", cols: 80, rows: 24 });
    h.manager.resize(session.id, 0, -3);
    h.manager.interrupt(session.id);
    expect(h.pty.process.resize).toHaveBeenCalledWith(1, 1);
    expect(h.pty.process.write).toHaveBeenCalledWith("\u0003");
  });

  test("data is forwarded to subscribers and PTY exit cleans up exactly once", () => {
    const h = harness();
    const session = h.manager.create({ cwd: "/Users/chris/Projects", cols: 80, rows: 24 });
    const output = vi.fn();
    const dispose = h.manager.subscribe(session.id, output);
    h.pty.emitData("hello\r\n");
    dispose();
    h.pty.emitData("ignored");
    h.pty.emitExit({ exitCode: 0 });

    expect(output).toHaveBeenCalledTimes(1);
    expect(output).toHaveBeenCalledWith("hello\r\n");
    expect(h.manager.get(session.id)).toBeUndefined();
    expect(h.activity.filter((event) => event.type === "terminal.exited")).toHaveLength(1);
  });

  test("close kills a managed PTY and is idempotent", () => {
    const h = harness();
    const session = h.manager.create({ cwd: "/Users/chris/Projects", cols: 80, rows: 24 });
    expect(h.manager.close(session.id)).toBe(true);
    expect(h.manager.close(session.id)).toBe(false);
    expect(h.pty.process.kill).toHaveBeenCalledTimes(1);
  });

  test("closeAll reaps every managed terminal without touching anything external", () => {
    const h = harness();
    const first = h.manager.create({ cwd: "/Users/chris/Projects", cols: 80, rows: 24 });
    const secondPty = fakePty();
    h.spawn.mockReturnValueOnce(secondPty.process);
    const second = h.manager.create({ cwd: "/Users/chris/Brain", cols: 80, rows: 24 });

    h.manager.closeAll();
    expect(h.pty.process.kill).toHaveBeenCalledTimes(1);
    expect(secondPty.process.kill).toHaveBeenCalledTimes(1);
    expect(h.manager.get(first.id)).toBeUndefined();
    expect(h.manager.get(second.id)).toBeUndefined();
  });
});
