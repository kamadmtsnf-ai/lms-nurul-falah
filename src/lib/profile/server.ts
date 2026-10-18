import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { IdentityError } from "@/lib/auth/identity";
import type { AccountContext } from "@/lib/academic/server";
import type { ProfileData } from "./types";
export async function profileCommand<T = Record<string, unknown>>(
  ctx: AccountContext,
  cmd: string,
  input: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await createSupabaseAdminClient().rpc(
    "profile_command",
    { cmd, p: { ...input, actor: ctx.actor, session: ctx.session } },
  );
  if (error) {
    if (error.code === "42501")
      throw new IdentityError(
        "Sesi, aktivasi atau izin profil tidak valid.",
        403,
      );
    if (error.code === "23505")
      throw new IdentityError(
        "Username sudah digunakan. Pilih username lain.",
        409,
      );
    if (error.code === "P0001") throw new IdentityError(error.message, 409);
    throw new IdentityError("Profil belum dapat diproses. Coba lagi.", 503);
  }
  return data as T;
}
export const readProfile = (ctx: AccountContext, school?: string | null) =>
  profileCommand<ProfileData>(ctx, "read", { school });

/** Caller must first finish the authorized retention-purge/retention-auth RPC. */
export async function cleanupRetainedProfilePhotos(user: string) {
  const { purgeProfilePhotos } = await import("./cleanup");
  const bucket = createSupabaseAdminClient().storage.from("profile-photos");
  try {
    return await purgeProfilePhotos(user, {
      list: async (prefix) => {
        const r = await bucket.list(prefix, {
          limit: 100,
          sortBy: { column: "name", order: "asc" },
        });
        if (r.error) throw r.error;
        return r.data;
      },
      remove: async (paths) => {
        const r = await bucket.remove(paths);
        if (r.error) throw r.error;
      },
    });
  } catch {
    throw new IdentityError(
      "Pembersihan foto profil belum selesai. Ulangi penghapusan akun atau hubungi operator.",
      503,
    );
  }
}
