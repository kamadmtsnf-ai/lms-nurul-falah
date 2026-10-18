"use client";
import { useState } from "react";
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
}: {
  course: string;
  assets: { id: string; name: string; bytes?: number }[];
}) {
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState("");
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
        <button
          type="button"
          key={a.id}
          disabled={!!busy}
          onClick={() => void download(a)}
          className="block rounded-lg bg-stone-50 px-3 py-2 text-left text-sm text-emerald-800 underline"
        >
          {busy === a.id ? "Menyiapkan unduhan…" : a.name}{" "}
          {a.bytes !== undefined && (
            <span className="text-xs text-stone-500">
              ({(a.bytes / 1000000).toFixed(2)} MB)
            </span>
          )}
        </button>
      ))}
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
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  async function upload(file: File) {
    setBusy(true);
    setMessage("");
    try {
      const mime = mimeForName(file.name) ?? file.type,
        kind = fileKind(mime);
      if (!kind)
        throw new Error(
          "Format tidak didukung. Gunakan PDF, dokumen Office, JPG/PNG/WebP, MP3/M4A/OGG/WAV atau MP4/WebM.",
        );
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
      setMessage(e instanceof Error ? e.message : "Unggahan gagal.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-4 rounded-xl border border-dashed border-stone-300 p-4">
      <label className="block text-sm font-medium">
        {busy ? "Mengunggah dan memeriksa berkas…" : "Tambahkan lampiran"}
        <input
          type="file"
          disabled={busy}
          accept=".jpg,.jpeg,.png,.webp,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.mp3,.m4a,.ogg,.wav,.mp4,.webm"
          className="mt-3 block w-full text-xs"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
            e.target.value = "";
          }}
        />
      </label>
      <p className="mt-2 text-xs leading-5 text-stone-500">
        Gambar maksimal 3 MB; dokumen maksimal 5 MB. Audio/video harus kurang
        dari 5 MB; untuk ukuran lebih besar gunakan tautan HTTPS.
      </p>
      {message && (
        <p role="status" className="mt-3 text-sm text-emerald-900">
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
