"use client";
import { navigateTabs } from "@/lib/http/tab-navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { panelClass, Notice } from "./learning-shared";
import { quizRequest, type Report } from "@/lib/quiz/types";
import { dateLabel } from "@/lib/learning/types";
export function ReportPanel({ course }: { course: string }) {
  const [data, setData] = useState<Report | null>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [tab, setTab] = useState("summary");
  useEffect(() => {
    let active = true;
    quizRequest<Report>("report", { course })
      .then((d) => {
        if (active) setData(d);
      })
      .catch((e) => {
        if (active) setMessage(e.message);
      });
    return () => {
      active = false;
    };
  }, [course]);
  async function load(offset: number) {
    setBusy(true);
    setMessage("");
    try {
      setData(await quizRequest<Report>("report", { course, offset }));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Laporan gagal dimuat.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-5">
      <Notice message={message} error />
      {!data && !message && <p role="status">Memuat laporan…</p>}
      {data && (
        <>
          <section className={panelClass}>
            <h2 className="text-xl font-semibold">
              Laporan {data.course.subject} · {data.course.classroom}
            </h2>
            <p className="mt-2 text-sm text-stone-600">
              Pengampu: {data.course.teacher} · Diperbarui{" "}
              {dateLabel(data.generated_at)}
            </p>
            <p className="mt-3 text-xs leading-6 text-stone-500">
              Rata-rata menggunakan nilai yang sudah dinilai dan boleh Anda
              lihat; bukan nilai akhir berbobot. Tanda — berarti belum ada
              nilai. Absensi yang belum dicatat tidak dihitung sebagai alpa.
              Progres membaca materi belum dilacak pada V1.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <a
                className="rounded-lg border border-emerald-700 px-4 py-2 text-sm font-semibold text-emerald-800"
                href={`/api/laporan/${course}?format=xlsx`}
              >
                Ekspor Excel (semua halaman)
              </a>
              <a
                className="rounded-lg border border-emerald-700 px-4 py-2 text-sm font-semibold text-emerald-800"
                href={`/api/laporan/${course}?format=pdf`}
              >
                Ekspor PDF (semua halaman)
              </a>
              <Button
                disabled={busy}
                variant="outline"
                onClick={() => void load(data.offset)}
              >
                Muat ulang
              </Button>
            </div>
          </section>
          <div
            className="flex flex-wrap gap-2"
            role="tablist"
            onKeyDown={navigateTabs}
            aria-label="Jenis laporan"
          >
            {[
              ["summary", "Ringkasan siswa"],
              ["quiz", "Hasil kuis"],
              ["activity", "Aktivitas pengampu"],
            ].map(([key, label]) => (
              <button
                key={key}
                role="tab"
                aria-selected={tab === key}
                tabIndex={tab === key ? 0 : -1}
                aria-controls="report-content"
                id={`report-tab-${key}`}
                className={`rounded-lg px-4 py-3 text-sm ${tab === key ? "bg-emerald-900 text-white" : "bg-stone-100"}`}
                onClick={() => setTab(key)}
              >
                {label}
              </button>
            ))}
          </div>
          <section
            role="tabpanel"
            aria-labelledby={`report-tab-${tab}`}
            id="report-content"
            className={panelClass}
          >
            {tab === "summary" && (
              <div className="overflow-auto">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">
                    Ringkasan absensi, tugas dan nilai siswa
                  </caption>
                  <thead>
                    <tr>
                      {[
                        "Siswa",
                        "Hadir / dicatat",
                        "Tugas masuk",
                        "Terlambat belum masuk",
                        "Rata-rata tugas",
                        "Rata-rata kuis",
                      ].map((x) => (
                        <th className="p-3" key={x}>
                          {x}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((r) => (
                      <tr className="border-t" key={r.id}>
                        <td className="p-3">{r.full_name}</td>
                        <td className="p-3">
                          {r.present} / {r.attendance_recorded}
                        </td>
                        <td className="p-3">{r.submissions}</td>
                        <td className="p-3">{r.overdue_missing}</td>
                        <td className="p-3">{r.assignment_average ?? "—"}</td>
                        <td className="p-3">{r.quiz_average ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {tab === "quiz" && (
              <div className="overflow-auto">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">Hasil percobaan kuis</caption>
                  <thead>
                    <tr>
                      {[
                        "Kuis",
                        "Siswa",
                        "Status",
                        "Skor",
                        "Nilai",
                        "Jawaban",
                      ].map((x) => (
                        <th className="p-3" key={x}>
                          {x}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.quizzes.map((q) => (
                      <tr className="border-t" key={q.attempt_id}>
                        <td className="p-3">{q.title}</td>
                        <td className="p-3">{q.student_name}</td>
                        <td className="p-3">
                          {q.status === "working"
                            ? "Dikerjakan"
                            : q.status === "expired"
                              ? "Waktu habis"
                              : "Selesai"}
                        </td>
                        <td className="p-3">
                          {q.score === null
                            ? "Belum dibuka"
                            : `${q.score} / ${q.max_score}`}
                        </td>
                        <td className="p-3">
                          {q.score === null
                            ? "—"
                            : ((q.score / q.max_score) * 100).toFixed(2)}
                        </td>
                        <td className="p-3">
                          {q.can_open ? (
                            <Link
                              className="text-emerald-800 underline"
                              href={`/kuis/${course}/${q.attempt_id}`}
                            >
                              Buka percobaan
                            </Link>
                          ) : (
                            <span className="text-xs text-stone-500">
                              Ringkasan hasil
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!data.quizzes.length && (
                  <p className="mt-3 text-sm">Belum ada percobaan kuis.</p>
                )}
              </div>
            )}
            {tab === "activity" &&
              (data.activity ? (
                <div className="grid gap-4 sm:grid-cols-4">
                  {Object.entries(data.activity).map(([key, n]) => (
                    <div key={key} className="rounded-xl bg-stone-50 p-5">
                      <p className="text-sm text-stone-500">
                        {{
                          meetings: "Pertemuan",
                          materials: "Materi",
                          assignments: "Tugas",
                          quizzes: "Kuis",
                        }[key] ?? key}
                      </p>
                      <p className="mt-3 text-2xl font-semibold">{n}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-stone-500">
                  Ringkasan aktivitas pengampu tersedia untuk staf yang
                  berwenang.
                </p>
              ))}
          </section>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-stone-500">
              Halaman {data.offset / 100 + 1} · maksimal 100 siswa per halaman
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={busy || !data.offset}
                variant="outline"
                onClick={() => void load(Math.max(0, data.offset - 100))}
              >
                Sebelumnya
              </Button>
              <Button
                disabled={busy || !data.has_more}
                variant="outline"
                onClick={() => void load(data.offset + 100)}
              >
                Berikutnya
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
