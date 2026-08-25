import type { Bot, CapabilityInstall } from "@rakazo/contracts";
import { describe, expect, it } from "vitest";
import {
  appearanceForBot,
  botAppearanceCapabilityConfig,
  botAppearanceSource,
  botAvatarAppearanceRegistrations,
  isBotAppearanceCapability,
} from "./bot-appearance.js";

const bot = {
  id: "bot-a",
  workspaceId: "workspace-a",
  name: "Pixel",
  title: "Designer",
  description: "",
  instructions: "",
  color: "#7D91FF",
  notifyOnFinish: true,
  parentBotId: null,
  threadId: "thread-a",
  preview: "",
  status: "idle",
  updatedAt: "2026-08-21T00:00:00.000Z",
  createdAt: "2026-08-21T00:00:00.000Z",
} satisfies Bot;

function install(createdAt = "2026-08-21T00:00:00.000Z"): CapabilityInstall {
  return {
    id: `cap-${createdAt}`,
    kind: "plugin",
    name: "Pixel appearance",
    source: botAppearanceSource(bot.id),
    version: null,
    digest: null,
    config: botAppearanceCapabilityConfig(bot.id, {
      variant: "fox",
      secondaryColor: "#FFE0BF",
      eyeStyle: "star",
      accessory: "headphones",
      pattern: "circuit",
      glow: "strong",
    }),
    createdAt,
  };
}

describe("bot appearance capability metadata", () => {
  it("uses a namespaced source and recognizes only appearance records", () => {
    const row = install();
    expect(row.source).toBe("flowbots://appearance/bot-a");
    expect(isBotAppearanceCapability(row)).toBe(true);
    expect(isBotAppearanceCapability({ ...row, source: "https://github.com/acme/theme" })).toBe(
      false,
    );
  });

  it("selects the newest valid look for a bot", () => {
    const old = install("2026-08-20T00:00:00.000Z");
    const latest = {
      ...install("2026-08-21T00:00:00.000Z"),
      config: botAppearanceCapabilityConfig(bot.id, {
        variant: "dragon",
        secondaryColor: "#D2FFF0",
        eyeStyle: "pixel",
        accessory: "crown",
        pattern: "dots",
        glow: "soft",
      }),
    };
    expect(appearanceForBot([old, latest], bot.id)?.variant).toBe("dragon");
  });

  it("only registers persisted custom looks, leaving legacy bots on color-derived faces", () => {
    expect(botAvatarAppearanceRegistrations([bot], [])).toEqual([]);
    expect(botAvatarAppearanceRegistrations([bot], [install()])).toMatchObject([
      { name: "Pixel", color: "#7D91FF", appearance: { variant: "fox" } },
    ]);
  });
});
