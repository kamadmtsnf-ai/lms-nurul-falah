"use client";
import { useRef, useState } from "react";
import { FileText, UploadCloud, Trash2, Download } from "lucide-react";
import { ConfirmDialog } from "./confirm-dialog";
import { validateUpload } from "@/lib/upload-policy";
import { Button } from "@/components/ui/button";
import { learningRequest } from "@/lib/learning/types";
import { fileKind, mimeForName } from "@/lib/learning/file-validation";
export const fieldClass =
  "mt-2 form-control w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200";
export const panelClass =
  "surface-card rounded-2xl border border-stone-200 bg-white p-5 sm:p-6";
export function Links({ links }: { links: string[] }) {
  return links.length ? (
    <ul className="mt-4 space-y-2 text-sm">
      {links.map((link, i) => (
        <li key={`${link}:${i}`}>
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="break-all text-emerald-800 underline"
          >
            Buka sumber {i + 1}: {link}
          </a>
        </li>
      ))}
    </ul>
  ) : null;
}
export function Files({
  course,
  assets,
  onRemove,
}: {
  course: string;
  assets: { id: string; name: string; bytes?: number }[];
  onRemove?: (id: string) => Promise<void>;
}) {
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(""),
    [removing, setRemoving] = useState<{ id: string; name: string } | null>(
      null,
    );
  async function download(asset: { id: string; name: string; bytes?: number }) {
    setBusy(asset.id);
    setMessage("");
    try {
      const data = await learningRequest("file-url", {
        course,
        target: asset.id,
      });
      const link = document.createElement("a");
      link.href = data.url;
      link.rel = "noreferrer";
      link.download = asset.name;
      link.click();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Unduhan gagal.");
    } finally {
      setBusy("");
    }
  }
  return (
    <div className="mt-3 space-y-2">
      {assets.map((a) => (
        <div
          key={a.id}
          className="flex min-w-0 items-center gap-2 rounded-xl border border-stone-200 bg-stone-50/70 p-3"
        >
          <FileText
            aria-hidden
            size={20}
            className="shrink-0 text-emerald-700"
          />
          <button
            type="button"
            disabled={!!busy}
            onClick={() => void download(a)}
            className="min-h-11 min-w-0 flex-1 text-left text-sm font-medium text-emerald-900 hover:underline focus-visible:outline-2 focus-visible:outline-emerald-700"
          >
            <span className="block break-words [overflow-wrap:anywhere]">
              {busy === a.id ? "Menyiapkan unduhan…" : a.name}
            </span>
            {a.bytes !== undefined && (
              <span className="mt-1 block text-xs font-normal text-stone-500">
                {(a.bytes / 1000000).toFixed(2)} MB · Unduh berkas
              </span>
            )}
          </button>
          <Download aria-hidden size={16} className="shrink-0 text-stone-400" />
          {onRemove && (
            <button
              type="button"
              aria-label={`Hapus lampiran ${a.name}`}
              disabled={!!busy}
              onClick={() => {
                setMessage("");
                setRemoving(a);
              }}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-red-700 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-red-700"
            >
              <Trash2 size={18} />
            </button>
          )}
        </div>
      ))}
      <ConfirmDialog
        open={!!removing}
        title="Hapus lampiran?"
        description={`Berkas “${removing?.name ?? ""}” akan dihapus dari materi atau tugas ini. Tindakan ini tidak dapat dibatalkan. Tautan unduhan yang sudah diterbitkan dapat berlaku maksimal dua menit.`}
        confirmLabel="Hapus lampiran"
        busy={!!busy}
        error={message}
        onCancel={() => {
          setRemoving(null);
          setMessage("");
        }}
        onConfirm={() => {
          if (!removing || !onRemove || busy) return;
          setBusy(removing.id);
          setMessage("");
          void onRemove(removing.id)
            .then(() => setRemoving(null))
            .catch((e) =>
              setMessage(
                e instanceof Error
                  ? e.message
                  : "Lampiran belum dapat dihapus.",
              ),
            )
            .finally(() => setBusy(""));
        }}
      />
      {message && (
        <p role="alert" className="text-sm text-red-700">
          {message}
        </p>
      )}
    </div>
  );
}
export function Uploader({
  course,
  target,
  type,
  onDone,
}: {
  course: string;
  target: string;
  type: "material" | "assignment" | "submission";
  onDone: (id: string) => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(false),
    [filename, setFilename] = useState(""),
    [message, setMessage] = useState("");
  async function upload(file: File) {
    setBusy(true);
    setMessage("");
    setError(false);
    setFilename(file.name);
    try {
      const mime = mimeForName(file.name) ?? file.type,
        kind = fileKind(mime);
      if (!kind)
        throw new Error(
          "Format tidak didukung. Gunakan PDF, dokumen Office, JPG/PNG/WebP, MP3/M4A/OGG/WAV atau MP4/WebM.",
        );
      const check = validateUpload(kind, mime, file.size);
      if (!check.ok) throw new Error(check.reason ?? "Berkas tidak valid.");
      const ticket = await learningRequest("upload-start", {
        course,
        data: {
          target_type: type,
          target_id: target,
          name: file.name,
          kind,
          mime,
          bytes: file.size,
        },
      });
      const response = await fetch(ticket.url, {
        method: "PUT",
        headers: {
          "Content-Type": mime,
          "x-upsert": "false",
          "cache-control": "max-age=0",
        },
        body: await file.arrayBuffer(),
      });
      if (!response.ok)
        throw new Error(
          "Unggahan belum berhasil. Periksa koneksi dan coba kembali.",
        );
      await learningRequest("upload-complete", { course, target: ticket.id });
      await onDone(ticket.id);
      setMessage("Berkas siap digunakan.");
    } catch (e) {
      setError(true);
      setMessage(e instanceof Error ? e.message : "Unggahan gagal.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div
      aria-busy={busy}
      className="mt-5 rounded-2xl border border-dashed border-emerald-200 bg-emerald-50/40 p-4 sm:p-5"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-emerald-800 shadow-sm">
          <UploadCloud aria-hidden size={23} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-stone-900">
            Tambahkan lampiran
          </h3>
          <p className="mt-1 text-xs leading-5 text-stone-600">
            Pilih satu berkas dari perangkat. Berkas diperiksa sebelum dapat
            diunduh.
          </p>
        </div>
      </div>
      <input
        ref={inputRef}
        aria-label="Pilih file lampiran"
        type="file"
        disabled={busy}
        accept=".jpg,.jpeg,.png,.webp,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.mp3,.m4a,.ogg,.wav,.mp4,.webm"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
          e.target.value = "";
        }}
      />
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? (
            <>
              <span aria-hidden className="loading-spinner" /> Mengunggah &
              memeriksa…
            </>
          ) : (
            "Pilih berkas"
          )}
        </Button>
        <span className="min-w-0 break-words text-xs text-stone-500 [overflow-wrap:anywhere]">
          {filename || "PDF, Word, Excel, PowerPoint, gambar, audio atau video"}
        </span>
      </div>
      <p className="mt-3 text-xs leading-5 text-stone-500">
        Gambar maksimal 3 MB; dokumen maksimal 5 MB. Audio/video harus kurang
        dari 5 MB; untuk ukuran lebih besar gunakan tautan HTTPS.
      </p>
      {message && (
        <p
          role={error ? "alert" : "status"}
          className={`mt-3 rounded-xl p-3 text-sm ${error ? "bg-red-50 text-red-800" : "bg-emerald-100 text-emerald-900"}`}
        >
          {message}
        </p>
      )}
    </div>
  );
}

export function Notice({
  message,
  error = false,
}: {
  message: string;
  error?: boolean;
}) {
  return message ? (
    <p
      role={error ? "alert" : "status"}
      className={`rounded-xl border p-4 text-sm leading-6 ${error ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}
    >
      {message}
    </p>
  ) : null;
}
export function AttendanceForm({
  students,
  records,
  busy,
  onSave,
  readOnly = false,
}: {
  students: { id: string; full_name: string }[];
  records: { student_id: string; status: string; revision: number }[];
  busy: boolean;
  onSave: (entries: Record<string, unknown>[]) => Promise<boolean>;
  readOnly?: boolean;
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
      Object.fromEntries(records.map((a) => [a.student_id, a.status])),
    ),
    [reason, setReason] = useState("");
  const labels: Record<string, string> = {
    present: "Hadir",
    sick: "Sakit",
    excused: "Izin",
    absent: "Alpa",
  };
  return (
    <form
      method="post"
      onSubmit={(e) => {
        e.preventDefault();
        const entries = students
          .filter(
            (s) =>
              values[s.id] &&
              values[s.id] !==
                records.find((r) => r.student_id === s.id)?.status,
          )
          .map((s) => ({
            student: s.id,
            status: values[s.id],
            revision: records.find((r) => r.student_id === s.id)?.revision ?? 0,
            reason,
          }));
        if (entries.length) void onSave(entries);
      }}
    >
      {!readOnly && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-stone-500">
            Belum dicatat tidak dihitung sebagai alpa.
          </p>
          <Button
            type="button"
            disabled={busy}
            variant="outline"
            onClick={() =>
              setValues(
                Object.fromEntries(students.map((s) => [s.id, "present"])),
              )
            }
          >
            Tandai semua hadir
          </Button>
        </div>
      )}
      <div className="max-h-96 overflow-auto">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-stone-50">
            <tr>
              <th className="px-3 py-3">Siswa</th>
              <th className="px-3 py-3">Kehadiran</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s) => (
              <tr className="border-t border-stone-100" key={s.id}>
                <td className="px-3 py-3">{s.full_name}</td>
                <td className="px-3 py-3">
                  {readOnly ? (
                    (labels[values[s.id]] ?? "Belum dicatat")
                  ) : (
                    <select
                      aria-label={`Absensi ${s.full_name}`}
                      value={values[s.id] ?? ""}
                      disabled={busy}
                      className="rounded-lg border border-stone-300 bg-white p-2"
                      onChange={(e) =>
                        setValues((v) => ({ ...v, [s.id]: e.target.value }))
                      }
                    >
                      <option value="">Belum dicatat</option>
                      {Object.entries(labels).map(([value, label]) => (
                        <option value={value} key={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!students.length && (
        <p className="py-6 text-sm text-stone-500">
          Belum ada siswa pada daftar ini.
        </p>
      )}
      {!readOnly && (
        <>
          <label className="mt-5 block text-sm">
            Alasan koreksi (wajib untuk perubahan atau pencatatan tanggal lalu)
            <input
              maxLength={1000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className={fieldClass}
            />
          </label>
          <Button
            type="submit"
            disabled={
              busy ||
              !students.some(
                (s) =>
                  values[s.id] &&
                  values[s.id] !==
                    records.find((r) => r.student_id === s.id)?.status,
              )
            }
            className="mt-4"
          >
            {busy ? "Menyimpan…" : "Simpan absensi"}
          </Button>
        </>
      )}
    </form>
  );
}
