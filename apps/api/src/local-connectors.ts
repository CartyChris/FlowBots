import type { AdapterContext } from "@rakazo/adapter-kit";
import type { EncryptedSecretStore, McpServerConfig } from "@rakazo/adapters";
import type { Actor } from "@rakazo/contracts";
import type { Prisma, PrismaClient } from "@rakazo/db";

export const LOCAL_COMPOSIO_INSTALL = "composio-local";

export async function loadPersistedComposioKey(
  prisma: PrismaClient,
  secrets: EncryptedSecretStore,
): Promise<string | undefined> {
  const install = await prisma.capabilityInstall.findFirst({
    where: { kind: "plugin", name: LOCAL_COMPOSIO_INSTALL },
    orderBy: { createdAt: "desc" },
  });
  if (!install) return undefined;
  const secretId = stringValue(install.config, "secretId");
  if (!secretId) return undefined;
  const secret = await prisma.secret.findFirst({
    where: {
      id: secretId,
      userId: install.userId,
      workspaceId: install.workspaceId,
      kind: "composio-api-key",
    },
  });
  return secret ? secrets.load(secret.ciphertext) : undefined;
}

export async function hasPersistedComposioKey(
  prisma: PrismaClient,
  actor: Actor,
): Promise<boolean> {
  const install = await prisma.capabilityInstall.findFirst({
    where: {
      workspaceId: actor.workspaceId,
      userId: actor.userId,
      kind: "plugin",
      name: LOCAL_COMPOSIO_INSTALL,
    },
  });
  return Boolean(install && stringValue(install.config, "secretId"));
}

export async function savePersistedComposioKey(
  prisma: PrismaClient,
  secrets: EncryptedSecretStore,
  actor: Actor,
  apiKey: string,
): Promise<void> {
  const context: AdapterContext = {
    operationId: "connections.composio.configure",
    traceId: "connections.composio.configure",
    workspaceId: actor.workspaceId,
    userId: actor.userId,
    signal: new AbortController().signal,
  };
  const encrypted = await secrets.put(apiKey.trim(), context);
  const createdSecret = await prisma.secret.create({
    data: {
      userId: actor.userId,
      workspaceId: actor.workspaceId,
      kind: "composio-api-key",
      ciphertext: encrypted.ciphertext,
    },
  });
  const existing = await prisma.capabilityInstall.findFirst({
    where: {
      workspaceId: actor.workspaceId,
      userId: actor.userId,
      kind: "plugin",
      name: LOCAL_COMPOSIO_INSTALL,
    },
    orderBy: { createdAt: "desc" },
  });
  const previousSecretId = existing ? stringValue(existing.config, "secretId") : undefined;
  if (existing) {
    await prisma.capabilityInstall.update({
      where: { id: existing.id },
      data: { config: { secretId: createdSecret.id } as Prisma.InputJsonValue },
    });
  } else {
    await prisma.capabilityInstall.create({
      data: {
        workspaceId: actor.workspaceId,
        userId: actor.userId,
        kind: "plugin",
        name: LOCAL_COMPOSIO_INSTALL,
        source: "local://composio",
        version: "local",
        digest: "encrypted",
        config: { secretId: createdSecret.id } as Prisma.InputJsonValue,
      },
    });
  }
  if (previousSecretId && previousSecretId !== createdSecret.id) {
    await prisma.secret.deleteMany({
      where: {
        id: previousSecretId,
        userId: actor.userId,
        workspaceId: actor.workspaceId,
        kind: "composio-api-key",
      },
    });
  }
}

export async function clearPersistedComposioKey(prisma: PrismaClient, actor: Actor): Promise<void> {
  const installs = await prisma.capabilityInstall.findMany({
    where: {
      workspaceId: actor.workspaceId,
      userId: actor.userId,
      kind: "plugin",
      name: LOCAL_COMPOSIO_INSTALL,
    },
  });
  const secretIds = installs
    .map((install) => stringValue(install.config, "secretId"))
    .filter((value): value is string => Boolean(value));
  await prisma.capabilityInstall.deleteMany({
    where: {
      workspaceId: actor.workspaceId,
      userId: actor.userId,
      kind: "plugin",
      name: LOCAL_COMPOSIO_INSTALL,
    },
  });
  if (secretIds.length > 0) {
    await prisma.secret.deleteMany({
      where: {
        id: { in: secretIds },
        userId: actor.userId,
        workspaceId: actor.workspaceId,
        kind: "composio-api-key",
      },
    });
  }
}

export async function loadMcpServers(
  prisma: PrismaClient,
  context: AdapterContext,
  options: { hostEnabled: boolean; defaultCwd: string },
): Promise<McpServerConfig[]> {
  if (!options.hostEnabled) return [];
  const rows = await prisma.capabilityInstall.findMany({
    where: {
      workspaceId: context.workspaceId,
      userId: context.userId,
      kind: "mcp",
    },
    orderBy: { createdAt: "asc" },
  });
  const servers: McpServerConfig[] = [];
  for (const row of rows) {
    const config = objectValue(row.config);
    const id = safeMcpId(String(config.id ?? row.name));
    const name = String(config.name ?? row.name).trim() || id;
    if (config.transport === "stdio") {
      const command = stringValue(config, "command");
      if (!command) continue;
      const args = Array.isArray(config.args)
        ? config.args.filter((value): value is string => typeof value === "string")
        : [];
      servers.push({
        id,
        name,
        transport: "stdio",
        command,
        args,
        cwd: stringValue(config, "cwd") ?? options.defaultCwd,
      });
      continue;
    }
    if (config.transport === "http") {
      const url = stringValue(config, "url");
      if (!url || !/^https?:\/\//i.test(url)) continue;
      servers.push({ id, name, transport: "http", url });
    }
  }
  return servers;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown, key: string): string | undefined {
  const raw = objectValue(value)[key];
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return trimmed || undefined;
}

function safeMcpId(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return normalized || "mcp";
}
