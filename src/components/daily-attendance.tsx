"use client";
import { ClientReady } from "./client-ready";
import { PageHeading } from "./page-heading";
import { navigateTabs } from "@/lib/http/tab-navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  learningRequest,
  type Student,
  type Attendance,
} from "@/lib/learning/types";
import { attendanceLabels } from "@/lib/learning/validation";
import {
  AttendanceForm,
  Notice,
  fieldClass,
  panelClass,
} from "./learning-shared";
export type DailyMeta = {
  today: string;
  classrooms: {
    id: string;
    name: string;
    semester_id: string;
    starts_on: string;
    ends_on: string;
    semester_status: string;
    year: string;
    semester: number;
  }[];
};
export function DailyAttendance({
  school,
  meta,
}: {
  school: string;
  meta: DailyMeta;
}) {
  const [room, setRoom] = useState(meta.classrooms[0]?.id ?? ""),
    [date, setDate] = useState(meta.today),
    [tab, setTab] = useState("day"),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(false),
    [data, setData] = useState<{
      can_write: boolean;
      roster: Student[];
      attendance: Attendance[];
    } | null>(null),
    [records, setRecords] = useState<
      | {
          student_id: string;
          full_name: string;
          count: number;
          status: string;
        }[]
      | null
    >(null),
    [from, setFrom] = useState(meta.today),
    [to, setTo] = useState(meta.today);
  const classroom = meta.classrooms.find((c) => c.id === room);
  async function load() {
    setBusy(true);
    setMessage("");
    try {
      if (tab === "day") {
        const d = await learningRequest("daily", {
          school,
          classroom: room,
          date,
        });
        setData(d.result);
      } else {
        const d = await learningRequest("daily-report", {
          school,
          classroom: room,
          from,
          to,
        });
        setRecords(d.result.records);
      }
      setError(false);
    } catch (e) {
      setError(true);
      setData(null);
      setRecords(null);
      setMessage(e instanceof Error ? e.message : "Data belum dapat dimuat.");
    } finally {
      setBusy(false);
    }
  }
  async function save(entries: Record<string, unknown>[]) {
    setBusy(true);
    setMessage("");
    try {
      const d = await learningRequest("daily-save", {
        school,
        classroom: room,
        date,
        entries,
      });
      setData(d.result);
      setMessage("Absensi harian berhasil disimpan.");
      setError(false);
      return true;
    } catch (e) {
      setError(true);
      setMessage(e instanceof Error ? e.message : "Penyimpanan gagal.");
      return false;
    } finally {
      setBusy(false);
    }
  }
  const summary = records
    ? Array.from(
        new Map(
          records.map((r) => [
            r.student_id,
            { id: r.student_id, name: r.full_name },
          ]),
        ).values(),
      )
    : [];
  return (
    <ClientReady className="space-y-5">
      <PageHeading
        eyebrow="Kehadiran sekolah"
        title="Absensi harian"
        description="Catat kehadiran sesuai jadwal piket atau tinjau rekap kelas. Absensi pertemuan mata pelajaran tersedia terpisah di ruang pembelajaran."
      />
      <Notice message={message} error={error} />
      <section className={panelClass}>
        <div
          role="tablist"
          onKeyDown={navigateTabs}
          aria-label="Absensi dan rekap"
          className="section-tabs mb-5 flex gap-2"
        >
          {[
            { key: "day", label: "Absensi harian" },
            { key: "report", label: "Rekap harian" },
          ].map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              tabIndex={tab === t.key ? 0 : -1}
              disabled={busy}
              className={`rounded-xl px-4 py-3 text-sm ${tab === t.key ? "bg-emerald-800 text-white" : "bg-stone-100 text-stone-600"}`}
              onClick={() => {
                setTab(t.key);
                setMessage("");
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="text-sm">
            Rombel / semester
            <select
              disabled={busy}
              className={fieldClass}
              value={room}
              onChange={(e) => {
                setRoom(e.target.value);
                setData(null);
                setRecords(null);
                setMessage("");
              }}
            >
              <option value="">Pilih kelas</option>
              {meta.classrooms.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.year} / {c.semester === 1 ? "Ganjil" : "Genap"}
                  {c.semester_status === "archived" ? " (Arsip)" : ""}
                </option>
              ))}
            </select>
          </label>
          {tab === "day" ? (
            <label className="text-sm">
              Tanggal sekolah (WIB)
              <input
                disabled={busy}
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  setData(null);
                }}
                type="date"
                min={classroom?.starts_on}
                max={classroom?.ends_on}
                className={fieldClass}
              />
            </label>
          ) : (
            <>
              <label className="text-sm">
                Dari tanggal
                <input
                  disabled={busy}
                  value={from}
                  onChange={(e) => {
                    setFrom(e.target.value);
                    setRecords(null);
                  }}
                  type="date"
                  className={fieldClass}
                />
              </label>
              <label className="text-sm">
                Sampai tanggal
                <input
                  disabled={busy}
                  value={to}
                  onChange={(e) => {
                    setTo(e.target.value);
                    setRecords(null);
                  }}
                  type="date"
                  className={fieldClass}
                />
              </label>
            </>
          )}
        </div>
        <Button
          type="button"
          disabled={busy || !room}
          className="mt-5"
          onClick={() => void load()}
        >
          {busy
            ? "Memproses…"
            : tab === "day"
              ? "Tampilkan absensi"
              : "Tampilkan rekap"}
        </Button>
        {!meta.classrooms.length && (
          <p className="mt-4 text-sm text-stone-500">
            Belum ada kelas atau penugasan yang sesuai dengan akun Anda.
          </p>
        )}
      </section>
      {tab === "day" && data && (
        <section className={panelClass}>
          <h2 className="mb-4 text-xl font-semibold">
            {classroom?.name} · {date}
          </h2>
          {!data.can_write && (
            <p className="mb-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
              Baca-saja: Anda tidak sedang bertugas piket pada tanggal ini atau
              semester sudah ditutup. Koreksi tanggal lalu dilakukan admin
              dengan alasan.
            </p>
          )}
          <AttendanceForm
            key={`${room}:${date}:${data.attendance.map((a) => a.revision).join(",")}`}
            students={data.roster}
            records={data.attendance}
            busy={busy}
            readOnly={!data.can_write}
            onSave={save}
          />
        </section>
      )}
      {tab === "report" && records && (
        <section className={panelClass}>
          <h2 className="text-xl font-semibold">Rekap {classroom?.name}</h2>
          <p className="mt-2 text-xs leading-5 text-stone-500">
            {from} sampai {to}. Hanya catatan tersimpan pada tanggal yang berhak
            Anda lihat yang dihitung; hari tanpa catatan tidak dianggap alpa.
          </p>
          <div className="mt-5 overflow-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  <th className="p-3">Siswa</th>
                  {Object.values(attendanceLabels).map((s) => (
                    <th className="p-3" key={s}>
                      {s}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {summary.map((s) => (
                  <tr key={s.id} className="border-t border-stone-100">
                    <td className="p-3">{s.name}</td>
                    {Object.keys(attendanceLabels).map((status) => (
                      <td className="p-3" key={status}>
                        {records
                          .filter(
                            (r) => r.student_id === s.id && r.status === status,
                          )
                          .reduce((sum, r) => sum + r.count, 0)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!records.length && (
            <p className="mt-5 text-sm text-stone-500">
              Belum ada absensi tersimpan pada rentang tersebut.
            </p>
          )}
        </section>
      )}
    </ClientReady>
  );
}
