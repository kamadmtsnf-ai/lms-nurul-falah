"use client";
import { DataTableViewport } from "./data-table-viewport";
import { useEffect, useRef, useState } from "react";
import { SubmissionPacket } from "@/lib/learning/submission-packet";
import { Button } from "./ui/button";
import { fieldClass, panelClass, Notice, Uploader } from "./learning-shared";
import { QuestionEditor, blankQuestion } from "./question-editor";
import { advancedRequest, type Features } from "@/lib/advanced/client";
import type { Question, Report } from "@/lib/quiz/types";
import type { CourseState } from "@/lib/learning/types";
import { learningRequest } from "@/lib/learning/types";
export function AdvancedPanel({ state }: { state: CourseState }) {
  const course = state.course.id;
  const [features, setFeatures] = useState<Features | null>(null),
    [tab, setTab] = useState("materials"),
    [message, setMessage] = useState(""),
    [error, setError] = useState(false),
    [busy, setBusy] = useState(false);
  async function load() {
    setFeatures(await advancedRequest<Features>("features", { course }));
  }
  useEffect(() => {
    let active = true;
    advancedRequest<Features>("features", { course })
      .then((f) => {
        if (active) setFeatures(f);
      })
      .catch((e) => {
        if (active) setMessage(e.message);
      });
    return () => {
      active = false;
    };
  }, [course]);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await fn();
      await load();
      setError(false);
      setMessage("Perubahan berhasil disimpan.");
    } catch (e) {
      setError(true);
      setMessage(e instanceof Error ? e.message : "Permintaan gagal.");
    } finally {
      setBusy(false);
    }
  }
  const save = (cmd: string, p: Record<string, unknown>) =>
    run(async () => {
      await advancedRequest(cmd, { course, ...p });
    });
  if (!features)
    return (
      <>
        <Notice message={message} error />
        <p>Memuat fitur lanjutan…</p>
      </>
    );
  const manager = features.context.manager && features.context.writable;
  const tabs = [
    ["materials", "Materi & diskusi"],
    ["assignments", "Tugas lanjutan"],
    ["weights", "Nilai akhir berbobot"],
    ...(manager
      ? [
          ["bank", "Bank soal"],
          ["messages", "Notifikasi kegiatan"],
        ]
      : []),
  ];
  return (
    <div className="space-y-5">
      <nav
        aria-label="Fitur lanjutan"
        className="grid grid-cols-2 gap-2 rounded-2xl border border-stone-200 bg-stone-50 p-2 sm:flex sm:flex-wrap"
      >
        {tabs.map(([k, l]) => (
          <Button
            variant={tab === k ? "default" : "outline"}
            key={k}
            aria-pressed={tab === k}
            className="min-w-0 px-3 py-3 text-xs leading-5 sm:text-sm"
            onClick={() => setTab(k)}
          >
            {l}
          </Button>
        ))}
      </nav>
      <Notice message={message} error={error} />
      {tab === "materials" && (
        <>
          <p className="text-sm text-stone-600">
            Prasyarat aktif setelah guru mengaturnya. Selesaikan materi
            pendahulu sebelum membuka materi berikutnya.
          </p>
          {features.materials.map((m) => (
            <section key={m.id} className={panelClass}>
              <h2 className="text-lg font-semibold">{m.title}</h2>
              <p className="mt-2 text-sm">
                {m.accessible
                  ? "Dapat dibuka"
                  : "Terkunci: selesaikan prasyarat"}{" "}
                · {m.completed ? "Selesai" : "Belum ditandai selesai"}
              </p>
              {features.context.student_writable &&
                m.accessible &&
                !m.completed && (
                  <Button
                    className="mt-4"
                    disabled={busy}
                    onClick={() => void save("complete", { target: m.id })}
                  >
                    Tandai selesai
                  </Button>
                )}
              {manager && (
                <>
                  <form
                    method="post"
                    key={`${m.prerequisite_id}:${m.enabled}`}
                    className="mt-4 space-y-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const d = new FormData(e.currentTarget);
                      void save("material-rule", {
                        target: m.id,
                        data: {
                          enabled: d.get("enabled") === "on",
                          prerequisite_id: d.get("prerequisite") || null,
                        },
                      });
                    }}
                  >
                    <label className="text-sm">
                      <input
                        type="checkbox"
                        name="enabled"
                        defaultChecked={m.enabled}
                      />{" "}
                      Aktifkan prasyarat
                    </label>
                    <label className="block text-sm">
                      Materi pendahulu
                      <select
                        className={fieldClass}
                        name="prerequisite"
                        defaultValue={m.prerequisite_id ?? ""}
                      >
                        <option value="">Tanpa prasyarat</option>
                        {features.materials
                          .filter((x) => x.id !== m.id)
                          .map((x) => (
                            <option key={x.id} value={x.id}>
                              {x.title}
                            </option>
                          ))}
                      </select>
                    </label>
                    <Button disabled={busy} type="submit" variant="outline">
                      Simpan prasyarat
                    </Button>
                  </form>
                  <ShareMaterial
                    course={course}
                    target={m.id}
                    busy={busy}
                    save={save}
                  />
                  <p className="mt-4 text-xs text-stone-500">
                    Selesai:{" "}
                    {features.progress
                      .filter((p) => p.material_id === m.id)
                      .map((p) => p.full_name)
                      .join(", ") || "Belum ada"}
                  </p>
                </>
              )}
              {m.accessible && (
                <Discussion
                  key={m.id}
                  course={course}
                  material={m.id}
                  manager={manager}
                  canPost={manager || features.context.student_writable}
                />
              )}
            </section>
          ))}
        </>
      )}
      {tab === "assignments" && (
        <div className="space-y-5">
          {state.assignments.map((a) => {
            const rule = features.rules.find((r) => r.assignment_id === a.id);
            return (
              <section key={a.id} className={panelClass}>
                <h2 className="text-lg font-semibold">{a.title}</h2>
                <p className="mt-2 text-sm">
                  Maksimal {rule?.revision_limit ?? 20} kiriman ·{" "}
                  {rule?.late_minutes
                    ? `Toleransi ${rule.late_minutes} menit`
                    : "Ikuti izin keterlambatan pada tugas"}{" "}
                  · {rule?.group_mode ? "Kelompok" : "Individu"}
                </p>
                {rule?.rubric.map((r, i) => (
                  <p className="mt-1 text-sm" key={i}>
                    {r.label}: {r.points} poin
                  </p>
                ))}
                {manager && rule && rule.rubric.length > 0 && (
                  <RubricGrader
                    state={state}
                    assignment={a.id}
                    rubric={rule.rubric}
                  />
                )}
                {manager && (
                  <>
                    <form
                      method="post"
                      className="mt-4 space-y-3"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const d = new FormData(e.currentTarget);
                        const rubric = String(d.get("rubric"))
                          .split("\n")
                          .filter((x) => x.trim())
                          .map((x) => {
                            const i = x.lastIndexOf("|");
                            return {
                              label: x.slice(0, i).trim(),
                              points: Number(x.slice(i + 1)),
                            };
                          });
                        void save("assignment-rule", {
                          target: a.id,
                          data: {
                            revision_limit: Number(d.get("revision_limit")),
                            late_minutes: Number(d.get("late_minutes")),
                            group_mode: d.get("group_mode") === "on",
                            rubric,
                          },
                        });
                      }}
                    >
                      <label className="block text-sm">
                        Maksimal jumlah kiriman (termasuk kiriman pertama)
                        <input
                          className={fieldClass}
                          name="revision_limit"
                          type="number"
                          required
                          min={1}
                          max={100}
                          defaultValue={rule?.revision_limit ?? 20}
                        />
                      </label>
                      <label className="block text-sm">
                        Toleransi setelah tenggat (menit; 0 mengikuti izin tugas
                        tanpa batas tambahan)
                        <input
                          className={fieldClass}
                          name="late_minutes"
                          type="number"
                          required
                          min={0}
                          max={43200}
                          defaultValue={rule?.late_minutes ?? 0}
                        />
                      </label>
                      <label className="text-sm">
                        <input
                          name="group_mode"
                          type="checkbox"
                          defaultChecked={rule?.group_mode}
                        />{" "}
                        Tugas kelompok
                      </label>
                      <label className="block text-sm">
                        Rubrik: kriteria | poin, satu per baris; total{" "}
                        {a.max_score}
                        <textarea
                          className={fieldClass}
                          name="rubric"
                          defaultValue={rule?.rubric
                            .map((r) => `${r.label} | ${r.points}`)
                            .join("\n")}
                        />
                      </label>
                      <Button disabled={busy} type="submit">
                        Simpan aturan tugas
                      </Button>
                    </form>
                    {rule?.group_mode && (
                      <form
                        method="post"
                        className="mt-5 space-y-3 border-t pt-5"
                        onSubmit={(e) => {
                          e.preventDefault();
                          const d = new FormData(e.currentTarget);
                          void save("group-save", {
                            data: {
                              assignment_id: a.id,
                              name: String(d.get("name")),
                              members: d.getAll("members"),
                            },
                          });
                        }}
                      >
                        <label className="block text-sm">
                          Nama kelompok
                          <input
                            required
                            className={fieldClass}
                            name="name"
                            maxLength={100}
                          />
                        </label>
                        <fieldset>
                          <legend className="text-sm">
                            Anggota (satu kelompok per tugas)
                          </legend>
                          <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            {state.roster.map((s) => (
                              <label className="text-sm" key={s.id}>
                                <input
                                  type="checkbox"
                                  name="members"
                                  value={s.id}
                                />{" "}
                                {s.full_name}
                              </label>
                            ))}
                          </div>
                        </fieldset>
                        <Button disabled={busy} type="submit" variant="outline">
                          Tambah kelompok
                        </Button>
                      </form>
                    )}
                  </>
                )}
                {features.groups
                  .filter((g) => g.assignment_id === a.id)
                  .map((g) => (
                    <div key={g.id} className="mt-5 rounded-xl border p-4">
                      <h3 className="font-semibold">{g.name}</h3>
                      <p className="mt-2 text-sm">
                        {g.members.map((m) => m.full_name).join(", ")} · Kiriman{" "}
                        {g.revision}
                      </p>
                      {manager && g.revision === 0 && (
                        <GroupEditor
                          group={g}
                          roster={state.roster}
                          busy={busy}
                          save={save}
                        />
                      )}
                      {features.context.student_writable &&
                        g.members.some((m) => m.id === features.actor) && (
                          <GroupSubmission
                            course={course}
                            assignment={a.id}
                            formats={a.formats}
                            group={g}
                            state={state}
                            busy={busy}
                            save={save}
                          />
                        )}
                    </div>
                  ))}
              </section>
            );
          })}
        </div>
      )}
      {tab === "weights" && <WeightedPanel course={course} manager={manager} />}{" "}
      {tab === "bank" && manager && <BankPanel course={course} />}{" "}
      {tab === "messages" && manager && <ActivityMessages course={course} />}
    </div>
  );
}
function ShareMaterial({
  course,
  target,
  busy,
  save,
}: {
  course: string;
  target: string;
  busy: boolean;
  save: (cmd: string, p: Record<string, unknown>) => Promise<void>;
}) {
  const [courses, setCourses] = useState<
    { id: string; subject: string; classroom: string }[]
  >([]);
  return (
    <form
      method="post"
      className="mt-4 space-y-3 border-t pt-4"
      onSubmit={(e) => {
        e.preventDefault();
        const d = new FormData(e.currentTarget);
        void save("material-share", {
          target,
          data: { destination_course: String(d.get("destination")) },
        });
      }}
    >
      <button
        type="button"
        className="text-sm text-emerald-800 underline"
        onClick={() =>
          void learningRequest("catalog", {})
            .then((d) => setCourses(d.result))
            .catch(() => setCourses([]))
        }
      >
        Pilih kelas tujuan berbagi
      </button>
      <label className="block text-sm">
        Tujuan (hanya setingkat, satu semester dan Anda kelola)
        <select required name="destination" className={fieldClass}>
          <option value="">Pilih kelas</option>
          {courses
            .filter((c) => c.id !== course)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.classroom} · {c.subject}
              </option>
            ))}
        </select>
      </label>
      <p className="text-xs text-stone-500">
        Salinan berupa draf materi dan lampiran privat. Periksa draf tujuan
        sebelum diterbitkan.
      </p>
      <Button disabled={busy} type="submit" variant="outline">
        Salin sebagai draf
      </Button>
    </form>
  );
}
function Discussion({
  course,
  material,
  manager,
  canPost,
}: {
  course: string;
  material: string;
  manager: boolean;
  canPost: boolean;
}) {
  type Post = {
    id: string;
    full_name: string;
    body: string;
    hidden: boolean;
    created_at: string;
  };
  const [posts, setPosts] = useState<Post[]>([]),
    [offset, setOffset] = useState(0),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function load(page = offset) {
    setBusy(true);
    try {
      setPosts(
        await advancedRequest<Post[]>("discussion-list", {
          course,
          target: material,
          offset: page,
        }),
      );
      setOffset(page);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-5 border-t pt-4">
      <Button
        variant="outline"
        disabled={busy}
        onClick={() => void load().catch((e) => setMessage(e.message))}
      >
        Buka diskusi
      </Button>
      <Notice message={message} />
      {posts.map((p) => (
        <article className="mt-3 rounded-xl bg-stone-50 p-4" key={p.id}>
          <p className="text-xs font-semibold">
            {p.full_name} · {new Date(p.created_at).toLocaleString("id-ID")}
            {p.hidden ? " · Disembunyikan" : ""}
          </p>
          <p className="mt-2 whitespace-pre-wrap text-sm">{p.body}</p>
          {manager && (
            <button
              disabled={busy}
              className="mt-2 text-xs text-emerald-800 underline"
              onClick={() =>
                void advancedRequest("discussion-hide", {
                  course,
                  target: p.id,
                  data: { hidden: !p.hidden },
                })
                  .then(() => load())
                  .catch((e) => setMessage(e.message))
              }
            >
              {p.hidden ? "Tampilkan" : "Sembunyikan"}
            </button>
          )}
        </article>
      ))}
      <div className="mt-3 flex gap-3">
        <Button
          variant="outline"
          disabled={busy || !offset}
          onClick={() =>
            void load(Math.max(0, offset - 50)).catch((e) =>
              setMessage(e.message),
            )
          }
        >
          Sebelumnya
        </Button>
        <Button
          variant="outline"
          disabled={busy || posts.length < 50}
          onClick={() =>
            void load(offset + 50).catch((e) => setMessage(e.message))
          }
        >
          Berikutnya
        </Button>
      </div>
      {canPost && (
        <form
          method="post"
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget,
              d = new FormData(form);
            setBusy(true);
            void advancedRequest("discussion-post", {
              course,
              target: material,
              data: { body: String(d.get("body")) },
            })
              .then(async () => {
                form.reset();
                await load(0);
              })
              .catch((e) => setMessage(e.message))
              .finally(() => setBusy(false));
          }}
        >
          <label className="block text-sm">
            Tanggapan
            <textarea
              name="body"
              required
              maxLength={3000}
              className={fieldClass}
            />
          </label>
          <Button type="submit" disabled={busy}>
            Kirim tanggapan
          </Button>
        </form>
      )}
    </div>
  );
}
function GroupSubmission({
  course,
  assignment,
  formats,
  group,
  state,
  busy,
  save,
}: {
  course: string;
  assignment: string;
  formats: string[];
  group: Features["groups"][number];
  state: CourseState;
  busy: boolean;
  save: (cmd: string, p: Record<string, unknown>) => Promise<void>;
}) {
  const packet = useRef(new SubmissionPacket());
  const [files, setFiles] = useState(
    state.assets.filter(
      (a) =>
        a.status === "ready" &&
        a.target_type === "submission" &&
        a.target_id === assignment &&
        a.owner_id === state.context.actor,
    ),
  );
  return (
    <form
      method="post"
      className="mt-4 space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const d = new FormData(e.currentTarget);
        void save("group-submit", {
          target: group.id,
          data: packet.current.for({
            revision: group.revision,
            body: String(d.get("body") ?? ""),
            links: String(d.get("links") ?? "")
              .split("\n")
              .map((x) => x.trim())
              .filter(Boolean),
            asset_ids: d.getAll("assets").map(String),
          }),
        });
      }}
    >
      {formats.includes("text") && (
        <label className="block text-sm">
          Jawaban kelompok
          <textarea
            name="body"
            disabled={busy}
            maxLength={30000}
            className={fieldClass}
          />
        </label>
      )}
      {formats.includes("link") && (
        <label className="block text-sm">
          Tautan HTTPS (satu per baris)
          <textarea name="links" disabled={busy} className={fieldClass} />
        </label>
      )}
      {formats.includes("file") && (
        <>
          <Uploader
            course={course}
            target={assignment}
            type="submission"
            onDone={async () => {
              const r = await learningRequest("course", { course });
              setFiles(
                r.result.assets.filter(
                  (a: CourseState["assets"][number]) =>
                    a.status === "ready" &&
                    a.target_type === "submission" &&
                    a.target_id === assignment &&
                    a.owner_id === state.context.actor,
                ),
              );
            }}
          />
          {files.map((a) => (
            <label className="block text-sm" key={a.id}>
              <input type="checkbox" name="assets" value={a.id} /> {a.name}
            </label>
          ))}
        </>
      )}
      <p className="text-xs text-stone-500">
        Satu kiriman berlaku untuk semua anggota. Nilai guru berlaku sama pada
        kiriman kelompok tersebut.
      </p>
      <Button type="submit" disabled={busy}>
        Kumpulkan untuk kelompok
      </Button>
    </form>
  );
}
export type WeightedReport = Omit<Report, "rows"> & {
  weights: {
    assignment_weight: number;
    quiz_weight: number;
    visible: boolean;
  } | null;
  rows: (Report["rows"][number] & { weighted_final: number | null })[];
};
export function WeightedPanel({
  course,
  manager,
  student,
  page,
  onPageChange,
}: {
  course: string;
  manager: boolean;
  student?: string;
  page?: number;
  onPageChange?: (page: number) => void;
}) {
  const [report, setReport] = useState<WeightedReport | null>(null),
    [tab, setTab] = useState("components"),
    [localOffset, setLocalOffset] = useState(0),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const offset = page ?? localOffset;
  const setOffset = (update: (value: number) => number) => {
    const next = update(offset);
    if (onPageChange) onPageChange(next);
    else setLocalOffset(next);
  };
  useEffect(() => {
    let active = true;
    setReport(null);
    setMessage("");
    advancedRequest<WeightedReport>("weighted-report", { course, offset })
      .then((r) => {
        if (active) setReport(r);
      })
      .catch((e) => {
        if (active) setMessage(e.message);
      });
    return () => {
      active = false;
    };
  }, [course, offset]);
  return (
    <section className={panelClass}>
      <h2 className="text-lg font-semibold">Rekap nilai</h2>
      {!report && !message && (
        <p role="status" className="mt-4 text-sm text-stone-500">
          Memuat rekap nilai…
        </p>
      )}
      <Notice message={message} />
      <nav className="mt-4 flex flex-wrap gap-2" aria-label="Jenis nilai">
        <Button
          variant={tab === "components" ? "default" : "outline"}
          onClick={() => setTab("components")}
        >
          Nilai Tugas & Kuis
        </Button>
        <Button
          variant={tab === "final" ? "default" : "outline"}
          onClick={() => setTab("final")}
        >
          Nilai Akhir Berbobot
        </Button>
      </nav>
      <p className="mt-4 text-sm text-stone-500">
        Nilai akhir memakai rata-rata tugas dan nilai terbaik per kuis. Komponen
        berbobot yang belum dinilai atau belum dibuka tetap kosong.
      </p>
      {manager && (
        <form
          method="post"
          key={JSON.stringify(report?.weights)}
          className="mt-5 grid gap-3 sm:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            const d = new FormData(e.currentTarget);
            setBusy(true);
            void advancedRequest("weights", {
              course,
              data: {
                assignment_weight: Number(d.get("assignment")),
                quiz_weight: Number(d.get("quiz")),
                visible: d.get("visible") === "on",
              },
            })
              .then(async () =>
                setReport(
                  await advancedRequest("weighted-report", { course, offset }),
                ),
              )
              .catch((e) => setMessage(e.message))
              .finally(() => setBusy(false));
          }}
        >
          <label className="text-sm">
            Bobot tugas (%)
            <input
              name="assignment"
              className={fieldClass}
              type="number"
              min={0}
              max={100}
              required
              defaultValue={report?.weights?.assignment_weight ?? 50}
            />
          </label>
          <label className="text-sm">
            Bobot kuis (%)
            <input
              name="quiz"
              className={fieldClass}
              type="number"
              min={0}
              max={100}
              required
              defaultValue={report?.weights?.quiz_weight ?? 50}
            />
          </label>
          <label className="mt-6 text-sm">
            <input
              name="visible"
              type="checkbox"
              defaultChecked={report?.weights?.visible}
            />{" "}
            Buka nilai akhir
          </label>
          <Button disabled={busy} type="submit">
            Simpan bobot & akses
          </Button>
        </form>
      )}
      {report && (
        <>
          <div className="mt-4 flex flex-wrap gap-4">
            <a
              className="text-sm text-emerald-800 underline"
              href={`/api/laporan/${course}?format=xlsx&weighted=1`}
            >
              Ekspor Excel
            </a>
            <a
              className="text-sm text-emerald-800 underline"
              href={`/api/laporan/${course}?format=pdf&weighted=1`}
            >
              Ekspor PDF
            </a>
          </div>
          <p className="mt-4 text-sm">
            {report.weights
              ? `Bobot tugas ${report.weights.assignment_weight}% · kuis ${report.weights.quiz_weight}%`
              : "Bobot belum ditetapkan."}
          </p>
          <DataTableViewport label="Tabel nilai berbobot">
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  <th className="p-3">Siswa</th>
                  {tab === "components" ? (
                    <>
                      <th className="p-3">Tugas</th>
                      <th className="p-3">Kuis</th>
                    </>
                  ) : (
                    <th className="p-3">Nilai akhir</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {report.rows
                  .filter((r) => !student || r.id === student)
                  .map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="p-3">{r.full_name}</td>
                      {tab === "components" ? (
                        <>
                          <td className="p-3">{r.assignment_average ?? "—"}</td>
                          <td className="p-3">{r.quiz_average ?? "—"}</td>
                        </>
                      ) : (
                        <td className="p-3">
                          {r.weighted_final ?? "Belum lengkap / belum dibuka"}
                        </td>
                      )}
                    </tr>
                  ))}
              </tbody>
            </table>
          </DataTableViewport>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button
              variant="outline"
              disabled={!offset}
              onClick={() => setOffset((x) => Math.max(0, x - 100))}
            >
              Sebelumnya
            </Button>
            <Button
              variant="outline"
              disabled={!report.has_more}
              onClick={() => setOffset((x) => x + 100)}
            >
              Berikutnya
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
export function BankPanel({ course }: { course: string }) {
  const [bank, setBank] = useState<{ id: string; question: Question }[]>([]),
    [question, setQuestion] = useState<Question>(blankQuestion),
    [preview, setPreview] = useState<Question[]>([]),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [offset, setOffset] = useState(0);
  async function load(page = offset) {
    setBusy(true);
    try {
      setBank(await advancedRequest("bank-list", { course, offset: page }));
      setOffset(page);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load(0).catch((e) => setMessage(e.message));
  }, [course]);
  async function save(questions: Question[]) {
    setBusy(true);
    try {
      await advancedRequest("bank-save", { course, data: { questions } });
      setPreview([]);
      setQuestion(blankQuestion());
      await load(0);
      setMessage(
        "Soal tersimpan di bank. Tambahkan ke kuis melalui editor kuis.",
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Gagal menyimpan.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-5">
      <Notice message={message} />
      <section className={panelClass}>
        <h2 className="text-lg font-semibold">Tambah soal ke bank</h2>
        <form
          method="post"
          className="mt-4 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save([question]);
          }}
        >
          <fieldset disabled={busy}>
            <QuestionEditor q={question} index={0} onChange={setQuestion} />
          </fieldset>
          <Button type="submit" disabled={busy}>
            Simpan ke bank
          </Button>
        </form>
      </section>
      <section className={panelClass}>
        <h2 className="text-lg font-semibold">Impor soal Excel</h2>
        <a
          className="mt-3 inline-block text-sm text-emerald-800 underline"
          href={`/api/lanjutan/bank-template?course=${course}`}
        >
          Unduh template Excel
        </a>
        <label className="mt-4 block text-sm">
          Pilih .xlsx (maksimal 2 MB; 100 soal)
          <input
            className={fieldClass}
            type="file"
            accept=".xlsx"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              setPreview([]);
              setMessage("");
              if (!file) return;
              if (file.size > 2000000) {
                setMessage("Berkas maksimal 2 MB.");
                return;
              }
              setBusy(true);
              const reader = new FileReader();
              reader.onload = () => {
                void advancedRequest<{ questions: Question[] }>("bank-import", {
                  course,
                  data: { file: String(reader.result).split(",")[1] },
                })
                  .then((r) => {
                    setPreview(r.questions);
                    setMessage("Periksa pratinjau sebelum menyimpan.");
                  })
                  .catch((e) => setMessage(e.message))
                  .finally(() => setBusy(false));
              };
              reader.onerror = () => {
                setBusy(false);
                setMessage("Berkas belum dapat dibaca.");
              };
              reader.readAsDataURL(file);
            }}
          />
        </label>
        {preview.length > 0 && (
          <div className="mt-4">
            <p>{preview.length} soal siap diperiksa:</p>
            <ol className="my-3 list-inside list-decimal text-sm">
              {preview.map((q, i) => (
                <li key={i}>
                  {q.prompt} · {q.kind} · {q.points} poin
                </li>
              ))}
            </ol>
            <Button disabled={busy} onClick={() => void save(preview)}>
              Konfirmasi simpan {preview.length} soal
            </Button>
          </div>
        )}
      </section>
      <section className={panelClass}>
        <h2 className="text-lg font-semibold">Daftar bank soal</h2>
        {bank.map((b) => (
          <article className="mt-3 border-t pt-3" key={b.id}>
            <p className="text-sm">
              {b.question.prompt} · {b.question.kind} · {b.question.points} poin
            </p>
            <button
              className="mt-2 text-sm text-red-800 underline"
              disabled={busy}
              onClick={() => {
                if (
                  window.confirm(
                    "Hapus dari bank? Snapshot kuis yang sudah dibuat tetap tersedia.",
                  )
                )
                  void advancedRequest("bank-delete", { course, target: b.id })
                    .then(() => load())
                    .catch((e) => setMessage(e.message));
              }}
            >
              Hapus dari bank
            </button>
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
            disabled={busy || bank.length < 100}
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
function ActivityMessages({ course }: { course: string }) {
  type Status = {
    id: string;
    subject: string;
    recipients: number;
    sent: number;
    pending: number;
    failed: number;
  };
  const [rows, setRows] = useState<Status[]>([]),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    setRows(await advancedRequest("message-status", { course }));
  }
  useEffect(() => {
    void load().catch((e) => setMessage(e.message));
  }, [course]);
  return (
    <section className={panelClass}>
      <h2 className="text-lg font-semibold">Notifikasi kegiatan</h2>
      <Notice message={message} />
      <form
        method="post"
        className="mt-4 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget,
            d = new FormData(form);
          setBusy(true);
          void advancedRequest("message-create", {
            course,
            data: {
              subject: String(d.get("subject")),
              body: String(d.get("body")),
              email: d.get("email") === "on",
            },
          })
            .then(async () => {
              form.reset();
              await load();
              setMessage(
                "Notifikasi aplikasi dibuat. Email yang dipilih masuk antrean, belum dikirim.",
              );
            })
            .catch((e) => setMessage(e.message))
            .finally(() => setBusy(false));
        }}
      >
        <label className="block text-sm">
          Judul
          <input
            name="subject"
            className={fieldClass}
            minLength={2}
            maxLength={150}
            required
          />
        </label>
        <label className="block text-sm">
          Pesan
          <textarea
            name="body"
            className={fieldClass}
            maxLength={3000}
            required
          />
        </label>
        <label className="text-sm">
          <input name="email" type="checkbox" /> Antrekan email untuk siswa
          dengan email terverifikasi
        </label>
        <Button type="submit" disabled={busy}>
          Buat notifikasi
        </Button>
      </form>
      <p className="mt-4 text-xs text-stone-500">
        Email diproses manual per batch agar sesuai kuota. Status tidak pasti
        diperiksa operator; tidak dikirim ulang otomatis untuk menghindari
        duplikasi.
      </p>
      {rows.map((r) => (
        <article className="mt-4 border-t pt-4" key={r.id}>
          <h3 className="font-semibold">{r.subject}</h3>
          <p className="mt-2 text-sm">
            {r.recipients} penerima · terkirim {r.sent} · menunggu {r.pending} ·
            gagal/tidak pasti {r.failed}
          </p>
          <Button
            className="mt-3"
            variant="outline"
            disabled={busy || !r.pending}
            onClick={() => {
              if (
                !window.confirm(
                  "Kirim email kegiatan ini ke maksimal 3 penerima berikutnya?",
                )
              )
                return;
              setBusy(true);
              void advancedRequest<{ sent: number; uncertain: number }>(
                "message-send",
                { course, target: r.id },
              )
                .then(async (r) => {
                  setMessage(`Terkirim ${r.sent}; tidak pasti ${r.uncertain}.`);
                  await load();
                })
                .catch((e) => setMessage(e.message))
                .finally(() => setBusy(false));
            }}
          >
            Kirim batch email
          </Button>
        </article>
      ))}
    </section>
  );
}

function RubricGrader({
  state,
  assignment,
  rubric,
}: {
  state: CourseState;
  assignment: string;
  rubric: { label: string; points: number }[];
}) {
  const [selected, setSelected] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const submissions = state.submissions.filter(
    (s) => s.assignment_id === assignment,
  );
  const submission =
    submissions.find((s) => s.id === selected) ?? submissions[0];
  const [version, setVersion] = useState<
    { updated_at: string } | null | undefined
  >();
  return (
    <section className="mt-5 rounded-xl border p-4">
      <h3 className="font-semibold">Penilaian dengan rubrik</h3>
      <Notice message={message} />
      <label className="mt-3 block text-sm">
        Kiriman siswa
        <select
          className={fieldClass}
          value={submission?.id ?? ""}
          onChange={(e) => {
            setSelected(e.target.value);
            setVersion(undefined);
          }}
        >
          <option value="">Pilih kiriman</option>
          {submissions.map((s) => (
            <option key={s.id} value={s.id}>
              {state.roster.find((r) => r.id === s.student_id)?.full_name ??
                "Siswa"}{" "}
              · versi {s.version}
            </option>
          ))}
        </select>
      </label>
      {submission && (
        <>
          <Button
            className="mt-3"
            variant="outline"
            onClick={() =>
              void learningRequest("submission-detail", {
                course: state.course.id,
                target: submission.id,
              })
                .then((d) => {
                  setVersion(d.result.grade ?? null);
                  setMessage(
                    String(
                      d.result.body ||
                        "Kiriman berupa tautan/lampiran; buka detail di tab Tugas.",
                    ),
                  );
                })
                .catch((e) => setMessage(e.message))
            }
          >
            Muat kiriman dan versi nilai
          </Button>
          <form
            method="post"
            key={submission.version_id + String(version?.updated_at)}
            className="mt-4 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const d = new FormData(e.currentTarget),
                scores = rubric.map((_, i) => Number(d.get(`score-${i}`)));
              setBusy(true);
              void learningRequest("grade", {
                course: state.course.id,
                target: submission.version_id,
                data: {
                  score: scores.reduce((a, b) => a + b, 0),
                  rubric_scores: scores,
                  feedback: String(d.get("feedback")),
                  reason: String(d.get("reason")),
                  ...(version
                    ? { expected_updated_at: version.updated_at }
                    : {}),
                },
              })
                .then(() => {
                  setMessage(
                    "Nilai rubrik disimpan. Muat ulang kiriman sebelum mengubah lagi.",
                  );
                  setVersion(undefined);
                })
                .catch((e) => setMessage(e.message))
                .finally(() => setBusy(false));
            }}
          >
            {rubric.map((r, i) => (
              <label key={i} className="block text-sm">
                {r.label} (maksimal {r.points})
                <input
                  className={fieldClass}
                  name={`score-${i}`}
                  type="number"
                  min={0}
                  max={r.points}
                  step={0.01}
                  required
                />
              </label>
            ))}
            <label className="block text-sm">
              Umpan balik
              <textarea
                className={fieldClass}
                name="feedback"
                maxLength={5000}
              />
            </label>
            <label className="block text-sm">
              Alasan penilaian / koreksi (wajib untuk koreksi atau admin)
              <input
                className={fieldClass}
                name="reason"
                minLength={5}
                required={Boolean(version) || !state.context.teacher}
                maxLength={1000}
              />
            </label>
            <Button disabled={busy || version === undefined} type="submit">
              Simpan total rubrik
            </Button>
          </form>
        </>
      )}
    </section>
  );
}

function GroupEditor({
  group,
  roster,
  busy,
  save,
}: {
  group: Features["groups"][number];
  roster: CourseState["roster"];
  busy: boolean;
  save: (cmd: string, p: Record<string, unknown>) => Promise<void>;
}) {
  return (
    <details className="mt-4">
      <summary className="cursor-pointer text-sm text-emerald-800">
        Ubah kelompok sebelum pengumpulan
      </summary>
      <form
        method="post"
        className="mt-3 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          const d = new FormData(e.currentTarget);
          void save("group-save", {
            target: group.id,
            data: {
              assignment_id: group.assignment_id,
              name: String(d.get("name")),
              members: d.getAll("members"),
            },
          });
        }}
      >
        <label className="block text-sm">
          Nama kelompok
          <input
            name="name"
            className={fieldClass}
            maxLength={100}
            required
            defaultValue={group.name}
          />
        </label>
        <fieldset>
          <legend className="text-sm">Anggota</legend>
          {roster.map((s) => (
            <label className="mt-2 block text-sm" key={s.id}>
              <input
                type="checkbox"
                name="members"
                value={s.id}
                defaultChecked={group.members.some((m) => m.id === s.id)}
              />{" "}
              {s.full_name}
            </label>
          ))}
        </fieldset>
        <Button variant="outline" type="submit" disabled={busy}>
          Simpan perubahan kelompok
        </Button>
      </form>
    </details>
  );
}
