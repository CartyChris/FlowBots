import type { PtyFactory, PtyProcess, PtySpawnOptions } from "./terminal-session.js";

export interface NodePtyLike {
  spawn(file: string, args: string[], options: PtySpawnOptions): PtyProcess;
}

export function createNodePtyFactory(nodePty: NodePtyLike): PtyFactory {
  return {
    spawn(file: string, args: string[], options: PtySpawnOptions): PtyProcess {
      return nodePty.spawn(file, args, options);
    },
  };
}
