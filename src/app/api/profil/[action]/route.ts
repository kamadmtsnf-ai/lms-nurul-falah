import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { z } from "zod";
import {
  accountContext,
  IdentityError,
  identity,
  limit,
  provePassword,
} from "@/lib/auth/identity";
import { validOrigin, hashToken, makeToken } from "@/lib/auth/security";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { deliverIdentityMail, emailReady } from "@/lib/email/identity-mail";
import { profileCommand, readProfile } from "@/lib/profile/server";
import { profileSchemas, canEdit } from "@/lib/profile/validation";
import { PHOTO_LIMIT, prepareProfilePhoto } from "@/lib/profile/photo";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;
const headers = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};
const reply = (data: unknown, status = 200) =>
  Response.json(data, { status, headers });
function failure(e: unknown) {
  return reply(
    {
      ok: false,
      message:
        e instanceof IdentityError
          ? e.message
          : e instanceof z.ZodError
            ? e.issues[0]?.message
            : "Profil belum dapat diproses. Coba lagi.",
    },
    e instanceof IdentityError ? e.status : e instanceof z.ZodError ? 400 : 503,
  );
}
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ action: string }> },
) {
  try {
    const { action } = await params;
    const ctx = await accountContext(true);
    if (action === "read")
      return reply({ ok: true, result: await readProfile(ctx) });
    if (action !== "foto")
      throw new IdentityError("Halaman tidak ditemukan.", 404);
    const { path } = await profileCommand<{ path: string | null }>(
      ctx,
      "photo-read",
    );
    if (!path) throw new IdentityError("Foto profil belum tersedia.", 404);
    const { data, error } = await createSupabaseAdminClient()
      .storage.from("profile-photos")
      .download(path);
    if (error || !data)
      throw new IdentityError("Foto belum dapat dimuat.", 503);
    return new Response(await data.arrayBuffer(), {
      headers: {
        ...headers,
        "Content-Type": "image/webp",
        "Content-Disposition": 'inline; filename="foto-profil.webp"',
      },
    });
  } catch (e) {
    return failure(e);
  }
}
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
      throw new IdentityError("Rekam asal permintaan tidak valid.", 403);
    const ctx = await accountContext(true);
    const { action } = await params;
    await limit("profile", ctx.actor, 30, 900);
    const admin = createSupabaseAdminClient();
    if (action === "photo") {
      const bytes = Number(request.headers.get("content-length") ?? 0);
      if (bytes > PHOTO_LIMIT + 32768)
        throw new IdentityError("Foto maksimal 3 MB.", 413);
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File) || file.size > PHOTO_LIMIT || file.size === 0)
        throw new IdentityError(
          "Pilih foto JPG, PNG atau WebP maksimal 3 MB.",
          400,
        );
      const revision = z.coerce
        .number()
        .int()
        .nonnegative()
        .parse(form.get("revision"));
      const school = z
        .uuid()
        .nullable()
        .parse(form.get("school") || null);
      const current = await readProfile(ctx, school);
      if (!canEdit(current.next.photo))
        throw new IdentityError("Foto hanya dapat diubah setiap 90 hari.", 409);
      let photo: Buffer;
      try {
        photo = await prepareProfilePhoto(
          new Uint8Array(await file.arrayBuffer()),
          file.type,
        );
      } catch (e) {
        throw new IdentityError(
          e instanceof Error ? e.message : "Foto tidak valid.",
          400,
        );
      }
      const path = `${ctx.actor}/${randomUUID()}.webp`;
      const uploaded = await admin.storage
        .from("profile-photos")
        .upload(path, photo, {
          contentType: "image/webp",
          upsert: false,
          cacheControl: "0",
        });
      if (uploaded.error)
        throw new IdentityError("Foto gagal diunggah. Coba lagi.", 503);
      let saved: { old_path: string | null };
      try {
        saved = await profileCommand(ctx, "photo", {
          school,
          revision,
          data: { path },
        });
      } catch (e) {
        await admin.storage.from("profile-photos").remove([path]);
        throw e;
      }
      if (saved.old_path)
        after(async () => {
          const r = await admin.storage
            .from("profile-photos")
            .remove([saved.old_path!]);
          if (r.error)
            console.error("Pembersihan foto profil lama belum selesai.");
        });
      return reply({
        ok: true,
        result: await readProfile(ctx, school),
        message: "Foto profil berhasil disimpan.",
      });
    }
    const input = await request.json();
    if (action === "read")
      return reply({
        ok: true,
        result: await readProfile(
          ctx,
          z.uuid().nullable().optional().parse(input.school),
        ),
      });
    if (action === "remove-photo") {
      const v = profileSchemas.remove.parse(input);
      const saved = await profileCommand<{ old_path: string | null }>(
        ctx,
        "photo",
        { school: v.school, revision: v.revision, data: { path: null } },
      );
      if (saved.old_path)
        after(async () => {
          const r = await admin.storage
            .from("profile-photos")
            .remove([saved.old_path!]);
          if (r.error) console.error("Pembersihan foto profil belum selesai.");
        });
      return reply({
        ok: true,
        result: await readProfile(ctx, v.school),
        message:
          "Foto profil dihapus. Perubahan foto berikutnya tersedia dalam 90 hari.",
      });
    }
    if (action === "email") {
      const v = profileSchemas.email.parse(input);
      const current = await readProfile(ctx, v.school);
      if (v.email === current.email?.trim().toLowerCase())
        throw new IdentityError("Masukkan alamat email yang baru.", 400);
      if (!canEdit(current.next.email))
        throw new IdentityError(
          "Email hanya dapat diubah setiap 60 hari.",
          409,
        );
      if (!emailReady())
        throw new IdentityError(
          "Layanan email belum tersedia. Email Anda belum diubah.",
          503,
        );
      await limit("profile-email", ctx.actor, 3, 900);
      await provePassword(ctx.actor, v.password);
      const token = makeToken();
      const ticket = await identity<{ id: string; email: string }>(
        "email_issue",
        {
          actor: ctx.actor,
          session: ctx.session,
          email: v.email,
          hash: hashToken(token),
          profile_change: true,
          revision: v.revision,
        },
      );
      // Verification gate takes effect immediately. Resend to the same target remains allowed.
      after(async () => {
        try {
          await deliverIdentityMail(ticket, token, "verify_email");
        } catch {
          console.error(
            "Email profil belum terkirim; pengguna dapat mengirim ulang melalui verifikasi.",
          );
        }
      });
      return reply({
        ok: true,
        next: "/verifikasi",
        message:
          "Email diubah. Verifikasi alamat baru untuk melanjutkan. Jika email belum masuk, kirim ulang di halaman verifikasi.",
      });
    }
    if (!["name", "phone", "identity", "username"].includes(action))
      throw new IdentityError("Tindakan tidak ditemukan.", 404);
    const v =
      profileSchemas[
        action as "name" | "phone" | "identity" | "username"
      ].parse(input);
    if (action === "username" || action === "identity") {
      await limit(`profile-${action}`, ctx.actor, 6, 900);
      await provePassword(ctx.actor, (v as { password: string }).password);
    }
    const { school, revision, ...values } = v;
    delete (values as Record<string, unknown>).password;
    await profileCommand(ctx, action, { school, revision, data: values });
    return reply({
      ok: true,
      result: await readProfile(ctx, school),
      message: "Perubahan profil berhasil disimpan.",
    });
  } catch (e) {
    return failure(e);
  }
}
