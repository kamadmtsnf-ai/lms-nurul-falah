import { z } from "zod";
export const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url().refine(v => { try { const url = new URL(v); return url.protocol === "https:" || (["http:"].includes(url.protocol) && ["localhost", "127.0.0.1"].includes(url.hostname)); } catch { return false; } }, "Gunakan HTTPS untuk Supabase hosted"),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(20).startsWith("sb_publishable_", "Gunakan publishable key Supabase, bukan secret/service-role key"),
});
export function readPublicEnv() {
  const result = publicEnvSchema.safeParse({ NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY });
  return result.success ? result.data : null;
}
export function requirePublicEnv() {
 const env = readPublicEnv();
 if (!env) throw new Error("Konfigurasi Supabase publik belum lengkap atau tidak valid.");
 return env;
}
