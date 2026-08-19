export const DOCKER_SETUP_STORAGE_KEY = "flowbots:docker-setup-help";

export function dockerSetupPrompt(): string {
  return [
    "Help me set up Docker safely on this computer so FlowBots can use isolated Docker computers.",
    "Inspect the current Docker installation and daemon state first; do not assume anything is missing.",
    "Explain what you found and ask me before installing or upgrading system software, using administrator privileges or sudo, changing host security settings, opening network access, or making destructive changes.",
    "Prefer the smallest reversible change and preserve existing containers, images, volumes, and user data.",
    "After any approved change, verify Docker works with a non-destructive readiness check.",
    "When Docker is verified, tell me it is ready and that I can switch FlowBots back to Docker mode.",
  ].join(" ");
}
