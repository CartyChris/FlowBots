import * as z from "zod";
import { ThreadMessageSchema } from "./events.js";
import { Id, MemoryScope, RunStatus, SandboxKind } from "./ids.js";

export const PersonaSlidersSchema = z.object({
  humor: z.number().int().min(0).max(100),
  spice: z.number().int().min(0).max(100),
  energy: z.number().int().min(0).max(100),
  verbosity: z.number().int().min(0).max(100),
});
export type PersonaSlidersInput = z.infer<typeof PersonaSlidersSchema>;

export const PersonaConfigSchema = z.object({
  id: z.string().max(40),
  sliders: PersonaSlidersSchema,
  swearing: z.boolean(),
  customVoice: z.string().max(2000),
});
export type PersonaConfigInput = z.infer<typeof PersonaConfigSchema>;

export const PersonaPresetSchema = z.object({
  id: z.string(),
  name: z.string(),
  emoji: z.string(),
  color: z.string(),
  tagline: z.string(),
  sliders: PersonaSlidersSchema,
  swearing: z.boolean(),
  presenceTag: z.string(),
  catchphrases: z.array(z.string()),
});
export type PersonaPreset = z.infer<typeof PersonaPresetSchema>;

export const BotSchema = z.object({
  id: Id,
  workspaceId: Id,
  name: z.string(),
  title: z.string(),
  description: z.string(),
  instructions: z.string(),
  persona: PersonaConfigSchema,
  color: z.string(),
  notifyOnFinish: z.boolean(),
  parentBotId: Id.nullable(),
  threadId: Id,
  preview: z.string(),
  status: z.string(),
  updatedAt: z.string(),
  createdAt: z.string(),
});
export type Bot = z.infer<typeof BotSchema>;

export const CreateBotInput = z.object({
  name: z.string().min(1).max(80),
  title: z.string().max(160).default(""),
  description: z.string().max(4000).default(""),
  instructions: z.string().max(20000).default(""),
  persona: PersonaConfigSchema.optional(),
  notifyOnFinish: z.boolean().default(true),
  color: z.string().optional(),
});
export type CreateBotInput = z.infer<typeof CreateBotInput>;

export const UpdateBotInput = z.object({
  botId: Id,
  name: z.string().min(1).max(80).optional(),
  title: z.string().max(160).optional(),
  description: z.string().max(4000).optional(),
  instructions: z.string().max(20000).optional(),
  persona: PersonaConfigSchema.optional(),
  notifyOnFinish: z.boolean().optional(),
  color: z.string().optional(),
});

export const RoutineSchema = z.object({
  id: Id,
  botId: Id,
  name: z.string(),
  prompt: z.string(),
  cron: z.string(),
  timezone: z.string(),
  active: z.boolean(),
  notify: z.boolean(),
  lastRunAt: z.string().nullable(),
  nextRunAt: z.string().nullable(),
  createdAt: z.string(),
});
export type Routine = z.infer<typeof RoutineSchema>;

export const CreateRoutineInput = z.object({
  botId: Id,
  name: z.string().min(1).max(80),
  prompt: z.string().min(1),
  cron: z.string().min(1),
  timezone: z.string().default("UTC"),
  notify: z.boolean().default(true),
  active: z.boolean().default(false),
});

export const MemoryDocumentSchema = z.object({
  id: Id,
  scope: MemoryScope,
  botId: Id.nullable(),
  path: z.string(),
  content: z.string(),
  revision: z.number().int(),
  updatedAt: z.string(),
});
export type MemoryDocument = z.infer<typeof MemoryDocumentSchema>;

export const ConnectionSchema = z.object({
  id: Id,
  provider: z.string(),
  displayName: z.string(),
  status: z.enum(["pending", "connected", "revoked", "error"]),
  capabilities: z.array(z.string()),
  createdAt: z.string(),
});
export type Connection = z.infer<typeof ConnectionSchema>;

export const ConnectionCatalogItemSchema = z.object({
  slug: z.string(),
  name: z.string(),
  logo: z.string().nullable(),
  connected: z.boolean(),
  noAuth: z.boolean(),
});
export type ConnectionCatalogItem = z.infer<typeof ConnectionCatalogItemSchema>;

export const CapabilityInstallSchema = z.object({
  id: Id,
  kind: z.enum(["skill", "plugin", "mcp", "connection"]),
  name: z.string(),
  source: z.string(),
  version: z.string().nullable(),
  digest: z.string().nullable(),
  config: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
});
export type CapabilityInstall = z.infer<typeof CapabilityInstallSchema>;

export const ArtifactSchema = z.object({
  id: Id,
  botId: Id,
  runId: Id.nullable(),
  name: z.string(),
  mimeType: z.string(),
  size: z.number().int(),
  createdAt: z.string(),
});

export const UsageRecordSchema = z.object({
  id: Id,
  botId: Id.nullable(),
  runId: Id.nullable(),
  provider: z.string(),
  model: z.string(),
  inputTokens: z.number().int(),
  outputTokens: z.number().int(),
  createdAt: z.string(),
});

export const ComputerStatusSchema = z.object({
  botId: Id,
  kind: SandboxKind,
  state: z.enum(["stopped", "booting", "running", "suspended", "error"]),
  controlHolder: z.enum(["bot", "user", "none"]),
  screenAvailable: z.boolean(),
  homeRevision: z.string().nullable(),
});
export type ComputerStatus = z.infer<typeof ComputerStatusSchema>;

export const RunSchema = z.object({
  id: Id,
  botId: Id,
  threadId: Id,
  taskId: Id,
  status: RunStatus,
  trigger: z.enum(["user", "routine", "resume", "follow_up", "spawn"]),
  modelProvider: z.string().nullable(),
  modelId: z.string().nullable(),
  error: z.string().nullable(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
});
export type Run = z.infer<typeof RunSchema>;

export const ThreadSnapshotSchema = z.object({
  botId: Id,
  threadId: Id,
  cursor: z.number().int().min(-1),
  messages: z.array(ThreadMessageSchema),
  run: RunSchema.nullable(),
  computer: ComputerStatusSchema,
});
export type ThreadSnapshot = z.infer<typeof ThreadSnapshotSchema>;

export const ModelCredentialSchema = z.object({
  id: Id,
  provider: z.string(),
  label: z.string(),
  hasKey: z.boolean(),
  isDefault: z.boolean(),
});

export const DeploymentSettingsSchema = z.object({
  ownerUserId: Id.nullable(),
  signupsEnabled: z.boolean(),
  signupAllowlist: z.array(z.string()),
  hasDeploymentModelCredential: z.boolean(),
  defaultProvider: z.string().nullable(),
  defaultModel: z.string().nullable(),
  computerHost: z.enum(["docker", "this-mac"]).nullable(),
  canChooseHostComputer: z.boolean(),
});

export const MeSchema = z.object({
  userId: Id,
  email: z.string().email(),
  name: z.string(),
  workspaceId: Id,
  isDeploymentOwner: z.boolean(),
  needsModel: z.boolean(),
  defaultProvider: z.string().nullable(),
  defaultModel: z.string().nullable(),
  computerHost: z.enum(["docker", "this-mac"]).nullable(),
  canChooseHostComputer: z.boolean(),
});
export type Me = z.infer<typeof MeSchema>;

export const ExportManifestSchema = z.object({
  version: z.literal(1),
  exportedAt: z.string(),
  bot: BotSchema.pick({ name: true, title: true, description: true, instructions: true }),
  memory: z.array(z.object({ path: z.string(), content: z.string() })),
  routines: z.array(RoutineSchema.pick({ name: true, prompt: true, cron: true, timezone: true })),
  files: z.array(z.object({ path: z.string(), content: z.string() })),
  history: z.array(ThreadMessageSchema),
});
export type ExportManifest = z.infer<typeof ExportManifestSchema>;

export const REACTION_KIND_VALUES = ["fire", "skull", "joy", "eyes"] as const;
export const ReactionKindSchema = z.enum(REACTION_KIND_VALUES);
export type ReactionKindValue = z.infer<typeof ReactionKindSchema>;

export const MessageReactionsSchema = z.object({
  messageId: Id,
  counts: z.record(ReactionKindSchema, z.number().int().nonnegative()),
  mine: z.array(ReactionKindSchema),
});
export type MessageReactions = z.infer<typeof MessageReactionsSchema>;

export const BotPresenceSchema = z.object({
  botId: Id,
  name: z.string(),
  color: z.string(),
  personaId: z.string(),
  emoji: z.string(),
  state: z.enum(["thinking", "online", "idle"]),
  tag: z.string(),
});
export type BotPresenceDto = z.infer<typeof BotPresenceSchema>;

export const BuzzItemSchema = z.object({
  id: Id,
  botId: Id,
  botName: z.string(),
  botColor: z.string(),
  personaId: z.string(),
  personaEmoji: z.string(),
  kind: z.string(),
  text: z.string(),
  createdAt: z.string(),
});
export type BuzzItem = z.infer<typeof BuzzItemSchema>;

export const LoungeLineSchema = z.object({
  botId: Id,
  name: z.string(),
  emoji: z.string(),
  personaId: z.string(),
  reply: z.string(),
});
export type LoungeLine = z.infer<typeof LoungeLineSchema>;

export const LoungeSessionSchema = z.object({
  id: Id,
  topicId: z.string(),
  topicLabel: z.string(),
  createdAt: z.string(),
  lines: z.array(LoungeLineSchema),
});
export type LoungeSession = z.infer<typeof LoungeSessionSchema>;

export const SyncScanSchema = z.object({
  envKeys: z.array(
    z.object({
      provider: z.string(),
      label: z.string(),
      envVar: z.string(),
      modelId: z.string().nullable(),
      imported: z.boolean(),
    }),
  ),
  localServers: z.array(
    z.object({
      provider: z.string(),
      baseUrl: z.string(),
      running: z.boolean(),
      models: z.array(z.string()),
      error: z.string().nullable(),
    }),
  ),
});
export type SyncScan = z.infer<typeof SyncScanSchema>;
