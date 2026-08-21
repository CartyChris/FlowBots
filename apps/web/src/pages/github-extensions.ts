export type GitHubExtensionScope = "bot-instructions" | "workflow-prompts" | "workspace-feature";

export interface GitHubExtensionConfig {
  flowbotsExtension?: boolean;
  scope?: GitHubExtensionScope | string;
  instructions?: string;
  botIds?: string[];
}

export function normalizeGitHubRepoUrl(value: string): string {
  const raw = value.trim();
  if (!raw) throw new Error("Enter a GitHub repository URL.");
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  let url: URL;
  try {
    url = new URL(withProtocol);
  } catch {
    throw new Error("Enter a valid GitHub repository URL.");
  }

  if (url.protocol !== "https:") throw new Error("GitHub extensions require an HTTPS repository URL.");
  if (url.hostname.toLowerCase() !== "github.com" && url.hostname.toLowerCase() !== "www.github.com") {
    throw new Error("GitHub extensions must use github.com.");
  }

  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length !== 2) throw new Error("Use a repository URL such as https://github.com/owner/repo.");
  const owner = parts[0];
  const repo = parts[1]?.replace(/\.git$/i, "");
  const validSegment = /^[A-Za-z0-9_.-]+$/;
  if (!owner || !repo || !validSegment.test(owner) || !validSegment.test(repo)) {
    throw new Error("Use a valid GitHub owner/repository URL.");
  }
  return `https://github.com/${owner}/${repo}`;
}

export function sanitizeExtensionInstructions(value: string): string {
  return value.trim().slice(0, 4_000);
}

export function extensionAppliesToBot(config: Pick<GitHubExtensionConfig, "botIds">, botId: string): boolean {
  const botIds = Array.isArray(config.botIds) ? config.botIds.filter((id) => typeof id === "string") : [];
  return botIds.length === 0 || botIds.includes(botId);
}

export function extensionInstructionsForBot(
  installs: Array<{
    kind: string;
    source: string;
    config: Record<string, unknown>;
  }>,
  botId: string,
): string[] {
  return installs
    .filter((install) => install.kind === "plugin" && install.source.startsWith("https://github.com/"))
    .filter((install) => install.config.flowbotsExtension === true)
    .filter((install) => {
      const scope = install.config.scope;
      return scope === "bot-instructions" || scope === "workflow-prompts";
    })
    .filter((install) =>
      extensionAppliesToBot(
        { botIds: Array.isArray(install.config.botIds) ? (install.config.botIds as string[]) : [] },
        botId,
      ),
    )
    .map((install) => sanitizeExtensionInstructions(String(install.config.instructions ?? "")))
    .filter(Boolean)
    .slice(0, 8);
}
