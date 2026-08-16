import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import * as adapters from "./index.js";

const temps: string[] = [];
afterEach(async () => {
  await Promise.all(temps.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

function required<T>(name: string): T | undefined {
  const value = (adapters as Record<string, unknown>)[name];
  expect(value, `${name} must be exported by @rakazo/adapters`).toBeDefined();
  return value as T | undefined;
}

describe("CLI agent bridge", () => {
  test("ships capability definitions for the requested coding agents", () => {
    const definitions = required<Array<{ id: string; executable: string }>>("BUILTIN_CLI_AGENTS");
    if (!definitions) return;
    expect(definitions.map((item) => item.id)).toEqual(
      expect.arrayContaining(["claude-code", "codex", "kimi-code", "opencode", "prime-agent"]),
    );
    expect(new Set(definitions.map((item) => item.id)).size).toBe(definitions.length);
  });

  test("builds safe noninteractive Claude, Codex, Kimi, and OpenCode invocations", () => {
    const build =
      required<
        (input: {
          agentId: string;
          prompt: string;
          cwd: string;
          mode: "analyze" | "write";
          model?: string;
          maxTurns?: number;
          additionalDirs?: string[];
        }) => { command: string; args: string[]; cwd: string; outerVerificationRequired: boolean }
      >("buildCliInvocation");
    if (!build) return;

    const claude = build({
      agentId: "claude-code",
      prompt: "inspect only",
      cwd: "/tmp/project",
      mode: "analyze",
      maxTurns: 4,
      additionalDirs: ["/tmp/brain"],
    });
    expect(claude.command).toBe("claude");
    expect(claude.args).toEqual(
      expect.arrayContaining([
        "-p",
        "inspect only",
        "--output-format",
        "stream-json",
        "--permission-mode",
        "plan",
        "--max-turns",
        "4",
        "--add-dir",
        "/tmp/brain",
      ]),
    );
    expect(claude.args).not.toContain("--dangerously-skip-permissions");

    const codex = build({
      agentId: "codex",
      prompt: "audit",
      cwd: "/tmp/project",
      mode: "analyze",
    });
    expect(codex.command).toBe("codex");
    expect(codex.args.slice(0, 2)).toEqual(["exec", "--json"]);
    expect(codex.args).toEqual(expect.arrayContaining(["--sandbox", "read-only", "audit"]));

    const kimi = build({
      agentId: "kimi-code",
      prompt: "review",
      cwd: "/tmp/project",
      mode: "analyze",
    });
    expect(kimi.command).toBe("kimi");
    expect(kimi.args).toEqual(
      expect.arrayContaining(["-p", "review", "--output-format", "stream-json"]),
    );
    expect(kimi.args).not.toContain("--plan");
    expect(kimi.outerVerificationRequired).toBe(true);

    const opencode = build({
      agentId: "opencode",
      prompt: "check",
      cwd: "/tmp/project",
      mode: "analyze",
      model: "openrouter/example",
    });
    expect(opencode.command).toBe("opencode");
    expect(opencode.args.slice(0, 2)).toEqual(["run", "--format"]);
    expect(opencode.args).toEqual(
      expect.arrayContaining(["json", "--model", "openrouter/example", "check"]),
    );
  });

  test("custom CLI definitions remain argv-based rather than shell strings", () => {
    const build =
      required<
        (input: {
          agentId: string;
          prompt: string;
          cwd: string;
          mode: "analyze" | "write";
          custom?: { executable: string; args: string[] };
        }) => { command: string; args: string[] }
      >("buildCliInvocation");
    if (!build) return;
    const invocation = build({
      agentId: "custom",
      prompt: "hello; rm -rf /",
      cwd: "/tmp/project with spaces",
      mode: "analyze",
      custom: { executable: "/usr/local/bin/my agent", args: ["run", "{prompt}"] },
    });
    expect(invocation.command).toBe("/usr/local/bin/my agent");
    expect(invocation.args).toEqual(["run", "hello; rm -rf /"]);
  });

  test("runner captures output and kills a timed-out process", async () => {
    const run =
      required<
        (input: {
          command: string;
          args: string[];
          cwd: string;
          timeoutMs: number;
          maxOutputBytes?: number;
        }) => Promise<{ code: number | null; stdout: string; stderr: string; timedOut: boolean }>
      >("runCliProcess");
    if (!run) return;
    const cwd = await mkdtemp(path.join(os.tmpdir(), "rakazo-cli-"));
    temps.push(cwd);
    const ok = await run({
      command: process.execPath,
      args: ["-e", "console.log('hello'); console.error('warning')"],
      cwd,
      timeoutMs: 2_000,
    });
    expect(ok.code).toBe(0);
    expect(ok.stdout).toContain("hello");
    expect(ok.stderr).toContain("warning");
    expect(ok.timedOut).toBe(false);

    const timeout = await run({
      command: process.execPath,
      args: ["-e", "setTimeout(() => {}, 10_000)"],
      cwd,
      timeoutMs: 50,
    });
    expect(timeout.timedOut).toBe(true);
    expect(timeout.code).not.toBe(0);
  });
});

describe("MCP bridge", () => {
  test("stdio MCP performs initialization before tools and returns tool results", async () => {
    const call =
      required<
        (input: {
          command: string;
          args: string[];
          cwd: string;
          tool: string;
          arguments?: Record<string, unknown>;
          timeoutMs?: number;
        }) => Promise<{ tools: Array<{ name: string }>; result: unknown }>
      >("runStdioMcpCall");
    if (!call) return;
    const cwd = await mkdtemp(path.join(os.tmpdir(), "rakazo-mcp-"));
    temps.push(cwd);
    const script = path.join(cwd, "server.mjs");
    await writeFile(
      script,
      `import readline from 'node:readline';\n` +
        `const rl=readline.createInterface({input:process.stdin});\n` +
        `let initialized=false;\n` +
        `const send=(o)=>process.stdout.write(JSON.stringify(o)+'\\n');\n` +
        `rl.on('line',(line)=>{let m;try{m=JSON.parse(line)}catch{return;}\n` +
        `if(m.method==='initialize') return send({jsonrpc:'2.0',id:m.id,result:{protocolVersion:'2025-06-18',capabilities:{tools:{}},serverInfo:{name:'fake',version:'1'}}});\n` +
        `if(m.method==='notifications/initialized'){initialized=true;return;}\n` +
        `if(m.method==='tools/list') return send({jsonrpc:'2.0',id:m.id,result:{tools:initialized?[{name:'add',description:'add',inputSchema:{type:'object'}}]:[]}});\n` +
        `if(m.method==='tools/call') return send({jsonrpc:'2.0',id:m.id,result:{content:[{type:'text',text:String((m.params.arguments.a||0)+(m.params.arguments.b||0))}]}});\n` +
        `});\n`,
      "utf8",
    );
    const response = await call({
      command: process.execPath,
      args: [script],
      cwd,
      tool: "add",
      arguments: { a: 40, b: 2 },
      timeoutMs: 2_000,
    });
    expect(response.tools.map((tool) => tool.name)).toContain("add");
    expect(JSON.stringify(response.result)).toContain("42");
  });

  test("Streamable HTTP response parser accepts JSON and SSE and takes the last data event", () => {
    const parse = required<(body: string, contentType: string) => unknown>("parseMcpHttpResponse");
    if (!parse) return;
    expect(parse('{"jsonrpc":"2.0","id":1,"result":{"ok":true}}', "application/json")).toEqual({
      jsonrpc: "2.0",
      id: 1,
      result: { ok: true },
    });
    expect(
      parse(
        'event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{"step":1}}\n\n' +
          'data: {"jsonrpc":"2.0","id":1,"result":{"step":2}}\n\n',
        "text/event-stream",
      ),
    ).toEqual({ jsonrpc: "2.0", id: 1, result: { step: 2 } });
  });
});
