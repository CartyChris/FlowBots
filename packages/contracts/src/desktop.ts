export interface DesktopRuntimeProfile {
  mode: "lite" | "full-local" | "remote";
  serverUrl?: string;
}

export interface DesktopTerminalInfo {
  id: string;
  pid: number;
  cwd: string;
}

export interface DesktopTerminalDataEvent {
  sessionId: string;
  data: string;
}

export interface DesktopTerminalActivityEvent {
  type: string;
  sessionId: string;
  data?: unknown;
}

export interface RakazoDesktop {
  platform: string;
  window: {
    close: () => Promise<void>;
    minimize: () => Promise<void>;
    toggleMaximize: () => Promise<void>;
    state: () => Promise<{ minimized: boolean; maximized: boolean; fullScreen: boolean }>;
  };
  runtime: {
    choose: (profile: DesktopRuntimeProfile) => Promise<unknown>;
    showLauncher: () => Promise<unknown>;
  };
  terminal: {
    create: (input: { cwd?: string; cols: number; rows: number }) => Promise<DesktopTerminalInfo>;
    write: (sessionId: string, data: string) => Promise<void>;
    resize: (sessionId: string, cols: number, rows: number) => Promise<void>;
    interrupt: (sessionId: string) => Promise<void>;
    close: (sessionId: string) => Promise<boolean>;
    onData: (listener: (event: DesktopTerminalDataEvent) => void) => () => void;
    onActivity: (listener: (event: DesktopTerminalActivityEvent) => void) => () => void;
  };
}
