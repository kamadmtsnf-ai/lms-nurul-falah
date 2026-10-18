import { z } from "zod";
import { accountContext, IdentityError, limit } from "@/lib/auth/identity";
import { validOrigin } from "@/lib/auth/security";
import { activeStudentLists } from "@/lib/students/server";
import { flowActions, flowEnvelope } from "@/lib/academic-flow/validation";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;
const reply = (v: unknown, status = 200) =>
  Response.json(v, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
export async function POST(
  request: Request,
  { params }: { params: Promise<{ action: string }> },
) {
  try {
    if (
      !validOrigin(
        request.headers.get("origin"),
        request.url,
        process.env.APP_URL,
      )
    )
      throw new IdentityError("Asal permintaan tidak diizinkan.", 403);
    if (!request.headers.get("content-type")?.includes("application/json"))
      throw new IdentityError("Gunakan JSON.", 415);
    const { action } = await params;
    if (!flowActions[action])
      throw new IdentityError("Tindakan tidak ditemukan.", 404);
    const reader = request.body?.getReader();
    if (!reader) throw new IdentityError("Permintaan kosong.");
    let bytes = 0;
    const chunks: Uint8Array[] = [];
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.length;
        if (bytes > 100000) {
          await reader.cancel();
          throw new IdentityError("Permintaan terlalu besar.", 413);
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    let raw: unknown;
    try {
      raw = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      throw new IdentityError("JSON tidak valid.");
    }
    const p = flowEnvelope.parse(raw);
    p.data = flowActions[action].parse(p.data ?? {});
    if (action.startsWith("rollover-")) z.uuid().parse(p.school);
    else z.uuid().parse(p.course);
    if (
      [
        "followup-complete",
        "followup-withdraw",
        "rollover-commit",
        "rollover-detail",
      ].includes(action)
    )
      z.uuid().parse(p.target);
    const ctx = await accountContext(true);
    await limit(
      "academic-flow." + action,
      ctx.actor,
      ["state", "history", "rollover-list", "rollover-detail"].includes(action)
        ? 120
        : 30,
      900,
    );
    const { data, error } = await ctx.client.rpc("academic_flow_command", {
      cmd: action,
      p,
    });
    if (error)
      throw new IdentityError(
        ["42501", "P0001"].includes(error.code)
          ? error.message
          : error.code === "23505"
            ? "Kode atau data sudah digunakan. Muat ulang."
            : "Data atau referensi tidak sesuai. Muat ulang dan periksa isian.",
        error.code === "42501"
          ? 403
          : ["P0001", "23505"].includes(error.code)
            ? 409
            : ["23514", "23503", "22P02", "23502"].includes(error.code)
              ? 400
              : 503,
      );
    return reply({ ok: true, result: await activeStudentLists(data) });
  } catch (e) {
    return reply(
      {
        ok: false,
        message:
          e instanceof IdentityError
            ? e.message
            : e instanceof z.ZodError
              ? e.issues[0]?.message
              : "Alur akademik belum dapat diproses.",
        ...(e instanceof IdentityError && e.next ? { next: e.next } : {}),
      },
      e instanceof IdentityError
        ? e.status
        : e instanceof z.ZodError
          ? 400
          : 503,
    );
  }
}
