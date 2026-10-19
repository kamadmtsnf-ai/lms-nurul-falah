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
// Compatibility for existing callers; both flows use the same template builder.
import { identityMessage } from "./identity-template";
export function verificationMessage(url: string) {
 return identityMessage(url, "verify_email");
}
