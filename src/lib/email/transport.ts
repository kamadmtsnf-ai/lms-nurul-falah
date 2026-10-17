import nodemailer from "nodemailer";
import { z } from "zod";
export const smtpSchema = z.object({
 SMTP_HOST: z.string().min(1), SMTP_PORT: z.coerce.number().int().min(1).max(65535),
 SMTP_SECURE: z.enum(["true", "false"]), SMTP_USER: z.string().min(1),
 SMTP_PASSWORD: z.string().min(1), EMAIL_FROM: z.email(),
});
export function createEmailTransport(source: NodeJS.ProcessEnv = process.env) {
 const env = smtpSchema.parse(source);
 return {from: env.EMAIL_FROM, transport: nodemailer.createTransport({
  host: env.SMTP_HOST, port: env.SMTP_PORT, secure: env.SMTP_SECURE === "true",
  requireTLS: env.SMTP_SECURE !== "true", auth: {user:env.SMTP_USER, pass:env.SMTP_PASSWORD},
  connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 15_000,
 })};
}
export function verificationMessage(url: string) {
 const parsed = new URL(url);
 if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") throw new Error("Tautan verifikasi harus HTTPS.");
 return { subject: "Verifikasi email LMS Nurul Falah", text: `Silakan verifikasi email akun Anda melalui tautan berikut:\n${url}\n\nJika Anda tidak meminta ini, abaikan email ini.` };
}
// Belum ada endpoint kirim email. Token, pembatasan dan outbox diimplementasikan pada Tahap 2.
