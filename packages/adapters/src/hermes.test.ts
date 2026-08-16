import { describe, expect, it, vi } from "vitest";
import {
  buildHermesGatewayInvocation,
  buildHermesServeInvocation,
  hermesHarnessDefinitions,
  hermesMoaVirtualModels,
  normalizeHermesMoaConfig,
} from "./hermes.js";

describe("Hermes Mixture of Agents", () => {
  it("normalizes named presets with explicit mixed-provider references and aggregator", () => {
    expect(
      normalizeHermesMoaConfig({
        default_preset: "studio",
        presets: {
          studio: {
            reference_models: [
              { provider: "openai-codex", model: "gpt-5.5" },
              { provider: "openrouter", model: "deepseek/deepseek-v4-pro" },
            ],
            aggregator: { provider: "anthropic", model: "claude-opus-5" },
            max_tokens: 8192,
            enabled: true,
          },
          disabled: {
            reference_models: [{ provider: "openrouter", model: "x/y" }],
            aggregator: { provider: "openrouter", model: "z/q" },
            enabled: false,
          },
        },
      }),
    ).toEqual({
      defaultPreset: "studio",
      presets: [
        {
          id: "studio",
          references: [
            { provider: "openai-codex", model: "gpt-5.5" },
            { provider: "openrouter", model: "deepseek/deepseek-v4-pro" },
          ],
          aggregator: { provider: "anthropic", model: "claude-opus-5" },
          maxTokens: 8192,
          enabled: true,
        },
        {
          id: "disabled",
          references: [{ provider: "openrouter", model: "x/y" }],
          aggregator: { provider: "openrouter", model: "z/q" },
          enabled: false,
        },
      ],
    });
  });

  it("projects enabled presets as selectable virtual models while keeping aggregator metadata explicit", () => {
    const models = hermesMoaVirtualModels(
      normalizeHermesMoaConfig({
        default_preset: "studio",
        presets: {
          studio: {
            reference_models: [{ provider: "openrouter", model: "deepseek/v4" }],
            aggregator: { provider: "anthropic", model: "claude-opus-5" },
            enabled: true,
          },
        },
      }),
    );
    expect(models).toEqual([
      {
        provider: "hermes-moa",
        id: "studio",
        name: "MoA: studio",
        aggregator: { provider: "anthropic", model: "claude-opus-5" },
        references: [{ provider: "openrouter", model: "deepseek/v4" }],
        default: true,
      },
    ]);
  });

  it("rejects malformed presets rather than guessing missing providers/models", () => {
    expect(() =>
      normalizeHermesMoaConfig({
        presets: { bad: { reference_models: [{ model: "x" }], aggregator: { model: "y" } } },
      }),
    ).toThrow(/provider/i);
  });
});

describe("Hermes managed services", () => {
  it("builds direct argv for the JSON-RPC/WebSocket backend", () => {
    expect(buildHermesServeInvocation({ host: "127.0.0.1", port: 9119, profile: "coder" })).toEqual(
      {
        command: "hermes",
        args: ["-p", "coder", "serve", "--host", "127.0.0.1", "--port", "9119"],
      },
    );
  });

  it("builds gateway lifecycle commands without shell interpolation", () => {
    expect(buildHermesGatewayInvocation("start", "coder; touch /tmp/nope")).toEqual({
      command: "hermes",
      args: ["-p", "coder; touch /tmp/nope", "gateway", "start"],
    });
    expect(buildHermesGatewayInvocation("status")).toEqual({
      command: "hermes",
      args: ["gateway", "status"],
    });
  });
});

describe("Hermes harness metadata", () => {
  it("exposes chat/gateway/server and MoA as related verified harness surfaces", () => {
    const probe = vi.fn(async () => ({ available: true as const, version: "1" }));
    const definitions = hermesHarnessDefinitions(probe);
    expect(definitions.map((definition) => definition.id)).toEqual([
      "hermes",
      "hermes-serve",
      "hermes-gateway",
    ]);
    for (const definition of definitions) {
      expect(definition.outerVerificationRequired).toBe(true);
      expect(definition.scheduleable).toBe(true);
    }
    expect(definitions[0]!.interactions).toContain("chat");
    expect(definitions[1]).toMatchObject({ kind: "rpc", resident: true });
    expect(definitions[2]).toMatchObject({ kind: "cli", resident: true });
  });
});
