import "server-only";
import { activeStudentLists } from "@/lib/students/server";
import { IdentityError } from "@/lib/auth/identity";
import type { AccountContext } from "@/lib/academic/server";
export async function quizCommand<T = Record<string, unknown>>(
  ctx: AccountContext,
  cmd: string,
  p: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await ctx.client.rpc("quiz_command", { cmd, p });
  if (error) {
    if (error.code === "42501") throw new IdentityError(error.message, 403);
    if (error.code === "P0001") throw new IdentityError(error.message, 409);
    if (error.code === "23505")
      throw new IdentityError(
        "Data sudah tersimpan atau terdapat catatan ganda. Muat ulang.",
        409,
      );
    if (["23514", "23503", "23502", "22P02", "22007"].includes(error.code))
      throw new IdentityError(
        "Isian atau referensi tidak sesuai aturan kuis.",
        400,
      );
    console.error("Operasi kuis gagal:", error.code);
    throw new IdentityError("Layanan kuis belum dapat dihubungi.", 503);
  }
  return activeStudentLists(data as T);
}
