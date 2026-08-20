import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const create = vi.fn(async () => ({ sessionId: "session-1" }));
  const use = vi.fn(async () => ({ sessionId: "session-1" }));
  const ComposioMock = vi.fn(function ComposioMock(this: unknown, options?: unknown) {
    return {
      create,
      sessions: { use },
      connectedAccounts: { delete: vi.fn(async () => undefined) },
      __options: options,
    };
  });
  return { create, use, ComposioMock };
});

vi.mock("@composio/core", () => ({ Composio: mocks.ComposioMock }));

import { ComposioConnector } from "./composio-connector.js";

describe("local Composio credentials", () => {
  beforeEach(() => {
    mocks.create.mockClear();
    mocks.use.mockClear();
    mocks.ComposioMock.mockClear();
  });

  it("passes an explicit local API key to the SDK instead of depending on ambient env", async () => {
    type ExplicitConnector = new (options?: { apiKey?: string }) => ComposioConnector;
    const connector = new (ComposioConnector as unknown as ExplicitConnector)({
      apiKey: "ak_local_secret",
    });

    await connector.sessionFor("user-1");

    expect(mocks.ComposioMock).toHaveBeenCalledTimes(1);
    expect(mocks.ComposioMock).toHaveBeenCalledWith({ apiKey: "ak_local_secret" });
  });

  it("can rotate the configured key without reusing the old SDK client", async () => {
    type MutableConnector = ComposioConnector & { setApiKey?: (apiKey?: string) => void };
    type ExplicitConnector = new (options?: { apiKey?: string }) => ComposioConnector;
    const connector = new (ComposioConnector as unknown as ExplicitConnector)({
      apiKey: "ak_first",
    });
    await connector.sessionFor("user-1");

    const mutable = connector as MutableConnector;
    expect(mutable.setApiKey).toBeTypeOf("function");
    mutable.setApiKey?.("ak_second");
    await connector.sessionFor("user-2");

    expect(mocks.ComposioMock).toHaveBeenNthCalledWith(1, { apiKey: "ak_first" });
    expect(mocks.ComposioMock).toHaveBeenNthCalledWith(2, { apiKey: "ak_second" });
  });
});
