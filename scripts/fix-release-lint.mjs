import { readFile, writeFile } from "node:fs/promises";

async function replaceOnce(file, before, after) {
  const source = await readFile(file, "utf8");
  const first = source.indexOf(before);
  const second = first < 0 ? -1 : source.indexOf(before, first + before.length);
  if (first < 0 || second >= 0) {
    throw new Error(
      `Expected exactly one anchor in ${file}; first=${first}, second=${second}: ${before.slice(0, 120)}`,
    );
  }
  await writeFile(
    file,
    source.slice(0, first) + after + source.slice(first + before.length),
  );
}

const dollar = "$";
const currentArtifactExpectation =
  '    expect(pkg.build?.artifactName).toBe(String.raw`FlowBots-\\' +
  dollar +
  '{version}-\\' +
  dollar +
  '{arch}.\\' +
  dollar +
  '{ext}`);';
const correctedArtifactExpectation =
  '    const dollar = "$";\n    expect(pkg.build?.artifactName).toBe(`FlowBots-' +
  dollar +
  '{dollar}{version}-' +
  dollar +
  '{dollar}{arch}.' +
  dollar +
  '{dollar}{ext}`);';

await replaceOnce(
  "apps/desktop/src/product-branding.test.ts",
  currentArtifactExpectation,
  correctedArtifactExpectation,
);

await replaceOnce(
  "apps/local-runtime/src/index.ts",
  "  if (!server || !server.listening) return Promise.resolve();",
  "  if (!server?.listening) return Promise.resolve();",
);

await replaceOnce(
  "packages/adapters/src/mcp-client.ts",
  `  const cleanup = () => {\n    if (done) return;\n    done = true;\n    for (const waiter of pending.values())\n      waiter.reject(new Error("MCP process closed before replying"));\n    pending.clear();\n    try {\n      child.kill("SIGTERM");\n    } catch {\n      // already gone\n    }\n  };\n\n`,
  "",
);

await replaceOnce(
  "packages/adapters/src/openhands.test.ts",
  "      async (url: string, init?: RequestInit) =>",
  "      async (_url: string, _init?: RequestInit) =>",
);

await replaceOnce(
  "apps/desktop/src/preload.test.ts",
  `    listeners.get("desktop.terminal.data")?.forEach((listener) => listener({}, dataEvent));\n    listeners.get("desktop.terminal.activity")?.forEach((listener) => listener({}, activityEvent));`,
  `    listeners.get("desktop.terminal.data")?.forEach((listener) => {\n      listener({}, dataEvent);\n    });\n    listeners.get("desktop.terminal.activity")?.forEach((listener) => {\n      listener({}, activityEvent);\n    });`,
);

await replaceOnce(
  "apps/desktop/src/terminal-session.test.ts",
  `    emitData: (data: string) => dataListeners.forEach((listener) => listener(data)),\n    emitExit: (event: { exitCode: number; signal?: number }) =>\n      exitListeners.forEach((listener) => listener(event)),`,
  `    emitData: (data: string) => {\n      dataListeners.forEach((listener) => {\n        listener(data);\n      });\n    },\n    emitExit: (event: { exitCode: number; signal?: number }) => {\n      exitListeners.forEach((listener) => {\n        listener(event);\n      });\n    },`,
);

await replaceOnce(
  "packages/adapters/src/paperclip.test.ts",
  `    for (const [, init] of fetchSpy.mock.calls) {\n      expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer pc-secret");\n    }`,
  `    for (const [, init] of fetchSpy.mock.calls) {\n      const headers = (init?.headers ?? {}) as Record<string, string>;\n      expect(headers.Authorization).toBe("Bearer pc-secret");\n    }`,
);

await replaceOnce(
  "packages/adapters/src/prime-agent.test.ts",
  `    written.forEach((command) =>\n      fake.emit({ id: command.id, type: "response", command: command.type, success: true }),\n    );`,
  `    written.forEach((command) => {\n      fake.emit({ id: command.id, type: "response", command: command.type, success: true });\n    });`,
);

await replaceOnce(
  "packages/adapters/src/prime-agent.test.ts",
  `    sent.forEach((command, index) =>\n      fake.emit({\n        id: command.id,\n        type: "response",\n        command: command.type,\n        success: true,\n        data: { index },\n      }),\n    );`,
  `    sent.forEach((command, index) => {\n      fake.emit({\n        id: command.id,\n        type: "response",\n        command: command.type,\n        success: true,\n        data: { index },\n      });\n    });`,
);

await replaceOnce(
  "packages/adapters/src/prime-agent.ts",
  `function noValue(): void {\n  return undefined;\n}`,
  "function noValue(): void {}",
);

console.log("Guarded release lint cleanup applied.");
