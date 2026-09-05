import * as z from "zod";
import { Id } from "./ids.js";

export const BotPresenceStateSchema = z.enum([
  "idle",
  "queued",
  "thinking",
  "reading",
  "searching",
  "browsing",
  "writing",
  "coding",
  "building",
  "running_command",
  "using_tool",
  "collaborating",
  "delegating",
  "handing_off",
  "waiting_on_bot",
  "reviewing",
  "judging",
  "verifying",
  "testing",
  "blocked",
  "needs_user",
  "complete",
  "failed",
  "cancelled",
]);
export type BotPresenceState = z.infer<typeof BotPresenceStateSchema>;

export const OfficeStationSchema = z.enum([
  "lounge",
  "focus",
  "research",
  "development",
  "collaboration",
  "review",
  "artifacts",
  "help",
]);
export type OfficeStation = z.infer<typeof OfficeStationSchema>;

/** Safe activity metadata only; never prompt, tool arguments, output, or hidden reasoning. */
export const BotPresenceSnapshotSchema = z.object({
  botId: Id,
  runId: Id.nullable(),
  taskId: Id.nullable(),
  state: BotPresenceStateSchema,
  summary: z.string().max(180),
  station: OfficeStationSchema,
  updatedAt: z.string(),
  startedAt: z.string().nullable(),
  modelProvider: z.string().nullable(),
  modelId: z.string().nullable(),
});
export type BotPresenceSnapshot = z.infer<typeof BotPresenceSnapshotSchema>;
