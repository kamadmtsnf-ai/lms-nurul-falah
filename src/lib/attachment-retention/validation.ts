import { z } from "zod";
const days = z.number().int().min(1).max(3650);
export const retentionActions: Record<string, z.ZodType> = {
  state: z.object({}).strict(),
  scan: z.object({}).strict(),
  run: z.object({ confirmation: z.literal("JALANKAN BATCH RETENSI") }).strict(),
  settings: z
    .object({
      revision: z.number().int().min(0),
      enabled: z.boolean(),
      pending_days: days,
      material_days: days,
      submission_days: days,
      grace_days: z.number().int().min(1).max(90),
      backup_required: z.boolean(),
      confirmation: z.string().max(50).optional(),
    })
    .strict(),
  hold: z.object({ hold: z.boolean() }).strict(),
  cancel: z.object({}).strict(),
  requeue: z.object({}).strict(),
  retry: z.object({}).strict(),
  backup: z
    .object({
      reference: z.string().trim().min(10).max(500),
      confirmation: z.literal("BACKUP SUDAH DIVERIFIKASI"),
    })
    .strict(),
};
export const retentionEnvelope = z
  .object({
    school: z.uuid(),
    target: z.uuid().optional(),
    offset: z.number().int().min(0).max(100000).default(0),
    data: z.unknown().optional(),
  })
  .strict();
