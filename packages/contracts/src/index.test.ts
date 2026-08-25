import { describe, expect, it } from "vitest";
import { appContract, BotAppearanceSchema, CreateBotInput, ProductEventType } from "./index.js";

describe("contracts", () => {
  it("parses bot create input", () => {
    const parsed = CreateBotInput.parse({ name: "Chief" });
    expect(parsed.title).toBe("");
    expect(parsed.notifyOnFinish).toBe(true);
  });

  it("parses and defaults persisted bot appearance metadata", () => {
    const parsed = BotAppearanceSchema.parse({
      variant: "fox",
      secondaryColor: "#FFB85C",
      eyeStyle: "star",
      accessory: "headphones",
      pattern: "circuit",
      glow: "strong",
    });
    expect(parsed.variant).toBe("fox");
    expect(parsed.accessory).toBe("headphones");
    expect(BotAppearanceSchema.parse({}).variant).toBe("orb");
  });

  it("exposes the product rpc surface", () => {
    expect(appContract.models.beginOAuth).toBeTruthy();
    expect(appContract.models.completeOAuth).toBeTruthy();
    expect(appContract.bots.create).toBeTruthy();
    expect(appContract.bots.remove).toBeTruthy();
    expect(appContract.threads.subscribe).toBeTruthy();
    expect(appContract.notifications.registerPush).toBeTruthy();
    expect(ProductEventType.options).toContain("thread.message.created");
    expect(ProductEventType.options).toContain("thread.subagent");
    expect(ProductEventType.options).toContain("bot.spawned");
  });
});
