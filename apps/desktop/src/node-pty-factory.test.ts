import { describe, expect, test, vi } from "vitest";
import { createNodePtyFactory } from "./node-pty-factory.js";

describe("node-pty adapter", () => {
  test("passes fixed argv and explicit terminal options to node-pty", () => {
    const terminal = {
      pid: 77,
      write: vi.fn(),
      resize: vi.fn(),
      kill: vi.fn(),
      onData: vi.fn(() => ({ dispose() {} })),
      onExit: vi.fn(() => ({ dispose() {} })),
    };
    const spawn = vi.fn(() => terminal);
    const factory = createNodePtyFactory({ spawn });

    const result = factory.spawn("/bin/zsh", [], {
      cwd: "/Users/chris/Projects",
      cols: 120,
      rows: 40,
      env: { PATH: "/usr/bin" },
      name: "xterm-256color",
    });

    expect(spawn).toHaveBeenCalledWith("/bin/zsh", [], {
      cwd: "/Users/chris/Projects",
      cols: 120,
      rows: 40,
      env: { PATH: "/usr/bin" },
      name: "xterm-256color",
    });
    expect(result.pid).toBe(77);
  });

  test("does not expose any shell-string convenience path", () => {
    const factory = createNodePtyFactory({ spawn: vi.fn() });
    expect(Object.keys(factory)).toEqual(["spawn"]);
  });
});
