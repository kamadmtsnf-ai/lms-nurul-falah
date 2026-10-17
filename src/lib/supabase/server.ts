import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { requirePublicEnv } from "@/lib/env";
export async function createSupabaseServerClient() {
 const env = requirePublicEnv(); const store = await cookies();
 return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
   cookieOptions: { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/" },
   cookies: { getAll: () => store.getAll(), setAll: updates => {
     // Server Components tidak dapat menulis cookie; proxy menangani refresh.
     try { updates.forEach(({name,value,options}) => store.set(name,value,options)); } catch { /* hanya read-only rendering */ }
   } },
 });
}
