import "server-only";
import { createClient } from "@supabase/supabase-js";
import { requirePublicEnv } from "@/lib/env";
export function createSupabaseAdminClient(timeoutMs?: number) {
  const env = requirePublicEnv();
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) throw new Error("Secret Supabase server belum tersedia.");
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, secret, {
    auth: { autoRefreshToken: false, persistSession: false },
    ...(timeoutMs
      ? {
          global: {
            fetch: (input: RequestInfo | URL, init?: RequestInit) =>
              fetch(input, {
                ...init,
                signal: init?.signal
                  ? AbortSignal.any([
                      init.signal,
                      AbortSignal.timeout(timeoutMs),
                    ])
                  : AbortSignal.timeout(timeoutMs),
              }),
          },
        }
      : {}),
  });
}
