import { z } from "zod";
import { usernameSchema, emailSchema } from "@/lib/auth/validation";
const digits = (length: number, label: string) =>
  z
    .string()
    .trim()
    .refine(
      (v) => v === "" || new RegExp(`^[0-9]{${length}}$`).test(v),
      `${label} harus ${length} digit, atau kosongkan jika belum ada.`,
    );
export const phoneSchema = z
  .string()
  .trim()
  .max(40)
  .transform((v) => v.replace(/[\s()\-]/g, ""))
  .refine(
    (v) => v === "" || /^\+?[0-9]{8,15}$/.test(v),
    "Nomor HP/WA harus 8–15 digit, boleh diawali +.",
  );
const base = {
  school: z.uuid().nullable().optional(),
  revision: z.number().int().nonnegative(),
};
export const profileSchemas = {
  name: z
    .object({
      ...base,
      name: z
        .string()
        .trim()
        .min(2)
        .max(100)
        .refine(
          (v) => !/[\u0000-\u001f\u007f]/.test(v),
          "Nama tidak boleh memuat karakter kontrol.",
        ),
    })
    .strict(),
  phone: z.object({ ...base, phone: phoneSchema }).strict(),
  identity: z
    .object({
      ...base,
      nik: digits(16, "NIK"),
      clear_nik: z.boolean().default(false),
      password: z.string().min(1, "Masukkan password saat ini.").max(128),
      nip: digits(18, "NIP").default(""),
      npk: digits(13, "NPK").default(""),
    })
    .strict()
    .refine((v) => !v.clear_nik || v.nik === "", {
      message: "Kosongkan NIK baru jika ingin menghapus NIK tersimpan.",
      path: ["nik"],
    }),
  username: z
    .object({
      ...base,
      username: usernameSchema,
      password: z.string().min(1).max(128),
    })
    .strict(),
  email: z
    .object({
      ...base,
      email: emailSchema,
      password: z.string().min(1).max(128),
    })
    .strict(),
  remove: z.object({ ...base }).strict(),
};
export function canEdit(next: string | null, now = Date.now()) {
  return !next || new Date(next).getTime() <= now;
}
export function profileDate(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("id-ID", {
        dateStyle: "long",
        timeStyle: "short",
        timeZone: "Asia/Jakarta",
      }).format(new Date(value))
    : "Sekarang";
}
