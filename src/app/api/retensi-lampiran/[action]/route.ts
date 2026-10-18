import { z } from "zod";
import { accountContext, IdentityError, limit } from "@/lib/auth/identity";
import { validOrigin } from "@/lib/auth/security";
import {
  retentionActions,
  retentionEnvelope,
} from "@/lib/attachment-retention/validation";
import { runRetention } from "@/lib/attachment-retention/server";
import type { RetentionState } from "@/lib/attachment-retention/types";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
const reply = (data: unknown, status = 200) =>
  Response.json(data, {
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
    if (!retentionActions[action])
      throw new IdentityError("Tindakan tidak ditemukan.", 404);
    const reader = request.body?.getReader();
    if (!reader) throw new IdentityError("Permintaan kosong.");
    let count = 0;
    const chunks: Uint8Array[] = [];
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        count += value.length;
        if (count > 20000) {
          await reader.cancel();
          throw new IdentityError("Permintaan terlalu besar.", 413);
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    let raw;
    try {
      raw = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      throw new IdentityError("JSON tidak valid.");
    }
    const p = retentionEnvelope.parse(raw);
    p.data = retentionActions[action].parse(p.data ?? {});
    if (["hold", "cancel", "requeue", "retry", "backup"].includes(action))
      z.uuid().parse(p.target);
    const ctx = await accountContext(true);
    await limit(
      "attachment-retention." + action,
      ctx.actor,
      action === "state" ? 120 : 20,
      900,
    );
    const call = async (cmd: string) => {
      const { data, error } = await ctx.client.rpc(
        "attachment_retention_command",
        { cmd, p },
      );
      if (error)
        throw new IdentityError(
          ["42501", "P0001"].includes(error.code)
            ? error.message
            : "Isian atau referensi retensi tidak sesuai.",
          error.code === "42501" ? 403 : error.code === "P0001" ? 409 : 400,
        );
      return data as RetentionState;
    };
    let result;
    if (action === "run") {
      await call("run");
      await runRetention(p.school);
      result = await call("state");
    } else result = await call(action);
    result.rows = result.rows.slice(0, 50);
    result.scheduler_configured = !!process.env.CRON_SECRET;
    return reply({ ok: true, result });
  } catch (e) {
    if (e instanceof z.ZodError)
      return reply(
        { ok: false, message: e.issues[0]?.message ?? "Isian tidak valid." },
        400,
      );
    if (e instanceof IdentityError)
      return reply(
        { ok: false, message: e.message, ...(e.next ? { next: e.next } : {}) },
        e.status,
      );
    console.error("Operasi retensi lampiran gagal");
    return reply(
      { ok: false, message: "Layanan retensi belum dapat dihubungi." },
      503,
    );
  }
}
