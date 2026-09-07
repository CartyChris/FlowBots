import * as z from "zod";
import { ArtifactSchema } from "./domain.js";
import { Id } from "./ids.js";

export const MissionTaskSchema = z.object({
  id: Id,
  parentTaskId: Id.nullable(),
  botId: Id,
  botName: z.string(),
  prompt: z.string(),
  status: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  runId: Id.nullable(),
  groupChatId: Id.nullable(),
  kind: z.string().nullable(),
  artifactCount: z.number().int().nonnegative(),
});
export type MissionTask = z.infer<typeof MissionTaskSchema>;
export const MissionListSchema = z.object({
  tasks: z.array(MissionTaskSchema),
  truncated: z.boolean(),
});
export const MissionDetailSchema = z.object({
  task: MissionTaskSchema,
  contextPacket: z.record(z.string(), z.unknown()).nullable(),
  artifacts: z.array(ArtifactSchema),
  events: z.array(
    z.object({
      id: Id,
      type: z.string(),
      createdAt: z.string(),
      botId: Id,
      payload: z.record(z.string(), z.unknown()),
    }),
  ),
});
