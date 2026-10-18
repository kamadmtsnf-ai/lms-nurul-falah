"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type FormEvent,
} from "react";
import { Button } from "./ui/button";
import { ConfirmDialog } from "./confirm-dialog";
import { DataTableViewport } from "./data-table-viewport";
import { fieldClass, panelClass, Notice } from "./learning-shared";
import {
  flowRequest,
  policyLabels,
  type FlowState,
  type Goal,
} from "@/lib/academic-flow/client";
import { dateLabel } from "@/lib/learning/types";
type HistoryRow = {
  id: string;
  full_name: string;
  title: string;
  position: number | null;
  old_score: number | null;
  new_score: number;
  reason: string;
  created_at: string;
};
type Pending = {
  action: string;
  target?: string;
  data: Record<string, unknown>;
  title: string;
  description: string;
};
const labels: Record<string, string> = {
  material: "Materi",
  assignment: "Tugas",
  quiz: "Kuis",
  remedial: "Remedial",
  enrichment: "Pengayaan",
  planned: "Direncanakan",
  completed: "Selesai",
  withdrawn: "Ditarik",
};
const num = (v: number | null | undefined) =>
  v == null
    ? "—"
    : new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(v);
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block min-w-0 text-sm">
      {label}
      {children}
    </label>
  );
}
export function AcademicFlowPanel({ course }: { course: string }) {
  const [state, setState] = useState<FlowState | null>(null),
    [tab, setTab] = useState("goals"),
    [offset, setOffset] = useState(0),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [editing, setEditing] = useState<Goal | null>(null),
    [goalFilter, setGoalFilter] = useState(""),
    [mastery, setMastery] = useState("all"),
    [pending, setPending] = useState<Pending | null>(null),
    [reason, setReason] = useState(""),
    [history, setHistory] = useState<HistoryRow[]>([]),
    [historyOffset, setHistoryOffset] = useState(0),
    [historyStudent, setHistoryStudent] = useState("");
  const reads = useRef(0),
    acting = useRef(false);
  const load = useCallback(async () => {
    const id = ++reads.current;
    setLoading(true);
    try {
      const r = await flowRequest<FlowState>("state", { course, offset });
      if (id === reads.current) {
        setState(r);
        setError("");
      }
    } catch (e) {
      if (id === reads.current)
        setError(e instanceof Error ? e.message : "Data belum dapat dimuat.");
    } finally {
      if (id === reads.current) setLoading(false);
    }
  }, [course, offset]);
  useEffect(() => {
    setState(null);
    void load();
    return () => {
      reads.current++;
    };
  }, [load]);
  useEffect(() => {
    if (tab !== "history") return;
    let active = true;
    setHistory([]);
    flowRequest<{ rows: HistoryRow[] }>("history", {
      course,
      offset: historyOffset,
      data: historyStudent ? { student_id: historyStudent } : {},
    })
      .then((r) => {
        if (active) setHistory(r.rows);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [course, tab, historyOffset, historyStudent, state]);
  async function save(
    action: string,
    data: Record<string, unknown>,
    target?: string,
  ) {
    if (acting.current) return false;
    acting.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    reads.current++;
    try {
      await flowRequest(action, {
        course,
        data,
        ...(target ? { target } : {}),
      });
      setPending(null);
      setEditing(null);
      setReason("");
      await load();
      setMessage("Perubahan alur akademik berhasil disimpan.");
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Penyimpanan belum berhasil.");
      return false;
    } finally {
      acting.current = false;
      setBusy(false);
    }
  }
  function confirm(
    action: string,
    data: Record<string, unknown>,
    title: string,
    description: string,
    target?: string,
  ) {
    setError("");
    setReason("");
    setPending({ action, data, title, description, target });
  }
  const canManage =
      !!state?.context.manager && state.context.writable && !state.locked,
    selectedGoal =
      state?.goals.find((g) => g.id === goalFilter) ||
      state?.goals.find((g) => g.active);
  const data = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    return new FormData(e.currentTarget);
  };
  return (
    <div className="space-y-5">
      <section className={panelClass}>
        <div className="flex flex-wrap justify-between gap-3">
          <h2 className="text-xl font-semibold">Alur akademik</h2>
          <Button
            variant="outline"
            disabled={busy || loading}
            onClick={() => void load()}
          >
            Muat ulang alur
          </Button>
        </div>
        <p className="mt-3 text-sm leading-6 text-stone-600">
          Tujuan pembelajaran, tindak lanjut, dan jejak koreksi nilai. Nilai
          awal tetap tersimpan saat remedial dilakukan.
        </p>
        <p
          className={`mt-4 rounded-xl p-3 text-sm ${state?.locked ? "bg-amber-50 text-amber-900" : "bg-emerald-50 text-emerald-900"}`}
        >
          {state?.locked
            ? "Nilai final terkunci. Perubahan komponen nilai dan pengumpulan dibekukan; guru tetap dapat mengatur keterbukaan nilai."
            : "Belum difinalisasi. Lengkapi nilai dan bobot pada Lanjutan → Nilai akhir berbobot sebelum mengunci."}
        </p>
      </section>
      <nav
        aria-label="Alur akademik"
        className="grid grid-cols-2 gap-2 rounded-2xl border border-stone-200 bg-stone-50 p-2 sm:flex sm:flex-wrap"
      >
        {[
          ["goals", "Tujuan pembelajaran"],
          ["achievement", "Ketercapaian"],
          ["followups", "Remedial & pengayaan"],
          ["history", "Riwayat & finalisasi"],
        ].map(([key, label]) => (
          <Button
            key={key}
            variant={tab === key ? "default" : "outline"}
            aria-pressed={tab === key}
            className="min-w-0 px-3 py-3 text-xs leading-5 sm:text-sm"
            disabled={busy}
            onClick={() => {
              setTab(key);
              setError("");
            }}
          >
            {label}
          </Button>
        ))}
      </nav>
      <Notice message={error || message} error={!!error} />
      {loading && (
        <p role="status" className="text-sm text-stone-500">
          Memuat alur akademik…
        </p>
      )}
      {state && tab === "goals" && (
        <>
          <section className={panelClass}>
            <h3 className="font-semibold">Tujuan pembelajaran (TP)</h3>
            <p className="mt-2 text-sm leading-6 text-stone-500">
              Mengikuti kurikulum kelas ini. Ketercapaian memakai rata-rata
              persentase seluruh tugas/kuis tertaut yang sudah dinilai. Progres
              materi ditampilkan terpisah.
            </p>
            <div className="mt-4 space-y-3">
              {state.goals.map((g) => (
                <article
                  key={g.id}
                  className="rounded-xl border border-stone-200 p-4"
                >
                  <div className="flex flex-wrap justify-between gap-3">
                    <div className="min-w-0">
                      <h4 className="break-words font-semibold">
                        {g.code} · {g.active ? "Aktif" : "Arsip"}
                      </h4>
                      <p className="mt-2 whitespace-pre-wrap break-words text-sm">
                        {g.title}
                      </p>
                      <p className="mt-2 text-xs text-stone-500">
                        Batas ketercapaian {num(g.threshold)}%
                      </p>
                    </div>
                    {canManage && (
                      <Button variant="outline" onClick={() => setEditing(g)}>
                        Ubah {g.code}
                      </Button>
                    )}
                  </div>
                  <ul className="mt-3 space-y-2">
                    {state.links
                      .filter((l) => l.goal_id === g.id)
                      .map((l) => (
                        <li
                          key={l.kind + l.activity_id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-stone-50 p-3 text-sm"
                        >
                          <span className="min-w-0 break-words">
                            {labels[l.kind]} ·{" "}
                            {state.activities.find(
                              (a) =>
                                a.id === l.activity_id && a.kind === l.kind,
                            )?.title || "Aktivitas belum dapat dibuka"}
                          </span>
                          {canManage && (
                            <Button
                              variant="outline"
                              disabled={busy}
                              onClick={() =>
                                void save("goal-link", {
                                  revision: g.revision,
                                  goal_id: g.id,
                                  kind: l.kind,
                                  activity_id: l.activity_id,
                                  linked: false,
                                })
                              }
                            >
                              Lepas tautan
                            </Button>
                          )}
                        </li>
                      ))}
                  </ul>
                </article>
              ))}
              {!state.goals.length && (
                <p className="text-sm">Belum ada tujuan pembelajaran.</p>
              )}
            </div>
          </section>
          {canManage && (
            <section className={panelClass}>
              <h3 className="font-semibold">
                {editing
                  ? "Ubah tujuan pembelajaran"
                  : "Tambah tujuan pembelajaran"}
              </h3>
              <form
                key={editing?.id || `new-${state.goals.length}`}
                className="mt-4 space-y-4"
                onSubmit={(e) => {
                  const f = data(e);
                  void save(
                    "goal-save",
                    {
                      code: String(f.get("code")),
                      title: String(f.get("title")),
                      threshold: Number(f.get("threshold")),
                      revision: editing?.revision || 0,
                      active: editing ? f.get("active") === "on" : true,
                    },
                    editing?.id,
                  );
                }}
              >
                <fieldset disabled={busy} className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Kode TP">
                      <input
                        name="code"
                        className={fieldClass}
                        required
                        maxLength={30}
                        defaultValue={editing?.code}
                      />
                    </Field>
                    <Field label="Batas ketercapaian (%)">
                      <input
                        name="threshold"
                        type="number"
                        min={0}
                        max={100}
                        step="0.01"
                        className={fieldClass}
                        required
                        defaultValue={editing?.threshold ?? 75}
                      />
                    </Field>
                  </div>
                  <Field label="Deskripsi tujuan pembelajaran">
                    <textarea
                      name="title"
                      className={fieldClass}
                      required
                      minLength={2}
                      maxLength={1000}
                      defaultValue={editing?.title}
                    />
                  </Field>
                  {editing && (
                    <label className="flex gap-2 text-sm">
                      <input
                        name="active"
                        type="checkbox"
                        defaultChecked={editing.active}
                      />
                      TP aktif (hapus centang untuk arsip)
                    </label>
                  )}
                  <div className="flex flex-wrap gap-3">
                    <Button type="submit">Simpan TP</Button>
                    {editing && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setEditing(null)}
                      >
                        Batal mengubah
                      </Button>
                    )}
                  </div>
                </fieldset>
              </form>
              {state.goals.some((g) => g.active) && (
                <form
                  className="mt-6 space-y-4 border-t border-stone-200 pt-5"
                  onSubmit={(e) => {
                    const f = data(e),
                      g = state.goals.find((g) => g.id === f.get("goal")),
                      a = state.activities.find(
                        (a) => a.id === f.get("activity"),
                      );
                    if (g && a)
                      void save("goal-link", {
                        revision: g.revision,
                        goal_id: g.id,
                        kind: a.kind,
                        activity_id: a.id,
                        linked: true,
                      });
                  }}
                >
                  <h4 className="font-semibold">Tautkan aktivitas ke TP</h4>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Tujuan pembelajaran">
                      <select name="goal" className={fieldClass} required>
                        {state.goals
                          .filter((g) => g.active)
                          .map((g) => (
                            <option key={g.id} value={g.id}>
                              {g.code} · {g.title}
                            </option>
                          ))}
                      </select>
                    </Field>
                    <Field label="Aktivitas pembelajaran">
                      <select name="activity" className={fieldClass} required>
                        {state.activities.map((a) => (
                          <option key={a.id} value={a.id}>
                            {labels[a.kind]} · {a.title}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                  <Button
                    disabled={busy || !state.activities.length}
                    type="submit"
                  >
                    Tautkan aktivitas
                  </Button>
                </form>
              )}
            </section>
          )}
        </>
      )}
      {state && tab === "achievement" && (
        <section className={panelClass}>
          <h3 className="font-semibold">Laporan ketercapaian</h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Filter tujuan pembelajaran">
              <select
                value={selectedGoal?.id || ""}
                onChange={(e) => setGoalFilter(e.target.value)}
                className={fieldClass}
              >
                <option value="">Pilih TP</option>
                {state.goals
                  .filter((g) => g.active)
                  .map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.code} · {g.title}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Status ketercapaian">
              <select
                className={fieldClass}
                value={mastery}
                onChange={(e) => setMastery(e.target.value)}
              >
                <option value="all">Semua status</option>
                <option value="yes">Tercapai</option>
                <option value="no">Belum tercapai</option>
                <option value="pending">Belum lengkap / belum dibuka</option>
              </select>
            </Field>
          </div>
          <DataTableViewport label="Tabel ketercapaian tujuan pembelajaran">
            <table className="w-full min-w-[780px]">
              <thead>
                <tr>
                  <th scope="col">Siswa</th>
                  <th scope="col">Tugas (%)</th>
                  <th scope="col">Kuis (%)</th>
                  <th scope="col">Nilai akhir</th>
                  <th scope="col">TP (%)</th>
                  <th scope="col">Penilaian TP</th>
                  <th scope="col">Materi selesai</th>
                  <th scope="col">Status TP</th>
                </tr>
              </thead>
              <tbody>
                {state.rows
                  .filter((r) => {
                    const m = r.goals.find(
                      (g) => g.goal_id === selectedGoal?.id,
                    );
                    return (
                      mastery === "all" ||
                      (mastery === "pending"
                        ? m?.mastered == null
                        : mastery === "yes"
                          ? m?.mastered === true
                          : m?.mastered === false)
                    );
                  })
                  .map((r) => {
                    const m = r.goals.find(
                      (g) => g.goal_id === selectedGoal?.id,
                    );
                    return (
                      <tr key={r.id}>
                        <th scope="row">{r.full_name}</th>
                        <td>{num(r.assignment_average)}</td>
                        <td>{num(r.quiz_average)}</td>
                        <td>
                          {num(r.weighted_final)}
                          {state.locked ? " · Final" : ""}
                        </td>
                        <td>{num(m?.score)}</td>
                        <td>{m ? `${m.assessed}/${m.required}` : "—"}</td>
                        <td>{m?.materials_completed ?? "—"}</td>
                        <td>
                          {m?.mastered == null
                            ? "Belum lengkap / belum dibuka"
                            : m.mastered
                              ? "Tercapai"
                              : "Belum tercapai"}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </DataTableViewport>
          {!state.rows.length && (
            <p className="mt-4 text-sm">
              Belum ada siswa aktif yang dapat ditampilkan.
            </p>
          )}
          <p className="mt-3 text-xs leading-5 text-stone-500">
            Persentase memakai nilai efektif setelah tindak lanjut yang sah.
            Siswa dan wali hanya melihat nilai yang sudah dibuka oleh guru.
          </p>
        </section>
      )}
      {state && tab === "followups" && (
        <>
          <section className={panelClass}>
            <h3 className="font-semibold">Remedial & pengayaan</h3>
            <p className="mt-2 text-sm leading-6 text-stone-500">
              Hasil memakai skala 0–100%. Remedial selesai terakhir pada sumber
              nilai yang sama menentukan aturan penggantian; pengayaan tidak
              mengubah nilai. Jika nilai awal atau versi kiriman berubah, hasil
              lama tidak diterapkan otomatis.
            </p>
            <div className="mt-5 space-y-4">
              {state.followups.map((f) => (
                <article
                  key={f.id}
                  className="rounded-xl border border-stone-200 p-4"
                >
                  <h4 className="break-words font-semibold">
                    {f.full_name} · {labels[f.kind]} · {labels[f.status]}
                  </h4>
                  <p className="mt-2 text-sm">
                    {state.activities.find((a) => a.id === f.activity_id)
                      ?.title || "Aktivitas pembelajaran"}{" "}
                    · Batas {f.due_on}
                  </p>
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm">
                    {f.plan}
                  </p>
                  <p className="mt-2 text-xs leading-5 text-stone-500">
                    Aturan: {policyLabels[f.policy]}
                    {f.policy === "capped" ? ` (${num(f.cap)}%)` : ""} · Hasil:{" "}
                    {num(f.result_score)}%
                  </p>
                  {f.note && (
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm">
                      Catatan: {f.note}
                    </p>
                  )}
                  {f.baseline_changed && f.status === "completed" && (
                    <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
                      Nilai awal berubah. Tinjau ulang hasil ini sebelum
                      menerapkannya kembali.
                    </p>
                  )}
                  {canManage && f.status === "planned" && (
                    <form
                      className="mt-4 grid gap-3 sm:grid-cols-2"
                      onSubmit={(e) => {
                        const d = data(e);
                        confirm(
                          "followup-complete",
                          {
                            revision: f.revision,
                            result_score: Number(d.get("score")),
                            note: String(d.get("note")),
                          },
                          "Simpan hasil tindak lanjut?",
                          `Aturan: ${policyLabels[f.policy]}. Laporan dihitung ulang tanpa menghapus nilai awal.`,
                          f.id,
                        );
                      }}
                    >
                      <Field label="Hasil tindak lanjut (%)">
                        <input
                          name="score"
                          type="number"
                          min={0}
                          max={100}
                          step="0.01"
                          required
                          className={fieldClass}
                        />
                      </Field>
                      <Field label="Catatan hasil / bukti penilaian">
                        <textarea
                          name="note"
                          minLength={5}
                          maxLength={3000}
                          required
                          className={fieldClass}
                        />
                      </Field>
                      <Button disabled={busy} type="submit">
                        Tinjau & simpan hasil
                      </Button>
                    </form>
                  )}
                  {canManage && f.status !== "withdrawn" && (
                    <Button
                      variant="outline"
                      className="mt-3"
                      disabled={busy}
                      onClick={() =>
                        confirm(
                          "followup-withdraw",
                          { revision: f.revision },
                          "Tarik tindak lanjut?",
                          "Hasil ini tidak lagi dipakai dalam perhitungan. Catatan dan nilai awal tetap tersimpan. Tuliskan alasan penarikan.",
                          f.id,
                        )
                      }
                    >
                      Tarik dengan alasan
                    </Button>
                  )}
                </article>
              ))}
              {!state.followups.length && (
                <p className="text-sm">
                  Belum ada tindak lanjut pada halaman peserta ini.
                </p>
              )}
            </div>
          </section>
          {canManage && (
            <FollowupForm
              key={state.followups.length}
              state={state}
              busy={busy}
              onSave={(d) => void save("followup-create", d)}
            />
          )}
        </>
      )}
      {state && tab === "history" && (
        <>
          <section className={panelClass}>
            <h3 className="font-semibold">Finalisasi nilai</h3>
            <p className="mt-2 text-sm leading-6 text-stone-500">
              Penguncian menyimpan snapshot seluruh peserta aktif, bukan hanya
              halaman ini. Hanya admin/kepala madrasah dapat membuka kembali
              dengan alasan. Semester arsip perlu dibuka dahulu melalui pusat
              akademik.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              {canManage && (
                <Button
                  disabled={busy}
                  onClick={() =>
                    confirm(
                      "lock",
                      { revision: state.revision },
                      "Kunci nilai final?",
                      "Pastikan seluruh nilai dan bobot lengkap serta tidak ada kuis berlangsung. Pengumpulan dan perubahan komponen nilai akan dibekukan.",
                    )
                  }
                >
                  Kunci nilai final
                </Button>
              )}
              {state.locked && state.can_unlock && (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    confirm(
                      "unlock",
                      { revision: state.revision },
                      "Buka kembali nilai final?",
                      "Snapshot lama tetap tersimpan. Setelah koreksi, pengampu perlu melakukan finalisasi lagi.",
                    )
                  }
                >
                  Buka kembali dengan alasan
                </Button>
              )}
            </div>
            <ol className="mt-4 space-y-3">
              {state.finalizations.map((f) => (
                <li key={f.id} className="rounded-xl bg-stone-50 p-3 text-sm">
                  <p>{dateLabel(f.created_at)}</p>
                  <p className="mt-1 break-words">{f.reason}</p>
                </li>
              ))}
            </ol>
          </section>
          <section className={panelClass}>
            <h3 className="font-semibold">Riwayat penilaian</h3>
            <p className="mt-2 text-xs leading-5 text-stone-500">
              Skor memakai satuan asli tugas/butir esai. Nilai sebelum pembaruan
              ditandai sebagai snapshot awal; koreksi berikutnya mencatat nilai
              sebelum/sesudah dan alasan.
            </p>
            <Field label="Filter siswa pada riwayat">
              <select
                className={fieldClass}
                value={historyStudent}
                onChange={(e) => {
                  setHistoryStudent(e.target.value);
                  setHistoryOffset(0);
                }}
              >
                <option value="">Semua siswa yang diizinkan</option>
                {state.rows.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.full_name}
                  </option>
                ))}
              </select>
            </Field>
            <DataTableViewport label="Tabel riwayat koreksi nilai">
              <table className="w-full min-w-[760px]">
                <thead>
                  <tr>
                    <th scope="col">Siswa</th>
                    <th scope="col">Aktivitas</th>
                    <th scope="col">Sebelum</th>
                    <th scope="col">Sesudah</th>
                    <th scope="col">Alasan</th>
                    <th scope="col">Waktu</th>
                  </tr>
                </thead>
                <tbody>
                  {history.slice(0, 25).map((h) => (
                    <tr key={h.id}>
                      <th scope="row">{h.full_name}</th>
                      <td>
                        {h.title}
                        {h.position ? ` · Esai ${h.position}` : ""}
                      </td>
                      <td>{num(h.old_score)}</td>
                      <td>{num(h.new_score)}</td>
                      <td>{h.reason || "Penilaian pertama"}</td>
                      <td>{dateLabel(h.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DataTableViewport>
            {history.length === 0 && (
              <p className="mt-4 text-sm">
                Belum ada riwayat yang dapat ditampilkan.
              </p>
            )}
            <div className="mt-4 flex flex-wrap gap-3">
              <Button
                variant="outline"
                disabled={busy || historyOffset === 0}
                onClick={() => setHistoryOffset((v) => Math.max(0, v - 25))}
              >
                Riwayat sebelumnya
              </Button>
              <Button
                variant="outline"
                disabled={busy || history.length <= 25}
                onClick={() => setHistoryOffset((v) => v + 25)}
              >
                Riwayat berikutnya
              </Button>
            </div>
          </section>
        </>
      )}
      {state && (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            disabled={busy || loading || offset === 0}
            onClick={() => setOffset((v) => Math.max(0, v - 100))}
          >
            Peserta sebelumnya
          </Button>
          <span className="text-sm">Halaman peserta {offset / 100 + 1}</span>
          <Button
            variant="outline"
            disabled={busy || loading || !state.has_more}
            onClick={() => setOffset((v) => v + 100)}
          >
            Peserta berikutnya
          </Button>
        </div>
      )}
      <ConfirmDialog
        open={!!pending}
        title={pending?.title || "Konfirmasi perubahan"}
        description={pending?.description || ""}
        confirmLabel="Ya, lanjutkan"
        busy={busy}
        error={error || undefined}
        onCancel={() => {
          setPending(null);
          setReason("");
          setError("");
        }}
        onConfirm={() => {
          if (pending)
            void save(
              pending.action,
              {
                ...pending.data,
                ...(["lock", "unlock"].includes(pending.action)
                  ? { reason }
                  : pending.action === "followup-withdraw"
                    ? { note: reason }
                    : {}),
              },
              pending.target,
            );
        }}
      >
        {pending &&
          ["lock", "unlock", "followup-withdraw"].includes(pending.action) && (
            <Field label="Alasan (minimal 5 karakter)">
              <textarea
                minLength={5}
                maxLength={1000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className={fieldClass}
                disabled={busy}
              />
            </Field>
          )}
      </ConfirmDialog>
    </div>
  );
}
function FollowupForm({
  state,
  busy,
  onSave,
}: {
  state: FlowState;
  busy: boolean;
  onSave: (d: Record<string, unknown>) => void;
}) {
  const [kind, setKind] = useState("remedial"),
    [policy, setPolicy] = useState("highest");
  return (
    <section className={panelClass}>
      <h3 className="font-semibold">Rencanakan tindak lanjut</h3>
      <form
        className="mt-4 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget),
            a = state.activities.find((a) => a.id === f.get("activity"));
          if (a)
            onSave({
              student_id: String(f.get("student")),
              kind,
              activity_kind: a.kind,
              activity_id: a.id,
              plan: String(f.get("plan")),
              due_on: String(f.get("due_on")),
              policy: kind === "enrichment" ? "preserve" : policy,
              cap: Number(f.get("cap") || 75),
            });
        }}
      >
        <fieldset disabled={busy} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Siswa tindak lanjut">
              <select name="student" required className={fieldClass}>
                {state.rows.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.full_name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Aktivitas bernilai awal">
              <select name="activity" required className={fieldClass}>
                {state.activities
                  .filter((a) => a.kind !== "material")
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {labels[a.kind]} · {a.title}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Jenis tindak lanjut">
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value)}
                className={fieldClass}
              >
                <option value="remedial">Remedial</option>
                <option value="enrichment">Pengayaan</option>
              </select>
            </Field>
            <Field label="Batas penyelesaian">
              <input
                type="date"
                name="due_on"
                required
                className={fieldClass}
              />
            </Field>
            <Field label="Aturan nilai">
              <select
                value={kind === "enrichment" ? "preserve" : policy}
                disabled={kind === "enrichment"}
                onChange={(e) => setPolicy(e.target.value)}
                className={fieldClass}
              >
                {Object.entries(policyLabels).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
            {kind === "remedial" && policy === "capped" && (
              <Field label="Batas nilai remedial (%)">
                <input
                  name="cap"
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  defaultValue={75}
                  required
                  className={fieldClass}
                />
              </Field>
            )}
          </div>
          <Field label="Rencana kegiatan dan kriteria penilaian">
            <textarea
              name="plan"
              required
              minLength={5}
              maxLength={3000}
              className={fieldClass}
            />
          </Field>
          <p className="text-xs leading-5 text-stone-500">
            Pilih peserta/aktivitas berdasarkan laporan ketercapaian. Nilai awal
            wajib tersedia; hasil hanya dicatat pengampu/admin.
          </p>
          <Button type="submit" disabled={busy || !state.rows.length}>
            Simpan rencana tindak lanjut
          </Button>
        </fieldset>
      </form>
    </section>
  );
}
