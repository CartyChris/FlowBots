import {
  type Bot,
  type BotAppearance,
  BotAppearanceSchema,
  type CapabilityInstall,
} from "@rakazo/contracts";

export const BOT_APPEARANCE_SOURCE_PREFIX = "flowbots://appearance/";

export function botAppearanceSource(botId: string) {
  return `${BOT_APPEARANCE_SOURCE_PREFIX}${botId}`;
}

export function isBotAppearanceCapability(install: CapabilityInstall) {
  return (
    install.kind === "plugin" &&
    install.source.startsWith(BOT_APPEARANCE_SOURCE_PREFIX) &&
    install.config.flowbotsAppearance === true &&
    typeof install.config.botId === "string"
  );
}

export function appearanceCapabilityForBot(
  installs: CapabilityInstall[],
  botId: string,
): CapabilityInstall | undefined {
  return installs
    .filter(isBotAppearanceCapability)
    .filter((install) => install.config.botId === botId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

export function appearanceFromCapability(
  install: CapabilityInstall | undefined,
): BotAppearance | undefined {
  if (!install) return undefined;
  const parsed = BotAppearanceSchema.safeParse(install.config.appearance);
  return parsed.success ? parsed.data : undefined;
}

export function appearanceForBot(installs: CapabilityInstall[], botId: string) {
  return appearanceFromCapability(appearanceCapabilityForBot(installs, botId));
}

export function botAvatarAppearanceRegistrations(bots: Bot[], installs: CapabilityInstall[]) {
  return bots.flatMap((bot) => {
    const appearance = appearanceForBot(installs, bot.id);
    if (!appearance) return [];
    return [{ name: bot.name, color: bot.color, appearance }];
  });
}

export function botAppearanceCapabilityConfig(botId: string, appearance: BotAppearance) {
  return {
    flowbotsAppearance: true,
    botId,
    appearance: BotAppearanceSchema.parse(appearance),
  };
}
