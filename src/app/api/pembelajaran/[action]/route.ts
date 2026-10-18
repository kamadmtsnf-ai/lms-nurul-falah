import { previewKind } from "@/lib/learning/preview";
import {
  removeTeachingFile,
  FileRemovalError,
  type TeachingFile,
} from "@/lib/learning/remove-file";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { accountContext, IdentityError, limit } from "@/lib/auth/identity";
import { validOrigin } from "@/lib/auth/security";
import { learningCommand } from "@/lib/learning/server";
import {
  meetingSchema,
  materialSchema,
  assignmentSchema,
  submissionSchema,
  gradeSchema,
  entriesSchema,
  assetSchema,
} from "@/lib/learning/validation";
import { validateFile } from "@/lib/learning/file-validation";
import type { UploadKind } from "@/lib/upload-policy";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;
const output = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store" },
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
      throw new IdentityError("Format permintaan harus JSON.", 415);
    if (Number(request.headers.get("content-length") ?? 0) > 200000)
      throw new IdentityError("Permintaan terlalu besar.", 413);
    const reader = request.body?.getReader();
    if (!reader) throw new IdentityError("Permintaan kosong.");
    let size = 0;
    const chunks: Uint8Array[] = [];
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 200000) {
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
      throw new IdentityError("Data permintaan tidak valid.");
    }
    const input = z
      .object({
        course: z.uuid().optional(),
        school: z.uuid().optional(),
        classroom: z.uuid().optional(),
        date: z.iso.date().optional(),
        from: z.iso.date().optional(),
        to: z.iso.date().optional(),
        target: z.uuid().optional(),
        offset: z.number().int().min(0).max(100000).optional(),
        data: z.unknown().optional(),
        entries: z.unknown().optional(),
      })
      .strict()
      .parse(raw);
    const { action } = await params;
    const allowed = [
      "catalog",
      "course",
      "history",
      "submission-detail",
      "daily-meta",
      "daily",
      "daily-report",
      "daily-save",
      "meeting-save",
      "meeting-sync",
      "meeting-attendance",
      "material-save",
      "assignment-save",
      "submit",
      "grade",
      "release-grades",
      "upload-start",
      "upload-complete",
      "file-url",
      "file-preview",
      "file-remove",
    ];
    if (!allowed.includes(action))
      throw new IdentityError("Fitur tidak ditemukan.", 404);
    const ctx = await accountContext(true);
    await limit("learning", ctx.actor, 300, 900);
    if (action !== "catalog" && !action.startsWith("daily"))
      z.uuid().parse(input.course);
    if (action.startsWith("daily")) {
      z.uuid().parse(input.school);
      if (action !== "daily-meta") {
        z.uuid().parse(input.classroom);
        if (action !== "daily-report") z.iso.date().parse(input.date);
        else {
          z.iso.date().parse(input.from);
          z.iso.date().parse(input.to);
        }
      }
    }
    let data: unknown = input.data;
    let entries: unknown;
    if (action === "meeting-save") data = meetingSchema.parse(data);
    else if (action === "material-save") data = materialSchema.parse(data);
    else if (action === "assignment-save") data = assignmentSchema.parse(data);
    else if (action === "submit") data = submissionSchema.parse(data);
    else if (action === "grade") data = gradeSchema.parse(data);
    else if (action === "release-grades")
      data = z
        .object({
          visible: z.boolean(),
          expected_updated_at: z.string().max(50),
        })
        .strict()
        .parse(data);
    else if (["meeting-attendance", "daily-save"].includes(action))
      entries = entriesSchema.parse(input.entries);
    if (
      [
        "history",
        "submission-detail",
        "meeting-sync",
        "meeting-attendance",
        "submit",
        "grade",
        "release-grades",
        "upload-complete",
        "file-url",
        "file-preview",
        "file-remove",
      ].includes(action)
    )
      z.uuid().parse(input.target);
    if (action === "upload-start") {
      const meta = assetSchema.parse(data);
      try {
        validateFile(meta);
      } catch (e) {
        throw new IdentityError(
          e instanceof Error ? e.message : "Berkas tidak valid.",
        );
      }
      await limit("learning-upload", ctx.actor, 40, 900);
      const admin = createSupabaseAdminClient();
      const expired = await learningCommand<string[]>(ctx, "asset-cleanup", {
        course: input.course,
      });
      if (expired.length) {
        const cleanup = await admin.storage.from("lms-private").remove(expired);
        if (cleanup.error)
          console.error(
            "Pembersihan unggahan kedaluwarsa perlu pemeriksaan operator.",
          );
      }
      const ticket = await learningCommand<{ id: string; path: string }>(
        ctx,
        "asset-reserve",
        { course: input.course, data: meta },
      );
      const upload = await admin.storage
        .from("lms-private")
        .createSignedUploadUrl(ticket.path, { upsert: false });
      if (upload.error) {
        await learningCommand(ctx, "asset-fail", {
          course: input.course,
          target: ticket.id,
        });
        throw new IdentityError("Izin unggahan belum dapat dibuat.", 503);
      }
      return output({ ok: true, id: ticket.id, url: upload.data.signedUrl });
    }
    if (action === "upload-complete") {
      const admin = createSupabaseAdminClient();
      const { data: asset, error } = await admin
        .from("learning_assets")
        .select("*")
        .eq("id", input.target!)
        .eq("teaching_class_id", input.course!)
        .eq("owner_id", ctx.actor)
        .single();
      if (error || !asset)
        throw new IdentityError("Unggahan tidak ditemukan.", 404);
      if (asset.status === "ready") {
        await learningCommand(ctx, "asset-info", {
          course: input.course,
          target: input.target,
        });
        return output({ ok: true, message: "Berkas sudah tersimpan." });
      }
      if (asset.status !== "pending")
        throw new IdentityError("Unggahan sudah dibatalkan.", 409);
      try {
        const file = await admin.storage
          .from("lms-private")
          .download(asset.object_path);
        if (file.error)
          throw new IdentityError("Berkas belum berhasil diunggah.", 409);
        const bytes = Buffer.from(await file.data.arrayBuffer());
        validateFile(
          {
            name: asset.name,
            kind: asset.kind as UploadKind,
            mime: asset.mime,
            bytes: asset.bytes,
          },
          bytes,
        );
        const proof = randomUUID();
        const attested = await admin.rpc("learning_asset_attest", {
          asset: asset.id,
          proof,
        });
        if (attested.error)
          throw new IdentityError(
            "Pemeriksaan berkas belum dapat disimpan.",
            503,
          );
        await learningCommand(ctx, "asset-complete", {
          course: input.course,
          target: asset.id,
          check: proof,
        });
      } catch (e) {
        await learningCommand(ctx, "asset-fail", {
          course: input.course,
          target: asset.id,
        }).catch(() => {});
        await admin.storage.from("lms-private").remove([asset.object_path]);
        if (e instanceof IdentityError) throw e;
        throw new IdentityError(
          e instanceof Error ? e.message : "Berkas tidak valid.",
        );
      }
      return output({
        ok: true,
        message: "Berkas berhasil diverifikasi dan disimpan.",
      });
    }
    if (action === "file-remove") {
      const course = input.course!,
        id = input.target!,
        admin = createSupabaseAdminClient();
      await removeTeachingFile(course, id, {
        context: async () => {
          const state = await learningCommand<{
            context: { manager: boolean; writable: boolean; school: string };
          }>(ctx, "course", { course });
          return state.context;
        },
        find: async () => {
          const { data, error } = await admin
            .from("learning_assets")
            .select(
              "id,school_id,teaching_class_id,target_id,target_type,object_path,status",
            )
            .eq("id", id)
            .eq("teaching_class_id", course)
            .maybeSingle();
          if (error)
            throw new IdentityError("Lampiran belum dapat diperiksa.", 503);
          return data as TeachingFile | null;
        },
        targetExists: async (file) => {
          const { data, error } = await admin
            .from(
              file.target_type === "material"
                ? "learning_materials"
                : "learning_assignments",
            )
            .select("id")
            .eq("id", file.target_id)
            .eq("teaching_class_id", course)
            .maybeSingle();
          if (error)
            throw new IdentityError(
              "Tujuan lampiran belum dapat diperiksa.",
              503,
            );
          return Boolean(data);
        },
        auditRequest: async (file) => {
          const { error } = await admin.from("audit_logs").insert({
            school_id: file.school_id,
            actor_id: ctx.actor,
            action: "learning.file-remove-request",
            entity: "learning_assets",
            entity_id: id,
          });
          if (error)
            throw new IdentityError(
              "Permintaan penghapusan belum dapat dicatat.",
              503,
            );
        },
        markRemoved: async (file) => {
          const { data, error } = await admin
            .from("learning_assets")
            .update({ status: "removed" })
            .eq("id", id)
            .eq("teaching_class_id", course)
            .eq("status", file.status)
            .select("id")
            .maybeSingle();
          if (error || !data)
            throw new IdentityError(
              "Status lampiran berubah atau belum dapat disimpan. Coba hapus kembali.",
              409,
            );
        },
        removeObject: async (path) => {
          const { error } = await admin.storage
            .from("lms-private")
            .remove([path]);
          if (error)
            throw new IdentityError(
              "Akses lampiran sudah ditutup, tetapi penghapusan berkas belum selesai. Tekan hapus kembali untuk mencoba ulang.",
              503,
            );
        },
      });
      return output({ ok: true, message: "Lampiran berhasil dihapus." });
    }
    if (action === "file-url" || action === "file-preview") {
      const asset = await learningCommand<{
        object_path: string;
        name: string;
        mime: string;
      }>(ctx, "asset-info", { course: input.course, target: input.target });
      if (action === "file-preview" && !previewKind(asset.mime))
        throw new IdentityError(
          "Pratinjau hanya tersedia untuk gambar JPG/PNG/WebP dan PDF.",
          415,
        );
      const signed = await createSupabaseAdminClient()
        .storage.from("lms-private")
        .createSignedUrl(
          asset.object_path,
          120,
          action === "file-url" ? { download: asset.name } : undefined,
        );
      if (signed.error)
        throw new IdentityError("Tautan unduh belum tersedia.", 503);
      return output({
        ok: true,
        url: signed.data.signedUrl,
        ...(action === "file-preview" ? { mime: asset.mime } : {}),
      });
    }
    const result = await learningCommand(ctx, action, {
      ...input,
      data,
      entries,
    });
    return output({ ok: true, result });
  } catch (e) {
    return output(
      {
        ok: false,
        message:
          e instanceof IdentityError || e instanceof FileRemovalError
            ? e.message
            : e instanceof z.ZodError
              ? e.issues[0]?.message
              : "Layanan pembelajaran belum dapat dihubungi.",
      },
      e instanceof IdentityError || e instanceof FileRemovalError
        ? e.status
        : e instanceof z.ZodError
          ? 400
          : 503,
    );
  }
}
