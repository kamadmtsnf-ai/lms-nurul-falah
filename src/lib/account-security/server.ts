import "server-only";
import { cookies } from "next/headers";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { IdentityError } from "@/lib/auth/identity";
import type { AccountContext } from "@/lib/academic/server";
export async function securityCommand<T = Record<string, unknown>>(
  ctx: AccountContext,
  cmd: string,
  p: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await createSupabaseAdminClient().rpc(
    "security_command",
    { cmd, p: { ...p, actor: ctx.actor, session: ctx.session } },
  );
  if (error)
    throw new IdentityError(
      error.code === "P0001" || error.code === "42501"
        ? error.message
        : "Layanan keamanan belum dapat diproses.",
      error.code === "42501" ? 403 : error.code === "P0001" ? 409 : 503,
    );
  return data as T;
}
export async function invalidateAccount(
  user: string,
  reason: "mfa_disabled" | "logout_all",
) {
  const { error } = await createSupabaseAdminClient().rpc(
    "security_invalidate_user",
    { target: user, reason },
  );
  if (error)
    throw new IdentityError("Sesi belum berhasil diakhiri. Coba lagi.", 503);
}
export async function clearAuthCookies() {
  const store = await cookies();
  for (const c of store.getAll())
    if (c.name.startsWith("sb-")) store.delete(c.name);
}
export type SecurityState = {
  sessions: {
    id: string;
    current: boolean;
    created_at: string;
    updated_at: string | null;
    user_agent: string;
  }[];
  events: { id: string; field: string; created_at: string }[];
};
