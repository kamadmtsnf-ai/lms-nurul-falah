"use client";
import { PageHeading } from "./page-heading";
import { navigateTabs } from "@/lib/http/tab-navigation";
import { DevelopmentCourse } from "./development-panel";
import { AdvancedPanel } from "./advanced-panel";
import { QuizPanel } from "./quiz-panel";
import { ReportPanel } from "./report-panel";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  type CourseState,
  type Material,
  type Assignment,
  type Submission,
  type Grade,
  type Asset,
  learningRequest,
  dateLabel,
  localInput,
} from "@/lib/learning/types";
import { attendanceLabels, publicationLabels } from "@/lib/learning/validation";
import {
  fieldClass,
  panelClass,
  Links,
  Files,
  Uploader,
  Notice,
  AttendanceForm,
} from "./learning-shared";
type Save = (action: string, body: Record<string, unknown>) => Promise<boolean>;
export function CourseWorkspace({ initial }: { initial: CourseState }) {
  const [state, setState] = useState(initial),
    [tab, setTab] = useState("materials"),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(false);
  const course = state.course.id;
  async function reload(offset = state.offset) {
    const d = await learningRequest("course", { course, offset });
    setState(d.result);
  }
  async function save(action: string, body: Record<string, unknown>) {
    setBusy(true);
    setMessage("");
    try {
      await learningRequest(action, { course, ...body });
      await reload();
      setMessage("Perubahan berhasil disimpan.");
      setError(false);
      return true;
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Permintaan gagal.");
      setError(true);
      return false;
    } finally {
      setBusy(false);
    }
  }
  const manager = state.context.manager && state.context.writable;
  return (
    <div className="space-y-6">
      <section className="workspace-hero rounded-2xl p-6 sm:p-8">
        <PageHeading
          eyebrow={`${state.course.classroom} · ${state.context.semester_status === "archived" ? "Arsip semester" : "Ruang pembelajaran"}`}
          title={state.course.subject}
          description={`Guru pengampu: ${state.course.teacher}`}
        />
      </section>
      <Notice message={message} error={error} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav
          role="tablist"
          onKeyDown={navigateTabs}
          aria-label="Kegiatan pembelajaran"
          className="section-tabs flex max-w-full gap-2 overflow-x-auto rounded-xl bg-stone-100 p-1"
        >
          {[
            { key: "materials", label: "Materi" },
            { key: "attendance", label: "Pertemuan & absensi" },
            { key: "assignments", label: "Tugas" },
            { key: "grades", label: "Nilai tugas" },
            { key: "quiz", label: "Kuis" },
            { key: "reports", label: "Laporan" },
            { key: "advanced", label: "Lanjutan" },
            { key: "development", label: "Pengembangan" },
          ].map((t) => (
            <button
              role="tab"
              aria-selected={tab === t.key}
              tabIndex={tab === t.key ? 0 : -1}
              aria-controls="course-panel"
              id={`tab-${t.key}`}
              key={t.key}
              type="button"
              disabled={busy}
              onClick={() => {
                setTab(t.key);
                setMessage("");
              }}
              className={`shrink-0 rounded-lg px-4 py-3 text-sm ${tab === t.key ? "bg-white font-semibold text-emerald-900 shadow-sm" : "text-stone-600"}`}
            >
              {t.label}
            </button>
          ))}
        </nav>
        {!["quiz", "reports", "advanced", "development"].includes(tab) && (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void reload()
                .catch(() => {
                  setMessage("Data gagal dimuat ulang.");
                  setError(true);
                })
                .finally(() => setBusy(false));
            }}
          >
            Muat ulang
          </Button>
        )}
      </div>
      {!state.context.writable && (
        <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
          Semester atau penugasan ini sudah ditutup. Data tersedia sebagai arsip
          baca-saja.
        </p>
      )}
      <div
        role="tabpanel"
        id="course-panel"
        aria-labelledby={`tab-${tab}`}
        className="space-y-5"
      >
        {tab === "materials" && (
          <MaterialPanel
            key={state.offset}
            state={state}
            manager={manager}
            busy={busy}
            save={save}
            reload={() => reload()}
          />
        )}{" "}
        {tab === "attendance" && (
          <MeetingPanel
            key={state.offset}
            state={state}
            manager={manager}
            busy={busy}
            save={save}
          />
        )}{" "}
        {tab === "assignments" && (
          <AssignmentPanel
            key={state.offset}
            state={state}
            manager={manager}
            busy={busy}
            save={save}
            reload={() => reload()}
          />
        )}{" "}
        {tab === "grades" && <Grades state={state} />}{" "}
        {tab === "quiz" && <QuizPanel course={course} />}{" "}
        {tab === "reports" && <ReportPanel course={course} />}{" "}
        {tab === "advanced" && <AdvancedPanel state={state} />}{" "}
        {tab === "development" && <DevelopmentCourse state={state} />}
      </div>
      {!["quiz", "reports", "advanced", "development"].includes(tab) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-200 pt-5">
          <p className="text-xs text-stone-500">
            Halaman {state.offset / 20 + 1} · maksimal 20 materi, pertemuan dan
            tugas per halaman. Rekap pertemuan mengikuti halaman ini.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button
              disabled={busy || !state.offset}
              variant="outline"
              onClick={() => {
                setBusy(true);
                void reload(Math.max(0, state.offset - 20))
                  .catch(() => {
                    setError(true);
                    setMessage("Halaman gagal dimuat.");
                  })
                  .finally(() => setBusy(false));
              }}
            >
              Sebelumnya
            </Button>
            <Button
              disabled={busy || !state.has_more}
              variant="outline"
              onClick={() => {
                setBusy(true);
                void reload(state.offset + 20)
                  .catch(() => {
                    setError(true);
                    setMessage("Halaman gagal dimuat.");
                  })
                  .finally(() => setBusy(false));
              }}
            >
              Berikutnya
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
function PublicationFields({
  status,
  publishAt,
}: {
  status?: string;
  publishAt?: string | null;
}) {
  const [current, setCurrent] = useState(status ?? "draft");
  return (
    <>
      <label className="block text-sm">
        Publikasi
        <select
          name="status"
          className={fieldClass}
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
        >
          {Object.entries(publicationLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        Jadwal terbit (waktu perangkat)
        {current !== "scheduled" && (
          <span className="ml-1 text-xs text-stone-500">opsional</span>
        )}
        <input
          type="datetime-local"
          name="publish_at"
          required={current === "scheduled"}
          className={fieldClass}
          defaultValue={localInput(publishAt)}
        />
      </label>
    </>
  );
}
function readPublication(form: FormData) {
  const time = String(form.get("publish_at") ?? "");
  return {
    status: String(form.get("status")),
    publish_at: time ? new Date(time).toISOString() : null,
  };
}
function parseLinks(value: FormDataEntryValue | null) {
  return String(value ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}
function MaterialPanel({
  state,
  manager,
  busy,
  save,
  reload,
}: {
  state: CourseState;
  manager: boolean;
  busy: boolean;
  save: Save;
  reload: () => Promise<void>;
}) {
  const [editor, setEditor] = useState<Material | null | undefined>(undefined);
  return (
    <>
      {manager && (
        <div>
          <Button type="button" disabled={busy} onClick={() => setEditor(null)}>
            Tambah materi
          </Button>
        </div>
      )}
      {editor !== undefined && (
        <section className={panelClass}>
          <h2 className="text-xl font-semibold">
            {editor ? "Ubah" : "Tambah"} materi
          </h2>
          <form
            method="post"
            key={editor?.id ?? "new"}
            className="mt-5 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void save("material-save", {
                target: editor?.id,
                data: {
                  title: String(f.get("title")),
                  meeting_id: String(f.get("meeting_id")),
                  body: String(f.get("body")),
                  links: parseLinks(f.get("links")),
                  ...readPublication(f),
                  ...(editor ? { expected_updated_at: editor.updated_at } : {}),
                },
              }).then((ok) => {
                if (ok) setEditor(undefined);
              });
            }}
          >
            <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
              <legend className="sr-only">Isian materi</legend>
              <label className="block text-sm">
                Judul
                <input
                  name="title"
                  required
                  minLength={2}
                  maxLength={150}
                  defaultValue={editor?.title}
                  className={fieldClass}
                />
              </label>
              <label className="block text-sm">
                Pertemuan
                <select
                  name="meeting_id"
                  required
                  defaultValue={editor?.meeting_id ?? ""}
                  className={fieldClass}
                >
                  <option value="">Pilih pertemuan</option>
                  {editor &&
                    !state.meetings.some((m) => m.id === editor.meeting_id) && (
                      <option value={editor.meeting_id}>
                        Pertemuan materi saat ini
                      </option>
                    )}
                  {state.meetings.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm sm:col-span-2">
                Isi materi
                <textarea
                  name="body"
                  rows={7}
                  maxLength={30000}
                  defaultValue={editor?.body}
                  className={fieldClass}
                />
              </label>
              <label className="text-sm sm:col-span-2">
                Tautan sumber / video (HTTPS, satu per baris)
                <textarea
                  name="links"
                  rows={3}
                  defaultValue={editor?.links.join("\n")}
                  className={fieldClass}
                />
              </label>
              <PublicationFields
                status={editor?.status}
                publishAt={editor?.publish_at}
              />
            </fieldset>
            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={busy || !state.meetings.length}>
                Simpan materi
              </Button>
              <Button
                variant="outline"
                type="button"
                disabled={busy}
                onClick={() => setEditor(undefined)}
              >
                Batal
              </Button>
            </div>
            {!state.meetings.length && (
              <p className="text-sm text-amber-800">
                Buat pertemuan terlebih dahulu pada tab Pertemuan & absensi.
              </p>
            )}
            <p className="text-xs text-stone-500">
              Simpan materi terlebih dahulu untuk menambahkan lampiran.
            </p>
          </form>
        </section>
      )}
      {state.materials.map((m) => (
        <article key={m.id} className={panelClass}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <span className="text-xs font-semibold text-emerald-700">
                {publicationLabels[m.status]} ·{" "}
                {state.meetings.find((p) => p.id === m.meeting_id)?.title}
              </span>
              <h2 className="mt-2 text-xl font-semibold">{m.title}</h2>
            </div>
            {manager && (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setEditor(m)}
              >
                Ubah
              </Button>
            )}
          </div>
          <p className="mt-5 whitespace-pre-wrap text-sm leading-7 text-stone-700">
            {m.body}
          </p>
          <Links links={m.links} />
          <Files
            course={state.course.id}
            assets={state.assets.filter(
              (a) => a.target_type === "material" && a.target_id === m.id,
            )}
          />
          {manager && (
            <Uploader
              course={state.course.id}
              target={m.id}
              type="material"
              onDone={async () => reload()}
            />
          )}
        </article>
      ))}
      {!state.materials.length && (
        <p className={panelClass + " text-sm text-stone-500"}>
          Belum ada materi yang dapat dibuka.
        </p>
      )}
    </>
  );
}
function MeetingPanel({
  state,
  manager,
  busy,
  save,
}: {
  state: CourseState;
  manager: boolean;
  busy: boolean;
  save: Save;
}) {
  const [selected, setSelected] = useState(state.meetings[0]?.id ?? ""),
    [editor, setEditor] = useState<string | null>(null),
    [show, setShow] = useState(false);
  const editing = state.meetings.find((m) => m.id === editor);
  const meeting =
    state.meetings.find((m) => m.id === selected) ?? state.meetings[0];
  const students = state.roster.filter((s) =>
    state.meeting_roster.some(
      (r) => r.meeting_id === meeting?.id && r.student_id === s.id,
    ),
  );
  const records = state.attendance.filter((a) => a.meeting_id === meeting?.id);
  return (
    <>
      {manager && (
        <Button
          type="button"
          disabled={busy}
          onClick={() => {
            setEditor(null);
            setShow(true);
          }}
        >
          Tambah pertemuan
        </Button>
      )}
      {show && (
        <section className={panelClass}>
          <h2 className="font-semibold">
            {editing ? "Ubah" : "Tambah"} pertemuan
          </h2>
          <form
            method="post"
            key={editor ?? "new"}
            className="mt-4 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void save("meeting-save", {
                target: editing?.id,
                data: {
                  title: String(f.get("title")),
                  starts_at: new Date(String(f.get("starts_at"))).toISOString(),
                  ...(editing
                    ? { expected_updated_at: editing.updated_at }
                    : {}),
                },
              }).then((ok) => {
                if (ok) setShow(false);
              });
            }}
          >
            <label className="block text-sm">
              Topik / judul pertemuan
              <input
                required
                minLength={2}
                maxLength={150}
                name="title"
                defaultValue={editing?.title}
                className={fieldClass}
              />
            </label>
            <label className="block text-sm">
              Waktu pertemuan (waktu perangkat)
              <input
                required
                type="datetime-local"
                name="starts_at"
                defaultValue={localInput(editing?.starts_at)}
                className={fieldClass}
              />
            </label>
            <div className="flex flex-wrap gap-3">
              <Button disabled={busy} type="submit">
                Simpan pertemuan
              </Button>
              <Button
                disabled={busy}
                type="button"
                variant="outline"
                onClick={() => setShow(false)}
              >
                Batal
              </Button>
            </div>
          </form>
        </section>
      )}
      <section className={panelClass}>
        <h2 className="text-xl font-semibold">
          Absensi pertemuan mata pelajaran
        </h2>
        <p className="mt-2 text-sm leading-6 text-stone-500">
          Catatan ini terpisah dari absensi harian sekolah.
        </p>
        <label className="mt-5 block text-sm">
          Pilih pertemuan
          <select
            className={fieldClass}
            value={meeting?.id ?? ""}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="">Pilih pertemuan</option>
            {state.meetings.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title} · {dateLabel(m.starts_at)}
              </option>
            ))}
          </select>
        </label>
        {meeting && (
          <>
            <div className="my-5 flex flex-wrap gap-3">
              {manager && (
                <>
                  <Button
                    variant="outline"
                    disabled={busy}
                    type="button"
                    onClick={() => {
                      setEditor(meeting.id);
                      setShow(true);
                    }}
                  >
                    Ubah pertemuan
                  </Button>
                  <Button
                    variant="outline"
                    disabled={busy}
                    type="button"
                    onClick={() =>
                      void save("meeting-sync", { target: meeting.id })
                    }
                  >
                    Tambahkan siswa baru ke daftar
                  </Button>
                </>
              )}
            </div>
            <AttendanceForm
              key={`${meeting.id}:${records.map((r) => r.revision).join(",")}:${students.length}`}
              students={students}
              records={records}
              busy={busy}
              readOnly={!manager}
              onSave={(entries) =>
                save("meeting-attendance", { target: meeting.id, entries })
              }
            />
          </>
        )}
        {!meeting && (
          <p className="mt-5 text-sm text-stone-500">Belum ada pertemuan.</p>
        )}
      </section>
      <AttendanceRecap state={state} />
    </>
  );
}
function AttendanceRecap({ state }: { state: CourseState }) {
  return (
    <section className={panelClass}>
      <h2 className="text-lg font-semibold">Rekap kehadiran</h2>
      <p className="mt-2 text-xs text-stone-500">
        Hanya catatan yang sudah disimpan dihitung. Sumber harian dan pertemuan
        ditampilkan terpisah.
      </p>
      <div className="mt-4 overflow-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th className="p-3">Siswa</th>
              <th className="p-3">Pertemuan (H / S / I / A)</th>
              <th className="p-3">Harian (H / S / I / A)</th>
            </tr>
          </thead>
          <tbody>
            {state.roster.map((s) => (
              <tr key={s.id} className="border-t border-stone-100">
                <td className="p-3">{s.full_name}</td>
                <td className="p-3">
                  {Object.keys(attendanceLabels)
                    .map(
                      (status) =>
                        state.attendance.filter(
                          (a) => a.student_id === s.id && a.status === status,
                        ).length,
                    )
                    .join(" / ")}
                </td>
                <td className="p-3">
                  {Object.keys(attendanceLabels)
                    .map((status) =>
                      state.daily
                        .filter(
                          (a) => a.student_id === s.id && a.status === status,
                        )
                        .reduce((sum, a) => sum + a.count, 0),
                    )
                    .join(" / ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
function AssignmentPanel({
  state,
  manager,
  busy,
  save,
  reload,
}: {
  state: CourseState;
  manager: boolean;
  busy: boolean;
  save: Save;
  reload: () => Promise<void>;
}) {
  const [editor, setEditor] = useState<Assignment | null | undefined>(
      undefined,
    ),
    [selected, setSelected] = useState("");
  const current =
    state.assignments.find((a) => a.id === selected) ?? state.assignments[0];
  return (
    <>
      {manager && (
        <Button type="button" disabled={busy} onClick={() => setEditor(null)}>
          Tambah tugas
        </Button>
      )}
      {editor !== undefined && (
        <section className={panelClass}>
          <h2 className="text-xl font-semibold">
            {editor ? "Ubah" : "Tambah"} tugas
          </h2>
          <form
            method="post"
            key={editor?.id ?? "new"}
            className="mt-5 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void save("assignment-save", {
                target: editor?.id,
                data: {
                  title: String(f.get("title")),
                  instructions: String(f.get("instructions")),
                  formats: f.getAll("formats").map(String),
                  due_at: new Date(String(f.get("due_at"))).toISOString(),
                  accept_late: f.get("accept_late") === "on",
                  max_score: Number(f.get("max_score")),
                  ...readPublication(f),
                  ...(editor ? { expected_updated_at: editor.updated_at } : {}),
                },
              }).then((ok) => {
                if (ok) setEditor(undefined);
              });
            }}
          >
            <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
              <legend className="sr-only">Isian tugas</legend>
              <label className="text-sm sm:col-span-2">
                Judul
                <input
                  name="title"
                  required
                  minLength={2}
                  maxLength={150}
                  defaultValue={editor?.title}
                  className={fieldClass}
                />
              </label>
              <label className="text-sm sm:col-span-2">
                Petunjuk
                <textarea
                  name="instructions"
                  rows={5}
                  maxLength={30000}
                  defaultValue={editor?.instructions}
                  className={fieldClass}
                />
              </label>
              <label className="text-sm">
                Batas waktu (waktu perangkat)
                <input
                  required
                  name="due_at"
                  type="datetime-local"
                  defaultValue={localInput(editor?.due_at)}
                  className={fieldClass}
                />
              </label>
              <label className="text-sm">
                Skor maksimum
                <input
                  required
                  name="max_score"
                  type="number"
                  min="0.01"
                  max="10000"
                  step="0.01"
                  defaultValue={editor?.max_score ?? 100}
                  className={fieldClass}
                />
              </label>
              <fieldset className="sm:col-span-2">
                <legend className="text-sm">
                  Cara pengumpulan yang diperbolehkan (pilih minimal satu)
                </legend>
                <div className="mt-3 flex flex-wrap gap-5">
                  {[
                    { key: "text", label: "Teks" },
                    { key: "file", label: "Berkas" },
                    { key: "link", label: "Tautan" },
                  ].map((v) => (
                    <label key={v.key} className="flex gap-2 text-sm">
                      <input
                        type="checkbox"
                        name="formats"
                        value={v.key}
                        defaultChecked={
                          editor
                            ? editor.formats.includes(v.key)
                            : v.key === "text"
                        }
                      />
                      {v.label}
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input
                  type="checkbox"
                  name="accept_late"
                  defaultChecked={editor?.accept_late}
                />
                Terima kiriman setelah tenggat (ditandai terlambat)
              </label>
              <PublicationFields
                status={editor?.status}
                publishAt={editor?.publish_at}
              />
            </fieldset>
            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={busy}>
                Simpan tugas
              </Button>
              <Button
                variant="outline"
                type="button"
                disabled={busy}
                onClick={() => setEditor(undefined)}
              >
                Batal
              </Button>
            </div>
          </form>
        </section>
      )}
      <label className="block text-sm">
        Pilih tugas
        <select
          className={fieldClass}
          value={current?.id ?? ""}
          onChange={(e) => setSelected(e.target.value)}
        >
          <option value="">Pilih tugas</option>
          {state.assignments.map((a) => (
            <option key={a.id} value={a.id}>
              {a.title}
            </option>
          ))}
        </select>
      </label>
      {!current && (
        <p className={panelClass + " text-sm text-stone-500"}>
          Belum ada tugas yang dapat dibuka.
        </p>
      )}
      {current && (
        <>
          <article className={panelClass}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-emerald-700">
                  {publicationLabels[current.status]}
                </p>
                <h2 className="mt-2 text-xl font-semibold">{current.title}</h2>
              </div>
              {manager && (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => setEditor(current)}
                >
                  Ubah tugas
                </Button>
              )}
            </div>
            <p className="mt-4 whitespace-pre-wrap text-sm leading-7">
              {current.instructions}
            </p>
            <p className="mt-4 text-sm text-stone-600">
              Tenggat: <strong>{dateLabel(current.due_at)}</strong> · Maksimum{" "}
              {current.max_score}
            </p>
            <p className="mt-2 text-xs text-stone-500">
              {current.accept_late
                ? "Kiriman terlambat diterima dan ditandai."
                : "Kiriman setelah tenggat ditolak."}{" "}
              Cara pengumpulan:{" "}
              {current.formats
                .map(
                  (f) => ({ text: "Teks", file: "Berkas", link: "Tautan" })[f],
                )
                .join(", ")}
              .
            </p>
            <Files
              course={state.course.id}
              assets={state.assets.filter(
                (a) =>
                  a.target_type === "assignment" && a.target_id === current.id,
              )}
            />
            {manager && (
              <Uploader
                course={state.course.id}
                target={current.id}
                type="assignment"
                onDone={async () => reload()}
              />
            )}
          </article>
          {state.context.student_writable && (
            <SubmissionForm
              key={current.id}
              task={current}
              state={state}
              busy={busy}
              save={save}
              reload={() => reload()}
            />
          )}{" "}
          {state.context.manager && (
            <section className={panelClass}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold">
                    Pengumpulan & koreksi
                  </h2>
                  <p className="mt-2 text-sm text-stone-500">
                    {
                      state.submissions.filter(
                        (s) => s.assignment_id === current.id,
                      ).length
                    }{" "}
                    kiriman terbaru · Nilai{" "}
                    {current.grades_visible ? "sudah dibuka" : "masih ditutup"}{" "}
                    untuk siswa.
                  </p>
                </div>
                {manager && (
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      void save("release-grades", {
                        target: current.id,
                        data: {
                          visible: !current.grades_visible,
                          expected_updated_at: current.updated_at,
                        },
                      })
                    }
                  >
                    {current.grades_visible
                      ? "Tutup nilai"
                      : "Buka nilai untuk siswa"}
                  </Button>
                )}
              </div>
              <div className="mt-6 space-y-5">
                {state.submissions
                  .filter((s) => s.assignment_id === current.id)
                  .map((s) => (
                    <Grading
                      key={`${s.version_id}:${state.grades.find((g) => g.version_id === s.version_id)?.updated_at ?? ""}`}
                      submission={s}
                      task={current}
                      state={state}
                      canGrade={manager}
                      busy={busy}
                      save={save}
                    />
                  ))}
              </div>
              {!state.submissions.some(
                (s) => s.assignment_id === current.id,
              ) && (
                <p className="mt-6 text-sm text-stone-500">
                  Belum ada kiriman.
                </p>
              )}
            </section>
          )}
        </>
      )}
    </>
  );
}
function SubmissionForm({
  task,
  state,
  busy,
  save,
  reload,
}: {
  task: Assignment;
  state: CourseState;
  busy: boolean;
  save: Save;
  reload: () => Promise<void>;
}) {
  const previous = state.submissions.find(
    (s) => s.assignment_id === task.id && s.student_id === state.context.actor,
  );
  const [body, setBody] = useState(previous?.body ?? ""),
    [links, setLinks] = useState(previous?.links.join("\n") ?? ""),
    [assets, setAssets] = useState<string[]>(previous?.asset_ids ?? []),
    [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const own = state.assets.filter(
    (a) =>
      a.target_type === "submission" &&
      a.target_id === task.id &&
      a.owner_id === state.context.actor,
  );
  const grade =
    previous && state.grades.find((g) => g.version_id === previous.version_id);
  return (
    <section className={panelClass}>
      <h2 className="text-xl font-semibold">
        {previous ? "Revisi pengumpulan" : "Kumpulkan tugas"}
      </h2>
      {previous && (
        <p className="mt-3 text-sm text-emerald-800">
          Versi {previous.version} tersimpan pada{" "}
          {dateLabel(previous.submitted_at)}
          {previous.is_late ? " · Terlambat" : ""}. Kiriman baru membuat versi
          berikutnya.
        </p>
      )}
      {grade && (
        <p className="mt-3 rounded-xl bg-emerald-50 p-4 text-sm">
          Nilai: {grade.score} / {task.max_score}
          <br />
          {grade.feedback}
        </p>
      )}
      <form
        method="post"
        className="mt-5 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save("submit", {
            target: task.id,
            data: {
              request_id: requestId,
              revision: previous?.revision ?? 0,
              body: task.formats.includes("text") ? body : "",
              links: task.formats.includes("link")
                ? links
                    .split("\n")
                    .map((s) => s.trim())
                    .filter(Boolean)
                : [],
              asset_ids: task.formats.includes("file") ? assets : [],
            },
          }).then((ok) => {
            if (ok) setRequestId(crypto.randomUUID());
          });
        }}
      >
        {task.formats.includes("text") && (
          <label className="block text-sm">
            Jawaban teks
            <textarea
              rows={6}
              maxLength={30000}
              value={body}
              disabled={busy}
              onChange={(e) => {
                setBody(e.target.value);
                setRequestId(crypto.randomUUID());
              }}
              className={fieldClass}
            />
          </label>
        )}
        {task.formats.includes("link") && (
          <label className="block text-sm">
            Tautan jawaban (HTTPS, satu per baris)
            <textarea
              rows={3}
              value={links}
              disabled={busy}
              onChange={(e) => {
                setLinks(e.target.value);
                setRequestId(crypto.randomUUID());
              }}
              className={fieldClass}
            />
          </label>
        )}
        {task.formats.includes("file") && (
          <fieldset>
            <legend className="text-sm">
              Berkas yang dikumpulkan (maksimal 5)
            </legend>
            {own.map((a) => (
              <label
                className="mt-3 flex items-center gap-2 text-sm"
                key={a.id}
              >
                <input
                  type="checkbox"
                  checked={assets.includes(a.id)}
                  disabled={
                    busy || (!assets.includes(a.id) && assets.length >= 5)
                  }
                  onChange={(e) => {
                    setAssets((v) =>
                      e.target.checked
                        ? [...v, a.id]
                        : v.filter((id) => id !== a.id),
                    );
                    setRequestId(crypto.randomUUID());
                  }}
                />
                {a.name}
              </label>
            ))}
          </fieldset>
        )}
        <Button type="submit" disabled={busy}>
          {busy
            ? "Mengirim…"
            : previous
              ? "Kirim versi baru"
              : "Kumpulkan tugas"}
        </Button>
      </form>
      {task.formats.includes("file") && (
        <Uploader
          course={state.course.id}
          target={task.id}
          type="submission"
          onDone={async (id) => {
            setAssets((v) => [...new Set([...v, id])].slice(-5));
            setRequestId(crypto.randomUUID());
            await reload();
          }}
        />
      )}
      {previous && (
        <History course={state.course.id} submission={previous.id} />
      )}
    </section>
  );
}
function History({
  course,
  submission,
}: {
  course: string;
  submission: string;
}) {
  const [rows, setRows] = useState<
      | {
          id: string;
          version: number;
          body: string;
          links: string[];
          asset_ids: string[];
          submitted_at: string;
        }[]
      | null
    >(null),
    [message, setMessage] = useState(""),
    [offset, setOffset] = useState(0),
    [loading, setLoading] = useState(false);
  async function loadPage(next: number) {
    if (loading) return;
    setLoading(true);
    setMessage("");
    try {
      const d = await learningRequest("history", {
        course,
        target: submission,
        offset: next,
      });
      setRows(d.result);
      setOffset(next);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Riwayat gagal dimuat.");
    } finally {
      setLoading(false);
    }
  }
  return (
    <div className="mt-4">
      <button
        disabled={loading}
        type="button"
        className="text-sm text-emerald-800 underline"
        onClick={() => {
          if (rows) {
            setRows(null);
            return;
          }
          void loadPage(0);
        }}
      >
        Riwayat versi kiriman
      </button>
      {message && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {message}
        </p>
      )}
      {rows && (
        <ol className="mt-3 space-y-3">
          {rows.map((v) => (
            <li key={v.id} className="rounded-xl bg-stone-50 p-4">
              <strong className="text-xs">
                Versi {v.version} · {dateLabel(v.submitted_at)}
              </strong>
              <p className="mt-2 whitespace-pre-wrap text-sm">
                {v.body || "Jawaban berupa lampiran atau tautan."}
              </p>
              <Links links={v.links} />
              <Files
                course={course}
                assets={v.asset_ids.map((id, i) => ({
                  id,
                  name: `Lampiran ${i + 1} · versi ${v.version}`,
                }))}
              />
            </li>
          ))}
        </ol>
      )}
      {rows && (
        <div className="mt-3 flex gap-4">
          <button
            type="button"
            disabled={loading || offset === 0}
            className="text-xs text-emerald-800 underline disabled:opacity-40"
            onClick={() => void loadPage(Math.max(0, offset - 20))}
          >
            Versi lebih baru
          </button>
          <button
            type="button"
            disabled={loading || rows.length < 20}
            className="text-xs text-emerald-800 underline disabled:opacity-40"
            onClick={() => void loadPage(offset + 20)}
          >
            Versi lebih lama
          </button>
        </div>
      )}
    </div>
  );
}
function Grading({
  submission: s,
  task,
  state,
  canGrade,
  busy,
  save,
}: {
  submission: Submission;
  task: Assignment;
  state: CourseState;
  canGrade: boolean;
  busy: boolean;
  save: Save;
}) {
  const [detail, setDetail] = useState<{
      body: string;
      links: string[];
      assets: Asset[];
      grade: Grade | null;
    } | null>(null),
    [detailError, setDetailError] = useState("");
  const grade =
    detail?.grade ?? state.grades.find((g) => g.version_id === s.version_id);
  return (
    <article className="rounded-xl border border-stone-200 p-4">
      <h3 className="font-semibold">
        {state.roster.find((r) => r.id === s.student_id)?.full_name ?? "Siswa"}{" "}
        <span className="ml-2 text-xs font-normal text-stone-500">
          Versi {s.version}
          {s.is_late ? " · Terlambat" : ""}
        </span>
      </h3>
      <p className="mt-1 text-xs text-stone-500">{dateLabel(s.submitted_at)}</p>
      {!detail && (
        <Button
          type="button"
          variant="outline"
          className="mt-4"
          onClick={() => {
            void learningRequest("submission-detail", {
              course: state.course.id,
              target: s.id,
            })
              .then((d) => setDetail(d.result))
              .catch((e) =>
                setDetailError(
                  e instanceof Error ? e.message : "Jawaban gagal dimuat.",
                ),
              );
          }}
        >
          Buka jawaban & penilaian
        </Button>
      )}
      {detailError && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {detailError}
        </p>
      )}
      {detail && (
        <>
          <p className="mt-4 whitespace-pre-wrap text-sm leading-6">
            {detail.body}
          </p>
          <Links links={detail.links} />
          <Files course={state.course.id} assets={detail.assets} />
          <History course={state.course.id} submission={s.id} />
        </>
      )}
      {canGrade && detail ? (
        <form
          method="post"
          key={grade?.updated_at ?? "new-grade"}
          className="mt-5 grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void save("grade", {
              target: s.version_id,
              data: {
                score: Number(f.get("score")),
                feedback: String(f.get("feedback")),
                reason: String(f.get("reason") ?? ""),
                ...(grade ? { expected_updated_at: grade.updated_at } : {}),
              },
            }).then((ok) => {
              if (ok) setDetail(null);
            });
          }}
        >
          <label className="text-sm">
            Nilai (maksimum {task.max_score})
            <input
              name="score"
              required
              type="number"
              min={0}
              max={task.max_score}
              step="0.01"
              defaultValue={grade?.score}
              className={fieldClass}
            />
          </label>
          <label className="text-sm">
            Umpan balik
            <textarea
              name="feedback"
              maxLength={5000}
              defaultValue={grade?.feedback}
              className={fieldClass}
            />
          </label>
          {!state.context.teacher && (
            <label className="text-sm sm:col-span-2">
              Alasan koreksi admin (wajib)
              <input
                name="reason"
                required
                minLength={5}
                maxLength={1000}
                className={fieldClass}
              />
            </label>
          )}
          <Button disabled={busy} type="submit" className="justify-self-start">
            Simpan penilaian
          </Button>
        </form>
      ) : (
        <p className="mt-4 text-sm text-stone-500">
          {grade ? `Nilai ${grade.score} / ${task.max_score}` : "Belum dinilai"}
        </p>
      )}
    </article>
  );
}
function Grades({ state }: { state: CourseState }) {
  return (
    <section className={panelClass}>
      <h2 className="text-xl font-semibold">Nilai tugas</h2>
      <p className="mt-2 text-sm leading-6 text-stone-500">
        Nilai dinormalisasi ke skala 100 untuk informasi. Nilai kuis dan nilai
        akhir berbobot tersedia pada tab Lanjutan. Kiriman yang direvisi perlu
        dinilai kembali.
      </p>
      <div className="mt-5 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              {["Siswa", "Tugas", "Skor", "Skala 100", "Status"].map((h) => (
                <th key={h} className="whitespace-nowrap p-3">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {state.roster.flatMap((student) =>
              state.assignments.map((task) => {
                const grade = state.grades.find(
                  (g) =>
                    g.student_id === student.id && g.assignment_id === task.id,
                );
                const submission = state.submissions.find(
                  (s) =>
                    s.student_id === student.id && s.assignment_id === task.id,
                );
                return (
                  <tr
                    key={`${student.id}:${task.id}`}
                    className="border-t border-stone-100"
                  >
                    <td className="p-3">{student.full_name}</td>
                    <td className="p-3">{task.title}</td>
                    <td className="p-3">
                      {grade ? `${grade.score} / ${task.max_score}` : "—"}
                    </td>
                    <td className="p-3">
                      {grade
                        ? (
                            (Number(grade.score) / Number(task.max_score)) *
                            100
                          ).toFixed(2)
                        : "—"}
                    </td>
                    <td className="p-3">
                      {grade
                        ? task.grades_visible
                          ? "Nilai dibuka"
                          : "Nilai tertutup"
                        : state.context.manager
                          ? submission
                            ? "Belum dinilai"
                            : "Belum mengumpulkan"
                          : "Menunggu penilaian / pembukaan nilai"}
                    </td>
                  </tr>
                );
              }),
            )}
          </tbody>
        </table>
      </div>
      {!state.assignments.length && (
        <p className="mt-5 text-sm text-stone-500">Belum ada tugas.</p>
      )}
    </section>
  );
}
