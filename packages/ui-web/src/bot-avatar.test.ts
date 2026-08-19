import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { avatarVariantForColor, BOT_AVATAR_FACE_CHOICES } from "./bot-avatar.js";

describe("BotAvatar face choices", () => {
  it("persists every selectable face through the existing color field", () => {
    expect(BOT_AVATAR_FACE_CHOICES.map((choice) => avatarVariantForColor(choice.color))).toEqual(
      BOT_AVATAR_FACE_CHOICES.map((choice) => choice.variant),
    );
  });

  it("disables continuous avatar motion when reduced motion is requested", async () => {
    const css = await readFile(new URL("./styles.css", import.meta.url), "utf8");
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce/);
    expect(css).toMatch(/\.rk-bot-avatar[^}]*animation:\s*none\s*!important/s);
  });
});
