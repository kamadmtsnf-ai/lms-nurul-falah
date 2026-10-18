import { z } from "zod";
const id = z.uuid(),
  revision = z.number().int().nonnegative(),
  reason = z.string().trim().min(5, "Alasan minimal 5 karakter.").max(1000);
export const flowActions: Record<string, z.ZodType> = {
  state: z.object({}).strict(),
  snapshot: z.object({}).strict(),
  history: z.object({ student_id: id.optional() }).strict(),
  lock: z.object({ revision, reason }).strict(),
  unlock: z.object({ revision, reason }).strict(),
  "goal-save": z
    .object({
      revision: revision.default(0),
      code: z.string().trim().min(1).max(30),
      title: z.string().trim().min(2).max(1000),
      threshold: z.number().min(0).max(100),
      active: z.boolean().default(true),
    })
    .strict(),
  "goal-link": z
    .object({
      revision,
      goal_id: id,
      kind: z.enum(["material", "assignment", "quiz"]),
      activity_id: id,
      linked: z.boolean(),
    })
    .strict(),
  "followup-create": z
    .object({
      student_id: id,
      kind: z.enum(["remedial", "enrichment"]),
      activity_kind: z.enum(["assignment", "quiz"]),
      activity_id: id,
      plan: z.string().trim().min(5).max(3000),
      due_on: z.iso.date(),
      policy: z.enum(["preserve", "highest", "latest", "capped"]),
      cap: z.number().min(0).max(100),
    })
    .strict()
    .refine((v) => v.kind !== "enrichment" || v.policy === "preserve", {
      message: "Pengayaan mempertahankan nilai awal.",
    }),
  "followup-complete": z
    .object({
      revision,
      result_score: z.number().min(0).max(100),
      note: z.string().trim().min(5).max(3000),
    })
    .strict(),
  "followup-withdraw": z
    .object({ revision, note: z.string().trim().min(5).max(3000) })
    .strict(),
  "rollover-preview": z
    .object({
      source: id,
      destination: id,
      mode: z.enum(["semester", "promotion"]),
      students: z
        .array(id)
        .min(1)
        .max(500)
        .refine((v) => new Set(v).size === v.length, {
          message: "Siswa tidak boleh ganda.",
        }),
    })
    .strict(),
  "rollover-commit": z
    .object({ confirmation: z.literal("PINDAHKAN PESERTA") })
    .strict(),
  "rollover-list": z.object({}).strict(),
  "rollover-detail": z.object({}).strict(),
};
export const flowEnvelope = z
  .object({
    course: id.optional(),
    school: id.optional(),
    target: id.optional(),
    offset: z.number().int().min(0).max(100000).default(0),
    data: z.unknown().optional(),
    followup_offset: z.number().int().min(0).max(100000).default(0),
  })
  .strict();
