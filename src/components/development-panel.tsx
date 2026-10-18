"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "./ui/button";
import { fieldClass, panelClass, Notice } from "./learning-shared";
import {
  devRequest,
  type DevelopmentState,
  type SchoolList,
} from "@/lib/development/client";
import { advancedRequest } from "@/lib/advanced/client";
import { saveOffline, listOffline, clearOffline } from "@/lib/offline/store";
import type { OfflineRecord } from "@/lib/offline/crypto";
import type { CourseState } from "@/lib/learning/types";
export function SchoolSwitcher({ selected }: { selected?: string }) {
  const [state, setState] = useState<SchoolList | null>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    devRequest<SchoolList>("schools")
      .then((r) => {
        if (active) setState(r);
      })
      .catch((e) => {
        if (active) setMessage(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <section className="my-5 rounded-xl border border-stone-200 bg-white p-4">
      <Notice message={message} />
      <label className="block text-sm">
        Sekolah aktif
        <select
          disabled={busy || !state?.schools.length}
          className={fieldClass}
          value={selected ?? state?.schools[0]?.id ?? ""}
          onChange={(e) => {
            const school = e.target.value;
            setBusy(true);
            setMessage("");
            void devRequest("select-school", { data: { school } })
              .then(async () => {
                await clearOffline();
                window.location.reload();
              })
              .catch((e) => setMessage(e.message))
              .finally(() => setBusy(false));
          }}
        >
          {state?.schools.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <Link
        className="mt-3 inline-block text-sm text-emerald-800 underline"
        href="/pengembangan"
      >
        Pengaturan pengembangan{state?.central ? " & sekolah" : ""}
      </Link>
    </section>
  );
}
export function DevelopmentSettings({
  school,
  central,
}: {
  school?: string;
  central: boolean;
}) {
  const [state, setState] = useState<DevelopmentState | null>(null),
    [message, setMessage] = useState(""),
    [error, setError] = useState(false),
    [busy, setBusy] = useState(false),
    [tab, setTab] = useState("settings");
  async function load() {
    if (school) setState(await devRequest("settings", { school }));
  }
  useEffect(() => {
    void load().catch((e) => setMessage(e.message));
  }, [school]);
  async function run(cmd: string, data: Record<string, unknown>) {
    setBusy(true);
    try {
      await devRequest(cmd, { school, data });
      await load();
      setError(false);
      setMessage("Perubahan tersimpan.");
    } catch (e) {
      setError(true);
      setMessage(e instanceof Error ? e.message : "Gagal menyimpan.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-5">
      <nav className="flex flex-wrap gap-3" aria-label="Pengembangan">
        <Button
          variant={tab === "settings" ? "default" : "outline"}
          onClick={() => setTab("settings")}
        >
          Fitur sekolah
        </Button>
        {central && (
          <Button
            variant={tab === "platform" ? "default" : "outline"}
            onClick={() => setTab("platform")}
          >
            Kelola banyak sekolah
          </Button>
        )}
      </nav>
      <Notice message={message} error={error} />
      {tab === "platform" && central && <PlatformPanel />}
      {tab === "settings" && state && (
        <>
          <section className={panelClass}>
            <h2 className="text-lg font-semibold">
              Aktivasi fitur pengembangan
            </h2>
            <p className="mt-3 text-sm leading-6 text-stone-600">
              Offline, tim pengajar dan kanal tambahan nonaktif secara bawaan.
              Sebelum mengaktifkan, uji izin lintas akun/sekolah, perangkat dan
              kapasitas, lalu catat referensi hasilnya. Pengaturan ini tidak
              menandai pengujian Tahap 6–8 sebagai lulus.
            </p>
            {state.admin ? (
              <form
                method="post"
                key={state.features.revision}
                className="mt-4 space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  const d = new FormData(e.currentTarget);
                  void run("feature-save", {
                    offline_enabled: d.get("offline") === "on",
                    team_enabled: d.get("team") === "on",
                    channels_enabled: d.get("channels") === "on",
                    acceptance_reference: String(d.get("reference")),
                    revision: state.features.revision,
                  });
                }}
              >
                {[
                  [
                    "offline",
                    "Offline terkontrol",
                    state.features.offline_enabled,
                  ],
                  ["team", "Tim pengajar", state.features.team_enabled],
                  [
                    "channels",
                    "WhatsApp / Telegram",
                    state.features.channels_enabled,
                  ],
                ].map(([key, label, value]) => (
                  <label key={String(key)} className="block text-sm">
                    <input
                      name={String(key)}
                      type="checkbox"
                      defaultChecked={Boolean(value)}
                    />{" "}
                    {label}
                  </label>
                ))}
                <label className="block text-sm">
                  Referensi validasi izin, perangkat dan kapasitas
                  <input
                    name="reference"
                    className={fieldClass}
                    maxLength={500}
                    defaultValue={state.features.acceptance_reference}
                  />
                </label>
                <Button disabled={busy} type="submit">
                  Simpan pengaturan
                </Button>
              </form>
            ) : (
              <p className="mt-4 text-sm">
                Offline: {state.features.offline_enabled ? "aktif" : "nonaktif"}{" "}
                · Tim: {state.features.team_enabled ? "aktif" : "nonaktif"} ·
                Kanal: {state.features.channels_enabled ? "aktif" : "nonaktif"}.
                Hubungi admin untuk pengaturan.
              </p>
            )}
          </section>
          {state.admin && (
            <>
              <section className={panelClass}>
                <h2 className="text-lg font-semibold">Tim pengajar tambahan</h2>
                <p className="mt-2 text-sm text-stone-600">
                  Guru utama tetap tercatat. Guru tambahan harus mempunyai peran
                  Guru di sekolah ini; akses berlaku saat fitur tim aktif.
                </p>
                <form
                  method="post"
                  className="mt-4 space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const d = new FormData(e.currentTarget);
                    void run("team-save", {
                      course_id: d.get("course"),
                      user_id: d.get("user"),
                      active: d.get("active") === "on",
                    });
                  }}
                >
                  <label className="block text-sm">
                    Kelas / mata pelajaran
                    <select name="course" required className={fieldClass}>
                      <option value="">Pilih kelas</option>
                      {state.courses.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.classroom} · {c.subject}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm">
                    Guru tambahan
                    <select required name="user" className={fieldClass}>
                      <option value="">Pilih guru</option>
                      {state.users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.full_name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm">
                    <input name="active" type="checkbox" defaultChecked />{" "}
                    Penugasan aktif
                  </label>
                  <Button disabled={busy} type="submit">
                    Simpan penugasan
                  </Button>
                </form>
                {state.team.map((t) => (
                  <p className="mt-3 text-sm" key={t.course_id + t.user_id}>
                    {state.users.find((u) => u.id === t.user_id)?.full_name} ·{" "}
                    {state.courses.find((c) => c.id === t.course_id)?.subject} ·{" "}
                    {t.active ? "Aktif" : "Nonaktif"}
                  </p>
                ))}
              </section>
              <section className={panelClass}>
                <h2 className="text-lg font-semibold">
                  Tujuan WhatsApp / Telegram
                </h2>
                <p className="mt-2 text-sm leading-6 text-stone-600">
                  Simpan hanya tujuan milik pengguna yang sudah memberi
                  persetujuan dan diverifikasi operator. Telegram memakai chat
                  ID pribadi setelah pengguna memulai bot. WhatsApp memakai
                  nomor internasional tanpa +. Token penyedia diisi melalui
                  environment Vercel, bukan form ini.
                </p>
                <form
                  method="post"
                  className="mt-4 space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const d = new FormData(e.currentTarget);
                    void run("contact-save", {
                      user_id: d.get("user"),
                      channel: d.get("channel"),
                      destination: String(d.get("destination")),
                      consent_reference: String(d.get("consent")),
                      verified: d.get("verified") === "on",
                      active: d.get("active") === "on",
                    });
                  }}
                >
                  <label className="block text-sm">
                    Pengguna
                    <select name="user" required className={fieldClass}>
                      {state.users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.full_name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm">
                    Kanal
                    <select name="channel" className={fieldClass}>
                      <option value="telegram">Telegram</option>
                      <option value="whatsapp">WhatsApp</option>
                    </select>
                  </label>
                  <label className="block text-sm">
                    Chat ID / nomor
                    <input
                      name="destination"
                      required
                      maxLength={80}
                      className={fieldClass}
                    />
                  </label>
                  <label className="block text-sm">
                    Referensi persetujuan penerima
                    <input
                      name="consent"
                      minLength={5}
                      maxLength={500}
                      required
                      className={fieldClass}
                    />
                  </label>
                  <label className="block text-sm">
                    <input name="verified" type="checkbox" /> Tujuan sudah
                    diverifikasi
                  </label>
                  <label className="block text-sm">
                    <input name="active" type="checkbox" defaultChecked />{" "}
                    Tujuan aktif
                  </label>
                  <Button disabled={busy} type="submit">
                    Simpan tujuan
                  </Button>
                </form>
                {state.contacts.map((c) => (
                  <p className="mt-3 text-sm" key={c.user_id + c.channel}>
                    {state.users.find((u) => u.id === c.user_id)?.full_name} ·{" "}
                    {c.channel} · {c.destination} ·{" "}
                    {c.verified && c.active
                      ? "Siap"
                      : "Belum aktif / diverifikasi"}
                  </p>
                ))}
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}
function PlatformPanel() {
  type State = {
    features: { multi_school: boolean; acceptance_reference: string };
    schools: { id: string; name: string }[];
  };
  const [state, setState] = useState<State | null>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const load = () => devRequest<State>("platform-state").then(setState);
  useEffect(() => {
    void load().catch((e) => setMessage(e.message));
  }, []);
  async function run(
    action: string,
    data: Record<string, unknown>,
    school?: string,
  ) {
    setBusy(true);
    try {
      await devRequest(action, { data, school });
      await load();
      setMessage("Perubahan sekolah tersimpan.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Gagal.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-5">
      <Notice message={message} />
      <section className={panelClass}>
        <h2 className="text-lg font-semibold">
          Pengelolaan sekolah oleh admin pusat
        </h2>
        <p className="mt-2 text-sm">
          Admin pusat mengelola sekolah dan penautan akun; akses ini tidak
          otomatis memberi hak membaca nilai atau jawaban siswa.
        </p>
        <form
          method="post"
          key={JSON.stringify(state?.features)}
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const d = new FormData(e.currentTarget);
            void run("platform-enable", {
              enabled: d.get("enabled") === "on",
              acceptance_reference: String(d.get("reference")),
            });
          }}
        >
          <label className="text-sm">
            <input
              name="enabled"
              type="checkbox"
              defaultChecked={state?.features.multi_school}
            />{" "}
            Izinkan pembuatan/penautan sekolah
          </label>
          <label className="block text-sm">
            Referensi validasi isolasi dan kapasitas
            <input
              name="reference"
              minLength={10}
              maxLength={500}
              required
              className={fieldClass}
              defaultValue={state?.features.acceptance_reference}
            />
          </label>
          <Button type="submit" disabled={busy}>
            Simpan kebijakan
          </Button>
        </form>
      </section>
      <section className={panelClass}>
        <h2 className="text-lg font-semibold">Tambah sekolah</h2>
        <form
          method="post"
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const d = new FormData(e.currentTarget);
            void run("platform-create", {
              name: String(d.get("name")),
              education_level: String(d.get("level")),
              admin_username: String(d.get("username")).trim().toLowerCase(),
            });
          }}
        >
          <label className="block text-sm">
            Nama sekolah
            <input
              name="name"
              required
              minLength={2}
              maxLength={150}
              className={fieldClass}
            />
          </label>
          <label className="block text-sm">
            Jenjang
            <input
              name="level"
              defaultValue="MTs/SMP"
              required
              className={fieldClass}
            />
          </label>
          <label className="block text-sm">
            Username admin yang sudah ada
            <input
              name="username"
              minLength={3}
              maxLength={50}
              required
              className={fieldClass}
            />
          </label>
          <Button
            type="submit"
            disabled={busy || !state?.features.multi_school}
          >
            Buat sekolah dan tautkan admin
          </Button>
        </form>
      </section>
      <section className={panelClass}>
        <h2 className="text-lg font-semibold">Tautkan akun yang sudah ada</h2>
        <form
          method="post"
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const d = new FormData(e.currentTarget);
            void run(
              "platform-link",
              {
                username: String(d.get("username")).trim().toLowerCase(),
                role: String(d.get("role")),
              },
              String(d.get("school")),
            );
          }}
        >
          <label className="block text-sm">
            Sekolah
            <select name="school" className={fieldClass}>
              {state?.schools.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            Username
            <input name="username" required className={fieldClass} />
          </label>
          <label className="block text-sm">
            Peran
            <select name="role" className={fieldClass}>
              {[
                ["admin", "Admin"],
                ["teacher", "Guru"],
                ["student", "Siswa"],
                ["guardian", "Wali"],
                ["principal", "Kepala sekolah"],
                ["homeroom_teacher", "Wali kelas"],
                ["duty_teacher", "Guru piket"],
              ].map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <Button
            disabled={busy || !state?.features.multi_school}
            type="submit"
          >
            Tautkan ke sekolah
          </Button>
        </form>
      </section>
    </div>
  );
}
export function DevelopmentCourse({ state }: { state: CourseState }) {
  const course = state.course.id,
    school = state.context.school;
  const [settings, setSettings] = useState<DevelopmentState | null>(null),
    [optIn, setOptIn] = useState(false),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [messages, setMessages] = useState<{ id: string; subject: string }[]>([]),
    [jobs, setJobs] = useState<
      {
        message_id: string;
        channel: string;
        subject: string;
        total: number;
        pending: number;
        accepted: number;
        uncertain: number;
      }[]
    >([]);
  async function load() {
    setSettings(await devRequest("settings", { school }));
    if (state.context.manager) {
      const [m, j] = await Promise.all([
        advancedRequest<typeof messages>("message-status", { course }),
        devRequest<typeof jobs>("channel-state", { course }),
      ]);
      setMessages(m);
      setJobs(j);
    }
  }
  useEffect(() => {
    void load().catch((e) => setMessage(e.message));
  }, [course, school]);
  async function save(kind: "material" | "draft", target: string) {
    setBusy(true);
    try {
      const ticket = await devRequest<Omit<OfflineRecord, "id">>(
        `offline-${kind === "material" ? "material" : "draft-context"}`,
        { course, target },
      );
      const localId = `${ticket.owner}:${course}:${kind}:${target}`;
      if (
        kind === "draft" &&
        (await listOffline()).some(
          (r) =>
            r.kind === kind && r.course === course && r.content.id === target,
        ) &&
        !window.confirm("Draf lokal sudah ada. Ganti dengan draf kosong baru?")
      )
        return;
      await saveOffline({
        ...ticket,
        id: localId,
        content: {
          ...ticket.content,
          ...(kind === "draft"
            ? { body: "", links: [], request_id: crypto.randomUUID() }
            : {}),
        },
      });
      setMessage(
        "Salinan disimpan lokal selama 30 menit. Buka Ruang offline untuk membaca atau mengubah draf.",
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Gagal menyimpan lokal.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-5">
      <Notice message={message} />
      <section className={panelClass}>
        <h2 className="text-lg font-semibold">Offline terkontrol</h2>
        <p className="mt-3 text-sm text-stone-600">
          Offline {settings?.features.offline_enabled ? "aktif" : "belum aktif"}
          . Materi teks dan draf individu berlaku maksimal 30 menit; tidak
          menyimpan kuis, nilai, sesi atau berkas privat. Draf tidak dikirim
          otomatis dan dapat kedaluwarsa jika tidak segera dikumpulkan saat
          online.
        </p>
        <label className="mt-4 block text-sm">
          <input
            checked={optIn}
            onChange={(e) => setOptIn(e.target.checked)}
            type="checkbox"
          />{" "}
          Saya mengizinkan salinan sementara pada perangkat pribadi ini.
        </label>
        {state.materials.map((m) => (
          <div
            className="mt-3 flex flex-wrap items-center justify-between gap-3"
            key={m.id}
          >
            <span className="text-sm">{m.title}</span>
            <Button
              variant="outline"
              disabled={busy || !optIn || !settings?.features.offline_enabled}
              onClick={() => void save("material", m.id)}
            >
              Simpan materi offline
            </Button>
          </div>
        ))}
        {state.context.student_writable &&
          state.assignments.map((a) => (
            <div
              key={a.id}
              className="mt-3 flex flex-wrap items-center justify-between gap-3"
            >
              <span className="text-sm">{a.title}</span>
              <Button
                variant="outline"
                disabled={busy || !optIn || !settings?.features.offline_enabled}
                onClick={() => void save("draft", a.id)}
              >
                Siapkan draf offline
              </Button>
            </div>
          ))}
        <Link
          className="mt-5 inline-block text-sm text-emerald-800 underline"
          href="/offline"
        >
          Buka Ruang offline →
        </Link>
      </section>
      {state.context.manager && (
        <section className={panelClass}>
          <h2 className="text-lg font-semibold">Kanal WhatsApp / Telegram</h2>
          <p className="mt-2 text-sm text-stone-600">
            Buat pesan melalui Lanjutan → Notifikasi kegiatan terlebih dahulu.
            Antrean tambahan hanya memakai tujuan siswa yang diverifikasi dan
            disetujui. Kredensial penyedia harus tersedia pada environment.
          </p>
          <form
            method="post"
            className="mt-4 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const d = new FormData(e.currentTarget);
              setBusy(true);
              void devRequest("channel-queue", {
                course,
                target: String(d.get("message")),
                data: { channel: String(d.get("channel")) },
              })
                .then(() => load())
                .catch((e) => setMessage(e.message))
                .finally(() => setBusy(false));
            }}
          >
            <label className="block text-sm">
              Pesan
              <select name="message" required className={fieldClass}>
                {messages.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.subject}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              Kanal
              <select name="channel" className={fieldClass}>
                <option value="telegram">Telegram</option>
                <option value="whatsapp">WhatsApp</option>
              </select>
            </label>
            <Button
              disabled={busy || !settings?.features.channels_enabled}
              type="submit"
            >
              Antrekan ke kanal
            </Button>
          </form>
          {jobs.map((j) => (
            <article
              className="mt-4 border-t pt-4"
              key={j.message_id + j.channel}
            >
              <p className="font-semibold">
                {j.subject} · {j.channel}
              </p>
              <p className="mt-2 text-sm">
                {j.total} tujuan · menunggu {j.pending} · diterima penyedia{" "}
                {j.accepted} · tidak pasti {j.uncertain}
              </p>
              <Button
                className="mt-3"
                variant="outline"
                disabled={
                  busy || !j.pending || !settings?.features.channels_enabled
                }
                onClick={() => {
                  if (
                    !window.confirm(
                      "Kirim pesan ini ke maksimal tiga penerima melalui kanal eksternal?",
                    )
                  )
                    return;
                  setBusy(true);
                  void devRequest<{ accepted: number; uncertain: number }>(
                    "channel-send",
                    {
                      course,
                      target: j.message_id,
                      data: { channel: j.channel },
                    },
                  )
                    .then(async (r) => {
                      setMessage(
                        `Diterima penyedia ${r.accepted}; tidak pasti ${r.uncertain}. Ini bukan bukti dibaca penerima.`,
                      );
                      await load();
                    })
                    .catch((e) => setMessage(e.message))
                    .finally(() => setBusy(false));
                }}
              >
                Kirim batch
              </Button>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
