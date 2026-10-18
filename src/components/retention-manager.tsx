"use client";
import { useEffect, useRef, useState } from "react";
import { advancedRequest } from "@/lib/advanced/client";
import { Button } from "./ui/button";
import { fieldClass, panelClass, Notice } from "./learning-shared";
type State = {
  records: {
    student_id: string;
    full_name: string | null;
    username_normalized: string | null;
    retain_until: string;
    status: string;
    export_reference: string;
  }[];
  students: { id: string; full_name: string }[];
  years: { id: string; name: string; starts_on: string; ends_on: string }[];
};
export function RetentionManager({ school }: { school: string }) {
  const readId = useRef(0);
  const [state, setState] = useState<State | null>(null),
    [message, setMessage] = useState(""),
    [error, setError] = useState(false),
    [busy, setBusy] = useState(false),
    [offset, setOffset] = useState(0);
  async function load(page = offset) {
    const id = ++readId.current;
    setBusy(true);
    try {
      const next = await advancedRequest<State>("retention-list", {
        school,
        offset: page,
      });
      if (id === readId.current) {
        setState(next);
        setOffset(page);
      }
    } finally {
      if (id === readId.current) setBusy(false);
    }
  }
  useEffect(() => {
    void load().catch((e) => setMessage(e.message));
  }, [school]);
  async function run(cmd: string, data: Record<string, unknown>) {
    setBusy(true);
    try {
      await advancedRequest(cmd, { school, data, offset });
      await load();
      setError(false);
      setMessage("Tindakan tersimpan.");
    } catch (e) {
      setError(true);
      setMessage(e instanceof Error ? e.message : "Permintaan gagal.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-5">
      <Notice message={message} error={error} />
      <section className={panelClass}>
        <h2 className="text-lg font-semibold">Jadwalkan retensi alumni</h2>
        <p className="mt-3 text-sm leading-6 text-stone-600">
          Data aktif disimpan sampai akhir tahun pelajaran sesudah kelulusan.
          Kalender tahun berikutnya harus tersedia. Penjadwalan ini tidak
          menghapus data otomatis.
        </p>
        <form
          method="post"
          className="mt-5 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const d = new FormData(e.currentTarget);
            void run("retention-schedule", {
              student_id: d.get("student"),
              graduation_year_id: d.get("year"),
            });
          }}
        >
          <label className="block text-sm">
            Siswa
            <select required className={fieldClass} name="student">
              <option value="">Pilih siswa</option>
              {state?.students.map((s) => (
                <option value={s.id} key={s.id}>
                  {s.full_name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            Tahun pelajaran kelulusan
            <select required className={fieldClass} name="year">
              <option value="">Pilih tahun</option>
              {state?.years.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name} · {y.ends_on}
                </option>
              ))}
            </select>
          </label>
          <Button disabled={busy} type="submit">
            Jadwalkan masa simpan
          </Button>
        </form>
      </section>
      <section className={panelClass}>
        <h2 className="text-lg font-semibold">Daftar alumni</h2>
        <p className="mt-2 text-sm text-stone-600">
          Ekspor data sebelum penghapusan, periksa cadangan dan masa berlakunya.
          Penghapusan data aktif tidak menghapus salinan cadangan saat itu juga.
          Akun wali tetap dipertahankan. Akun yang mempunyai peran atau sekolah
          lain memerlukan pemeriksaan operator.
        </p>
        {state?.records.map((r) => (
          <article className="mt-5 rounded-xl border p-4" key={r.student_id}>
            <h3 className="font-semibold">
              {r.full_name ?? "Alumni yang telah dihapus"}
            </h3>
            <p className="mt-2 text-sm">
              Disimpan sampai {r.retain_until} ·{" "}
              {r.status === "scheduled"
                ? "Terjadwal"
                : r.status === "prepared"
                  ? "Disiapkan; akses siswa dinonaktifkan"
                  : "Data dibersihkan"}
            </p>
            {r.status !== "purged" && (
              <form
                method="post"
                className="mt-4 space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  const d = new FormData(e.currentTarget);
                  void run("retention-prepare", {
                    student_id: r.student_id,
                    export_reference: String(d.get("export")),
                    confirmation: String(d.get("confirm")),
                  });
                }}
              >
                <a
                  className="text-sm text-emerald-800 underline"
                  href="/pemantauan"
                >
                  Buka laporan dan ekspor data terlebih dahulu
                </a>
                <label className="block text-sm">
                  Referensi ekspor tersimpan (tanpa isi data pribadi)
                  <input
                    name="export"
                    className={fieldClass}
                    minLength={5}
                    maxLength={500}
                    required
                    defaultValue={r.export_reference}
                  />
                </label>
                <label className="block text-sm">
                  Ketik SIAPKAN PENGHAPUSAN
                  <input
                    name="confirm"
                    className={fieldClass}
                    required
                    pattern="SIAPKAN PENGHAPUSAN"
                  />
                </label>
                <Button disabled={busy} type="submit" variant="outline">
                  Siapkan dan nonaktifkan akses siswa
                </Button>
              </form>
            )}
            {r.status === "purged" && r.full_name && (
              <Button
                className="mt-4"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  if (
                    window.confirm(
                      "Selesaikan penghapusan akun Auth alumni yang datanya sudah dibersihkan?",
                    )
                  )
                    void run("retention-auth", {
                      student_id: r.student_id,
                      confirmation: "HAPUS AKUN ALUMNI",
                    });
                }}
              >
                Selesaikan penghapusan akun Auth
              </Button>
            )}
            {r.status === "prepared" && (
              <form
                method="post"
                className="mt-4 space-y-3 border-t pt-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  const d = new FormData(e.currentTarget);
                  if (
                    window.confirm(
                      "Hapus berkas, jawaban, nilai, absensi, identitas dan akun alumni ini? Tindakan tidak dapat dibatalkan dari aplikasi.",
                    )
                  )
                    void run("retention-purge", {
                      student_id: r.student_id,
                      confirmation: String(d.get("confirm")),
                    });
                }}
              >
                <label className="block text-sm">
                  Setelah ekspor diperiksa, ketik HAPUS DATA ALUMNI
                  <input
                    name="confirm"
                    required
                    pattern="HAPUS DATA ALUMNI"
                    className={fieldClass}
                  />
                </label>
                <Button disabled={busy} type="submit" variant="outline">
                  Hapus data alumni
                </Button>
              </form>
            )}
          </article>
        ))}
        <div className="mt-4 flex flex-wrap gap-3">
          <Button
            variant="outline"
            disabled={busy || !offset}
            onClick={() =>
              void load(Math.max(0, offset - 100)).catch((e) =>
                setMessage(e.message),
              )
            }
          >
            Sebelumnya
          </Button>
          <Button
            variant="outline"
            disabled={busy || (state?.records.length ?? 0) < 100}
            onClick={() =>
              void load(offset + 100).catch((e) => setMessage(e.message))
            }
          >
            Berikutnya
          </Button>
        </div>
      </section>
    </div>
  );
}
