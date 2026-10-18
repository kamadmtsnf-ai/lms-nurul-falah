"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "./ui/button";
import { ConfirmDialog } from "./confirm-dialog";
import { DataTableViewport } from "./data-table-viewport";
import { fieldClass, panelClass, Notice } from "./learning-shared";
import { flowRequest } from "@/lib/academic-flow/client";
import { rowsOf, rowLabel, type AcademicState } from "@/lib/academic/config";
import { dateLabel } from "@/lib/learning/types";
type Run = {
  id: string;
  mode: string;
  status: string;
  participant_count: number;
  created_at: string;
  committed_at: string | null;
  expires_at?: string;
  source?: string;
  destination?: string;
};
type Preview = {
  run: Run;
  rows: {
    student_id: string;
    full_name: string;
    source_enrollment_id: string;
    destination_enrollment_id: string | null;
    source_exists: boolean;
    destination_status: string | null;
  }[];
  readiness?: { unfinalized_courses: number; working_quizzes: number };
};
export function AcademicRollover({
  school,
  state,
  onComplete,
}: {
  school: string;
  state: AcademicState;
  onComplete: () => Promise<void>;
}) {
  const [source, setSource] = useState(""),
    [destination, setDestination] = useState(""),
    [mode, setMode] = useState("semester"),
    [selected, setSelected] = useState<string[]>([]),
    [search, setSearch] = useState(""),
    [preview, setPreview] = useState<Preview | null>(null),
    [runs, setRuns] = useState<Run[]>([]),
    [offset, setOffset] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [open, setOpen] = useState(false),
    [confirmation, setConfirmation] = useState(""),
    [allowCommit, setAllowCommit] = useState(false);
  const acting = useRef(false),
    reads = useRef(0);
  const load = useCallback(async () => {
    const id = ++reads.current;
    try {
      const r = await flowRequest<{ runs: Run[] }>("rollover-list", {
        school,
        offset,
      });
      if (id === reads.current) setRuns(r.runs);
    } catch (e) {
      if (id === reads.current)
        setError(
          e instanceof Error ? e.message : "Riwayat belum dapat dimuat.",
        );
    }
  }, [school, offset]);
  useEffect(() => {
    void load();
    return () => {
      reads.current++;
    };
  }, [load]);
  const semesters = rowsOf(state, "semesters"),
    rooms = rowsOf(state, "classrooms");
  const candidates = useMemo(() => {
    const ids = new Set(
      rowsOf(state, "student_enrollments")
        .filter((e) => e.classroom_id === source && e.status === "active")
        .map((e) => e.student_id),
    );
    return state.users.filter(
      (u) =>
        ids.has(u.id) &&
        u.status !== "disabled" &&
        (u.roles as string[] | undefined)?.includes("student"),
    );
  }, [state, source]);
  const visible = candidates.filter((u) =>
    (String(u.full_name) + " " + String(u.username_normalized))
      .toLocaleLowerCase("id")
      .includes(search.toLocaleLowerCase("id")),
  );
  function invalidate() {
    setPreview(null);
    setAllowCommit(false);
    setError("");
    setMessage("");
  }
  async function action(action: string, body: Record<string, unknown>) {
    if (acting.current) return;
    acting.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await flowRequest<Preview>(action, { school, ...body });
      setPreview(r);
      setAllowCommit(action === "rollover-preview");
      if (action === "rollover-commit") {
        setOpen(false);
        setConfirmation("");
        setMessage(
          "Peserta ditambahkan ke periode tujuan; keanggotaan dan nilai asal tetap tersimpan.",
        );
        await onComplete();
      }
      await load();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Perpindahan belum dapat diproses.",
      );
    } finally {
      acting.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="space-y-5">
      <section className={panelClass}>
        <h2 className="text-xl font-semibold">
          Pergantian semester & kenaikan kelas
        </h2>
        <p className="mt-3 text-sm leading-6 text-stone-600">
          Siapkan periode dan rombel tujuan berstatus Draf. Pilih peserta,
          periksa pratinjau, lalu konfirmasikan. Proses menambah keanggotaan
          tujuan tanpa memindahkan nilai, menghapus riwayat, atau mengaktifkan
          semester otomatis.
        </p>
        <p className="mt-3 text-xs leading-5 text-stone-500">
          Pengampu, wali kelas, jadwal piket, dan kegiatan tujuan diatur
          terpisah. Keputusan naik/lulus tetap milik madrasah; siswa alumni
          diproses melalui kebijakan alumni/retensi.
        </p>
      </section>
      <Notice message={error || message} error={!!error} />
      <section className={panelClass}>
        <h3 className="font-semibold">1. Tentukan periode dan peserta</h3>
        <fieldset disabled={busy} className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm">
              Jenis perpindahan
              <select
                className={fieldClass}
                value={mode}
                onChange={(e) => {
                  setMode(e.target.value);
                  invalidate();
                }}
              >
                <option value="semester">
                  Pergantian semester (Ganjil → Genap)
                </option>
                <option value="promotion">
                  Kenaikan / mengulang kelas (Genap → Ganjil)
                </option>
              </select>
            </label>
            <label className="text-sm">
              Rombel asal
              <select
                className={fieldClass}
                value={source}
                onChange={(e) => {
                  const id = e.target.value;
                  setSource(id);
                  setSelected(
                    state.users
                      .filter(
                        (u) =>
                          u.status !== "disabled" &&
                          (u.roles as string[] | undefined)?.includes(
                            "student",
                          ) &&
                          rowsOf(state, "student_enrollments").some(
                            (en) =>
                              en.classroom_id === id &&
                              en.student_id === u.id &&
                              en.status === "active",
                          ),
                      )
                      .map((u) => u.id),
                  );
                  setSearch("");
                  invalidate();
                }}
              >
                <option value="">Pilih rombel asal</option>
                {rooms
                  .filter((r) =>
                    semesters.some(
                      (s) =>
                        s.id === r.semester_id &&
                        ["active", "archived"].includes(String(s.status)),
                    ),
                  )
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {rowLabel(state, "classrooms", r)}
                    </option>
                  ))}
              </select>
            </label>
            <label className="text-sm">
              Rombel tujuan (semester Draf)
              <select
                className={fieldClass}
                value={destination}
                onChange={(e) => {
                  setDestination(e.target.value);
                  invalidate();
                }}
              >
                <option value="">Pilih rombel tujuan</option>
                {rooms
                  .filter((r) =>
                    semesters.some(
                      (s) => s.id === r.semester_id && s.status === "draft",
                    ),
                  )
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {rowLabel(state, "classrooms", r)}
                    </option>
                  ))}
              </select>
            </label>
            <label className="text-sm">
              Cari peserta asal
              <input
                type="search"
                className={fieldClass}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Nama atau username"
              />
            </label>
          </div>
          <p className="text-xs leading-5 text-stone-500">
            Semester: tahun dan tingkat yang sama. Kenaikan: tahun berikutnya
            dan naik satu tingkat; pilih tingkat yang sama untuk mengulang
            kelas.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setSelected(candidates.map((u) => u.id));
                invalidate();
              }}
            >
              Pilih semua peserta asal
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setSelected([]);
                invalidate();
              }}
            >
              Kosongkan pilihan
            </Button>
            <span className="self-center text-sm">
              {selected.length} dari {candidates.length} peserta dipilih
            </span>
          </div>
          <div className="max-h-80 overflow-y-auto rounded-xl border border-stone-200 p-3">
            <div className="grid gap-2 sm:grid-cols-2">
              {visible.map((u) => (
                <label
                  key={u.id}
                  className="flex min-h-11 items-start gap-3 rounded-xl bg-stone-50 p-3 text-sm"
                >
                  <input
                    className="mt-1"
                    type="checkbox"
                    checked={selected.includes(u.id)}
                    onChange={(e) => {
                      setSelected((prev) =>
                        e.target.checked
                          ? [...prev, u.id]
                          : prev.filter((id) => id !== u.id),
                      );
                      invalidate();
                    }}
                  />
                  <span className="min-w-0 break-words [overflow-wrap:anywhere]">
                    {String(u.full_name)}
                    <span className="mt-1 block text-xs text-stone-500">
                      {String(u.username_normalized)}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            {!visible.length && (
              <p className="p-3 text-sm text-stone-500">
                Tidak ada peserta aktif yang cocok. Pilih rombel asal atau ubah
                pencarian.
              </p>
            )}
          </div>
          <Button
            disabled={busy || !source || !destination || !selected.length}
            onClick={() =>
              void action("rollover-preview", {
                data: { source, destination, mode, students: selected },
              })
            }
          >
            Buat pratinjau perpindahan
          </Button>
        </fieldset>
      </section>
      {preview && (
        <section className={panelClass}>
          <h3 className="font-semibold">
            2.{" "}
            {preview.run.status === "committed"
              ? "Rekonsiliasi perpindahan"
              : "Periksa pratinjau"}
          </h3>
          <p className="mt-2 break-all text-xs text-stone-500">
            Referensi: {preview.run.id}
          </p>
          <p className="mt-3 text-sm">
            {preview.run.participant_count} peserta ·{" "}
            {preview.run.status === "committed"
              ? "Sudah disimpan"
              : "Belum disimpan"}
            {preview.run.status === "preview" && preview.run.expires_at
              ? ` · Berlaku hingga ${dateLabel(preview.run.expires_at)}`
              : ""}
          </p>
          {preview.readiness && (
            <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm leading-6 text-amber-900">
              Pemeriksaan asal: {preview.readiness.unfinalized_courses} mapel
              belum difinalisasi, {preview.readiness.working_quizzes} percobaan
              kuis berlangsung. Tinjau sebelum mengarsipkan atau mengaktifkan
              periode melalui menu Semester.
            </p>
          )}
          <DataTableViewport label="Tabel rekonsiliasi peserta perpindahan">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr>
                  <th scope="col">Siswa</th>
                  <th scope="col">Keanggotaan asal</th>
                  <th scope="col">Keanggotaan tujuan</th>
                  <th scope="col">Status tujuan</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => (
                  <tr key={r.student_id}>
                    <th scope="row">{r.full_name}</th>
                    <td className="break-all">
                      {r.source_exists ? "Tersimpan" : "Perlu pemeriksaan"}
                      <span className="mt-1 block text-xs text-stone-500">
                        {r.source_enrollment_id}
                      </span>
                    </td>
                    <td className="break-all">
                      {r.destination_enrollment_id ||
                        "Akan dibuat setelah konfirmasi"}
                    </td>
                    <td>
                      {r.destination_status === "active"
                        ? "Aktif"
                        : r.destination_status || "Belum disimpan"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataTableViewport>
          {allowCommit && preview.run.status === "preview" && (
            <Button
              className="mt-4"
              disabled={busy}
              onClick={() => {
                setConfirmation("");
                setError("");
                setOpen(true);
              }}
            >
              Konfirmasi perpindahan peserta
            </Button>
          )}
          <p className="mt-3 text-xs leading-5 text-stone-500">
            Daftar mengikuti status akun aktif. Jika data berubah sejak
            pratinjau, buat pratinjau baru.
          </p>
        </section>
      )}
      <section className={panelClass}>
        <h3 className="font-semibold">Riwayat perpindahan</h3>
        <DataTableViewport label="Tabel riwayat perpindahan semester">
          <table className="w-full min-w-[690px]">
            <thead>
              <tr>
                <th scope="col">Asal</th>
                <th scope="col">Tujuan</th>
                <th scope="col">Peserta</th>
                <th scope="col">Status</th>
                <th scope="col">Waktu</th>
                <th scope="col">Detail</th>
              </tr>
            </thead>
            <tbody>
              {runs.slice(0, 25).map((r) => (
                <tr key={r.id}>
                  <th scope="row">{r.source}</th>
                  <td>{r.destination}</td>
                  <td>{r.participant_count}</td>
                  <td>
                    {r.status === "committed" ? "Tersimpan" : "Pratinjau"}
                  </td>
                  <td>{dateLabel(r.committed_at || r.created_at)}</td>
                  <td>
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        void action("rollover-detail", {
                          target: r.id,
                          data: {},
                        })
                      }
                    >
                      Lihat rekonsiliasi
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataTableViewport>
        {!runs.length && (
          <p className="mt-4 text-sm">Belum ada riwayat perpindahan.</p>
        )}
        <div className="mt-4 flex flex-wrap gap-3">
          <Button
            variant="outline"
            disabled={busy || !offset}
            onClick={() => setOffset((v) => Math.max(0, v - 25))}
          >
            Riwayat sebelumnya
          </Button>
          <Button
            variant="outline"
            disabled={busy || runs.length <= 25}
            onClick={() => setOffset((v) => v + 25)}
          >
            Riwayat berikutnya
          </Button>
        </div>
      </section>
      <ConfirmDialog
        open={open}
        title="Simpan perpindahan peserta?"
        description="Server memeriksa ulang peran, status akun, periode, dan duplikasi. Semua peserta disimpan dalam satu transaksi. Keanggotaan asal tetap tersimpan dan semester tujuan tetap Draf."
        confirmLabel="Ya, simpan perpindahan"
        busy={busy}
        error={error || undefined}
        onCancel={() => {
          setOpen(false);
          setConfirmation("");
          setError("");
        }}
        onConfirm={() => {
          if (preview)
            void action("rollover-commit", {
              target: preview.run.id,
              data: { confirmation },
            });
        }}
      >
        <label className="mt-4 block text-sm">
          Ketik PINDAHKAN PESERTA
          <input
            className={fieldClass}
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            autoComplete="off"
            disabled={busy}
          />
        </label>
      </ConfirmDialog>
    </div>
  );
}
