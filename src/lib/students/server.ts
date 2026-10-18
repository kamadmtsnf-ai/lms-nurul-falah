import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { IdentityError } from "@/lib/auth/identity";
import { filterStudentLists } from "./visibility";
/** Only after authenticated/scoped RPC success. Reads just ids already authorized. */
export async function activeStudentLists<T>(payload: T): Promise<T> {
  return filterStudentLists(payload, async (ids) => {
    const { data, error } = await createSupabaseAdminClient()
      .from("profiles")
      .select("id")
      .in("id", ids)
      .eq("status", "active");
    if (error || !data)
      throw new IdentityError(
        "Status akun siswa belum dapat diperiksa. Muat ulang atau coba kembali.",
        503,
      );
    return data.map((row) => row.id as string);
  });
}
