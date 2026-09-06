import * as z from "zod";
import { Id } from "./ids.js";

export const ActionPolicyModeSchema = z.enum(["legacy", "review-risky", "review-all", "read-only"]);
export const ActionRuleSchema = z
  .object({
    tool: z.string().trim().min(1).max(128),
    decision: z.enum(["allow", "ask", "deny"]),
    fingerprint: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  })
  .strict();
export const ActionPolicySchema = z
  .object({
    mode: ActionPolicyModeSchema,
    rules: z.array(ActionRuleSchema).max(100),
  })
  .strict();
export type ActionPolicy = z.infer<typeof ActionPolicySchema>;

export const ActionApprovalSchema = z.object({
  id: Id,
  botId: Id,
  botName: z.string(),
  runId: Id,
  tool: z.string(),
  scope: z.enum(["internal", "workspace", "host", "external"]),
  preview: z.string(),
  status: z.enum(["pending", "approved", "denied", "consumed", "expired", "cancelled"]),
  decision: z.enum(["allow-once", "allow-exact", "deny"]).nullable(),
  createdAt: z.string(),
  expiresAt: z.string(),
  resolvedAt: z.string().nullable(),
});
export type ActionApproval = z.infer<typeof ActionApprovalSchema>;
