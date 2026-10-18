import { z } from "zod";
import { randomUUID } from "node:crypto";
import {
  accountContext,
  IdentityError,
  limit,
  provePassword,
} from "@/lib/auth/identity";
import { validOrigin } from "@/lib/auth/security";
import { nextFor } from "@/lib/auth/validation";
import {
  securityCommand,
  invalidateAccount,
  clearAuthCookies,
} from "@/lib/account-security/server";
import { verifiedTotp } from "@/lib/account-security/policy";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;
const headers = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};
const reply = (v: unknown, status = 200) =>
  Response.json(v, { status, headers });
const password = z.string().min(1, "Masukkan password saat ini.").max(128),
  code = z.string().regex(/^\d{6}$/, "Masukkan kode autentikator 6 digit.");
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
    if (Number(request.headers.get("content-length")) > 8192)
      throw new IdentityError("Permintaan terlalu besar.", 413);
    const text = await request.text();
    if (Buffer.byteLength(text) > 8192)
      throw new IdentityError("Permintaan terlalu besar.", 413);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new IdentityError("JSON tidak valid.", 400);
    }
    const input = z.record(z.string(), z.unknown()).parse(parsed);
    const { action } = await params;
    if (
      ![
        "state",
        "enroll",
        "verify",
        "cancel-enroll",
        "disable",
        "revoke-others",
        "logout-all",
        "reveal-nik",
      ].includes(action)
    )
      throw new IdentityError("Fitur tidak ditemukan.", 404);
    const challenge = action === "verify";
    const ctx = await accountContext(!challenge, challenge);
    await limit(
      "security." + action,
      ctx.actor,
      action === "verify" ? 8 : action === "state" ? 60 : 10,
      900,
    );
    const factors = await ctx.client.auth.mfa.listFactors();
    if (factors.error)
      throw new IdentityError(
        "Status autentikator belum dapat diperiksa.",
        503,
      );
    const totp = verifiedTotp(factors.data.all);
    if (action === "state")
      return reply({
        ok: true,
        result: {
          ...(await securityCommand(ctx, "state")),
          factors: totp.map((f) => ({
            id: f.id,
            name: f.friendly_name || "Autentikator",
          })),
        },
      });
    if (action === "enroll") {
      await provePassword(ctx.actor, password.parse(input.password));
      if (totp.length)
        throw new IdentityError("Autentikator sudah aktif.", 409);
      for (const f of factors.data.all.filter(
        (f) => f.factor_type === "totp" && f.status === "unverified",
      )) {
        const r = await ctx.client.auth.mfa.unenroll({ factorId: f.id });
        if (r.error)
          throw new IdentityError(
            "Penyiapan lama belum dapat dibersihkan.",
            503,
          );
      }
      const r = await ctx.client.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: `LMS ${randomUUID().slice(0, 8)}`,
        issuer: "LMS Nurul Falah",
      });
      if (r.error || r.data.type !== "totp")
        throw new IdentityError("Autentikator belum dapat disiapkan.", 503);
      return reply({
        ok: true,
        result: {
          factor_id: r.data.id,
          qr: r.data.totp.qr_code,
          secret: r.data.totp.secret,
        },
      });
    }
    if (action === "cancel-enroll") {
      const factor = z.uuid().parse(input.factor_id);
      if (
        !factors.data.all.some(
          (f) =>
            f.id === factor &&
            f.status === "unverified" &&
            f.factor_type === "totp",
        )
      )
        throw new IdentityError("Penyiapan tidak ditemukan.", 404);
      const r = await ctx.client.auth.mfa.unenroll({ factorId: factor });
      if (r.error)
        throw new IdentityError("Penyiapan belum dapat dibatalkan.", 503);
      return reply({ ok: true, message: "Penyiapan autentikator dibatalkan." });
    }
    if (action === "verify") {
      const factor = z.uuid().parse(input.factor_id);
      const own = factors.data.all.find(
        (f) => f.id === factor && f.factor_type === "totp",
      );
      if (!own) throw new IdentityError("Autentikator tidak ditemukan.", 404);
      const result = await ctx.client.auth.mfa.challengeAndVerify({
        factorId: factor,
        code: code.parse(input.code),
      });
      if (result.error)
        throw new IdentityError(
          "Kode belum benar atau sudah kedaluwarsa. Coba kode terbaru.",
          400,
        );
      const fresh = await accountContext(false, true);
      if (fresh.mfaRequired)
        throw new IdentityError("Verifikasi belum selesai. Coba kembali.", 409);
      await securityCommand(fresh, "event", {
        event: own.status === "unverified" ? "mfa_enrolled" : "mfa_verified",
      });
      return reply({
        ok: true,
        next:
          own.status === "unverified" ? "/keamanan" : nextFor(fresh.profile),
        message: "Verifikasi autentikator berhasil.",
      });
    }
    await provePassword(ctx.actor, password.parse(input.password));
    if (action === "reveal-nik")
      return reply({
        ok: true,
        result: await securityCommand(ctx, "reveal-nik"),
      });
    if (action === "revoke-others") {
      if (!ctx.accessToken)
        throw new IdentityError("Sesi tidak tersedia.", 401);
      const r = await createSupabaseAdminClient().auth.admin.signOut(
        ctx.accessToken,
        "others",
      );
      if (r.error)
        throw new IdentityError("Sesi lain belum dapat diakhiri.", 503);
      await securityCommand(ctx, "revoke-others");
      return reply({
        ok: true,
        message: "Semua sesi perangkat lain telah diakhiri.",
      });
    }
    if (action === "logout-all") {
      await invalidateAccount(ctx.actor, "logout_all");
      await clearAuthCookies();
      return reply({
        ok: true,
        next: "/masuk",
        message: "Semua sesi telah diakhiri.",
      });
    }
    if (action === "disable") {
      const factor = z.uuid().parse(input.factor_id);
      if (!totp.some((f) => f.id === factor))
        throw new IdentityError("Autentikator tidak ditemukan.", 404);
      const verified = await ctx.client.auth.mfa.challengeAndVerify({
        factorId: factor,
        code: code.parse(input.code),
      });
      if (verified.error)
        throw new IdentityError("Kode autentikator belum benar.", 400);
      const fresh = await accountContext(true);
      await securityCommand(fresh, "event", { event: "mfa_disable_requested" });
      const r = await fresh.client.auth.mfa.unenroll({ factorId: factor });
      if (r.error)
        throw new IdentityError("Autentikator belum dapat dinonaktifkan.", 503);
      await invalidateAccount(ctx.actor, "mfa_disabled");
      await clearAuthCookies();
      return reply({
        ok: true,
        next: "/masuk",
        message:
          "Autentikator yang dipilih dinonaktifkan. Login ulang untuk melanjutkan.",
      });
    }
    throw new IdentityError("Tindakan belum tersedia.", 404);
  } catch (e) {
    return reply(
      {
        ok: false,
        message:
          e instanceof IdentityError
            ? e.message
            : e instanceof z.ZodError
              ? e.issues[0]?.message
              : "Layanan keamanan belum tersedia.",
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
