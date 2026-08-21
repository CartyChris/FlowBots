import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { avatarVariantForColor, BOT_AVATAR_FACE_CHOICES } from "./bot-avatar.js";

describe("BotAvatar face choices", () => {
  it("persists every selectable face through the existing color field", () => {
    expect(BOT_AVATAR_FACE_CHOICES.map((choice) => avatarVariantForColor(choice.color))).toEqual(
      BOT_AVATAR_FACE_CHOICES.map((choice) => choice.variant),
    );
  });

  it("renders changing work and thinking emote layers instead of only a presence dot", async () => {
    const source = await readFile(new URL("./bot-avatar.tsx", import.meta.url), "utf8");
    expect(source).toContain("rk-bot-emote-cycle");
    expect(source).toContain("rk-bot-emote-keyboard");
    expect(source).toContain("rk-bot-emote-code");
    expect(source).toContain("rk-bot-emote-file");
    expect(source).toContain("rk-bot-thought-orbit");
    expect(source).toContain("rk-bot-success-burst");
  });

  it("gives each busy/error state a visibly distinct motion contract", async () => {
    const css = await readFile(new URL("./styles.css", import.meta.url), "utf8");
    expect(css).toContain("@keyframes rkBotWorkEmote");
    expect(css).toContain("@keyframes rkBotThinkOrbit");
    expect(css).toContain("@keyframes rkBotSuccessBurst");
    expect(css).toContain("@keyframes rkBotErrorShake");
    expect(css).toMatch(/data-bot-state="error"[^}]*animation:/s);
  });

  it("disables continuous avatar motion when reduced motion is requested", async () => {
    const css = await readFile(new URL("./styles.css", import.meta.url), "utf8");
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce/);
    expect(css).toMatch(/\.rk-bot-avatar[^}]*animation:\s*none\s*!important/s);
    expect(css).toMatch(/\.rk-bot-emote-cycle[^}]*animation:\s*none\s*!important/s);
    expect(css).toMatch(/\.rk-bot-thought-orbit[^}]*animation:\s*none\s*!important/s);
  });
});
