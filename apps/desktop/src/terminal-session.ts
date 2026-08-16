import path from "node:path";

export interface PtyDisposable {
  dispose(): void;
}

export interface PtyProcess {
  pid: number;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(): void;
  onData(listener: (data: string) => void): PtyDisposable;
  onExit(listener: (event: { exitCode: number; signal?: number }) => void): PtyDisposable;
}

export interface PtySpawnOptions {
  cwd: string;
  cols: number;
  rows: number;
  env?: Record<string, string>;
  name?: string;
}

export interface PtyFactory {
  spawn(file: string, args: string[], options: PtySpawnOptions): PtyProcess;
}

export interface TerminalActivityEvent {
  type: "terminal.started" | "terminal.exited" | "terminal.closed";
  sessionId: string;
  data?: unknown;
}

export interface TerminalSessionInfo {
  id: string;
  pid: number;
  cwd: string;
  shell: string;
}

interface LiveTerminal extends TerminalSessionInfo {
  process: PtyProcess;
  dataSubscription: PtyDisposable;
  exitSubscription: PtyDisposable;
  listeners: Set<(data: string) => void>;
  closed: boolean;
}

export interface TerminalSessionManagerOptions {
  factory: PtyFactory;
  allowedRoots: string[];
  defaultShell: string;
  homeDir: string;
  env?: Record<string, string>;
  canonicalizePath?: (value: string) => string;
  onActivity?: (event: TerminalActivityEvent) => void;
}

export class TerminalSessionManager {
  private sequence = 0;
  private readonly sessions = new Map<string, LiveTerminal>();
  private readonly roots: string[];
  private readonly canonicalize: (value: string) => string;

  constructor(private readonly options: TerminalSessionManagerOptions) {
    this.canonicalize = options.canonicalizePath ?? ((value) => path.resolve(value));
    this.roots = options.allowedRoots.map((root) => this.canonicalize(root));
    if (this.roots.length === 0) throw new Error("At least one approved terminal root is required.");
  }

  create(input: { cwd?: string; cols: number; rows: number; shell?: string }): TerminalSessionInfo {
    const cwd = this.canonicalize(input.cwd ?? this.options.homeDir);
    this.assertAllowedCwd(cwd);
    const shell = input.shell ?? this.options.defaultShell;
    if (!path.isAbsolute(shell)) throw new Error("Terminal shell path must be absolute.");

    const process = this.options.factory.spawn(shell, [], {
      cwd,
      cols: clampDimension(input.cols),
      rows: clampDimension(input.rows),
      ...(this.options.env ? { env: { ...this.options.env } } : {}),
      name: "xterm-256color",
    });
    const id = `terminal-${++this.sequence}`;
    const listeners = new Set<(data: string) => void>();
    const live = {} as LiveTerminal;
    const dataSubscription = process.onData((data) => {
      for (const listener of listeners) listener(data);
    });
    const exitSubscription = process.onExit((event) => {
      this.finalize(id, "terminal.exited", event);
    });
    Object.assign(live, {
      id,
      pid: process.pid,
      cwd,
      shell,
      process,
      dataSubscription,
      exitSubscription,
      listeners,
      closed: false,
    });
    this.sessions.set(id, live);
    this.options.onActivity?.({ type: "terminal.started", sessionId: id, data: { pid: process.pid, cwd, shell } });
    return this.info(live);
  }

  get(sessionId: string): TerminalSessionInfo | undefined {
    const session = this.sessions.get(sessionId);
    return session ? this.info(session) : undefined;
  }

  write(sessionId: string, data: string): void {
    this.require(sessionId).process.write(data);
  }

  resize(sessionId: string, cols: number, rows: number): void {
    this.require(sessionId).process.resize(clampDimension(cols), clampDimension(rows));
  }

  interrupt(sessionId: string): void {
    this.require(sessionId).process.write("\u0003");
  }

  subscribe(sessionId: string, listener: (data: string) => void): () => void {
    const session = this.require(sessionId);
    session.listeners.add(listener);
    return () => session.listeners.delete(listener);
  }

  close(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || session.closed) return false;
    session.closed = true;
    session.process.kill();
    this.finalize(sessionId, "terminal.closed");
    return true;
  }

  closeAll(): void {
    for (const id of [...this.sessions.keys()]) this.close(id);
  }

  private finalize(
    sessionId: string,
    type: Extract<TerminalActivityEvent["type"], "terminal.exited" | "terminal.closed">,
    data?: unknown,
  ): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.closed = true;
    this.sessions.delete(sessionId);
    session.dataSubscription.dispose();
    session.exitSubscription.dispose();
    session.listeners.clear();
    this.options.onActivity?.({ type, sessionId, ...(data === undefined ? {} : { data }) });
  }

  private assertAllowedCwd(cwd: string): void {
    if (!this.roots.some((root) => isWithinRoot(cwd, root))) {
      throw new Error(`Terminal cwd is outside approved roots: ${cwd}`);
    }
  }

  private require(sessionId: string): LiveTerminal {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Unknown terminal session ${sessionId}`);
    return session;
  }

  private info(session: LiveTerminal): TerminalSessionInfo {
    return { id: session.id, pid: session.pid, cwd: session.cwd, shell: session.shell };
  }
}

function clampDimension(value: number): number {
  return Math.max(1, Math.trunc(Number(value) || 1));
}

function isWithinRoot(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
