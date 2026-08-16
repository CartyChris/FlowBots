import { describe, expect, it, vi } from "vitest";
import {
  buildPrimeAgentRpcInvocation,
  LfJsonlDecoder,
  PrimeAgentRpcClient,
  type PrimeRpcTransport,
  primeAgentHarnessDefinition,
} from "./prime-agent.js";

function fakeTransport() {
  const sent: string[] = [];
  let onMessage: ((message: unknown) => void) | undefined;
  let onClose: ((error?: Error) => void) | undefined;
  const transport: PrimeRpcTransport = {
    send(line) {
      sent.push(line);
    },
    onMessage(listener) {
      onMessage = listener;
      return () => {
        if (onMessage === listener) onMessage = undefined;
      };
    },
    onClose(listener) {
      onClose = listener;
      return () => {
        if (onClose === listener) onClose = undefined;
      };
    },
    async close() {
      onClose?.();
    },
  };
  return {
    transport,
    sent,
    emit: (message: unknown) => onMessage?.(message),
    close: (error?: Error) => onClose?.(error),
  };
}

describe("Prime Agent strict JSONL framing", () => {
  it("splits only on ASCII LF and preserves U+2028/U+2029 inside JSON strings", () => {
    const decoder = new LfJsonlDecoder();
    const source =
      '{"type":"event","text":"left\u2028middle\u2029right"}\n{"type":"response","success":true}\r\n';
    expect(decoder.push(source)).toEqual([
      { type: "event", text: "left\u2028middle\u2029right" },
      { type: "response", success: true },
    ]);
    expect(decoder.finish()).toEqual([]);
  });

  it("buffers partial records across chunks", () => {
    const decoder = new LfJsonlDecoder();
    expect(decoder.push('{"type":"response",')).toEqual([]);
    expect(decoder.push('"success":true}\n')).toEqual([{ type: "response", success: true }]);
  });
});

describe("Prime Agent RPC invocation", () => {
  it("uses direct argv and an explicit workspace without shell interpolation", () => {
    expect(
      buildPrimeAgentRpcInvocation({
        cwd: "/work/repo; touch /tmp/nope",
        provider: "anthropic",
        model: "claude-opus-5",
        sessionDir: "/work/sessions",
      }),
    ).toEqual({
      command: "prime-agent",
      args: [
        "--mode",
        "rpc",
        "--provider",
        "anthropic",
        "--model",
        "claude-opus-5",
        "--session-dir",
        "/work/sessions",
      ],
      cwd: "/work/repo; touch /tmp/nope",
    });
  });
});

describe("PrimeAgentRpcClient", () => {
  it("correlates command responses while streaming unrelated agent events", async () => {
    const fake = fakeTransport();
    const client = new PrimeAgentRpcClient(fake.transport, { idFactory: () => "req-1" });
    const events: unknown[] = [];
    client.onEvent((event) => events.push(event));

    const pending = client.request("get_state");
    expect(JSON.parse(fake.sent[0]!)).toEqual({ id: "req-1", type: "get_state" });
    fake.emit({ type: "agent_start", sessionId: "session-7" });
    fake.emit({
      id: "req-1",
      type: "response",
      command: "get_state",
      success: true,
      data: { sessionId: "session-7" },
    });

    await expect(pending).resolves.toEqual({ sessionId: "session-7" });
    expect(events).toEqual([{ type: "agent_start", sessionId: "session-7" }]);
  });

  it("exposes prompt, steer, follow-up and abort with official command shapes", async () => {
    const fake = fakeTransport();
    let next = 0;
    const client = new PrimeAgentRpcClient(fake.transport, {
      idFactory: () => `r${++next}`,
    });

    const commands = [
      client.prompt("implement it"),
      client.steer("focus on tests"),
      client.followUp("then document it"),
      client.abort(),
    ];
    const written = fake.sent.map((line) => JSON.parse(line));
    expect(written).toEqual([
      { id: "r1", type: "prompt", message: "implement it" },
      { id: "r2", type: "steer", message: "focus on tests" },
      { id: "r3", type: "follow_up", message: "then document it" },
      { id: "r4", type: "abort" },
    ]);
    written.forEach((command) =>
      fake.emit({ id: command.id, type: "response", command: command.type, success: true }),
    );
    await expect(Promise.all(commands)).resolves.toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
  });

  it("covers stats, A2A messaging, observation, schedules and heartbeats through the same client", async () => {
    const fake = fakeTransport();
    let next = 0;
    const client = new PrimeAgentRpcClient(fake.transport, { idFactory: () => `x${++next}` });

    const pending = [
      client.getSessionStats(),
      client.sendAgentMessage("child-1", "status?", "follow_up"),
      client.observe("child-1"),
      client.listSchedules(true),
      client.addSchedule("0 9 * * 1-5", "run morning checks"),
      client.setHeartbeat("*/15 * * * *", "check subagents", "steer"),
    ];
    const sent = fake.sent.map((line) => JSON.parse(line));
    expect(sent.map((entry) => entry.type)).toEqual([
      "get_session_stats",
      "send_message",
      "observe",
      "list_schedules",
      "add_schedule",
      "set_heartbeat",
    ]);
    expect(sent[1]).toMatchObject({
      targetActiveSessionId: "child-1",
      message: "status?",
      deliveryMode: "follow_up",
    });
    expect(sent[4]).toMatchObject({ schedule: "0 9 * * 1-5", prompt: "run morning checks" });

    sent.forEach((command, index) =>
      fake.emit({
        id: command.id,
        type: "response",
        command: command.type,
        success: true,
        data: { index },
      }),
    );
    await expect(Promise.all(pending)).resolves.toEqual(sent.map((_, index) => ({ index })));
  });

  it("preserves observed subagent events as events for Glass Pane correlation", () => {
    const fake = fakeTransport();
    const client = new PrimeAgentRpcClient(fake.transport);
    const listener = vi.fn();
    client.onEvent(listener);
    const event = {
      type: "observed_session_event",
      activeSessionId: "child-9",
      event: { type: "agent_start" },
    };
    fake.emit(event);
    expect(listener).toHaveBeenCalledWith(event);
  });

  it("rejects pending requests when the transport closes instead of hanging", async () => {
    const fake = fakeTransport();
    const client = new PrimeAgentRpcClient(fake.transport, { idFactory: () => "dead" });
    const pending = client.getState();
    fake.close(new Error("Prime Agent exited"));
    await expect(pending).rejects.toThrow(/Prime Agent exited/);
  });
});

describe("Prime Agent harness metadata", () => {
  it("is resident, RPC-capable, schedulable, and cannot self-approve Rakazo mutations", async () => {
    const harness = primeAgentHarnessDefinition(async () => ({ available: true, version: "1.0" }));
    expect(harness).toMatchObject({
      id: "prime-agent",
      kind: "rpc",
      scheduleable: true,
      resident: true,
      outerVerificationRequired: true,
    });
    expect(harness.interactions).toEqual(expect.arrayContaining(["headless", "rpc"]));
    await expect(harness.probe()).resolves.toEqual({ available: true, version: "1.0" });
  });
});
