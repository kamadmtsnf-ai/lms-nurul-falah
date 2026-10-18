"use client";
import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type FormEvent,
} from "react";
import {
  Camera,
  UserRound,
  IdCard,
  ShieldCheck,
  Users,
  CalendarClock,
  ArrowLeft,
} from "lucide-react";
import { Button } from "./ui/button";
import { ConfirmDialog } from "./confirm-dialog";
import { PageHeading } from "./page-heading";
import { fieldClass, panelClass } from "./learning-shared";
import { postJson } from "@/lib/http/client";
import { navigateTabs } from "@/lib/http/tab-navigation";
import { roleLabels } from "@/lib/auth/validation";
import { canEdit, profileDate } from "@/lib/profile/validation";
import type { ProfileData } from "@/lib/profile/types";
const tabs = [
  ["personal", "Data pribadi", UserRound],
  ["identity", "Identitas", IdCard],
  ["security", "Akun & keamanan", ShieldCheck],
  ["relations", "Informasi peran", Users],
] as const;
const weekdays: Record<number, string> = {
  1: "Senin",
  2: "Selasa",
  3: "Rabu",
  4: "Kamis",
  5: "Jumat",
  6: "Sabtu",
  7: "Minggu",
};
type Action =
  | "name"
  | "phone"
  | "identity"
  | "username"
  | "email"
  | "photo"
  | "remove-photo";
function Value({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border border-stone-200 bg-stone-50/70 p-4">
      <dt className="text-xs font-medium text-stone-500">{label}</dt>
      <dd className="mt-2 whitespace-pre-wrap break-words text-sm font-medium text-stone-800 [overflow-wrap:anywhere]">
        {children || "Belum tersedia"}
      </dd>
    </div>
  );
}
function Cooldown({
  next,
  days,
  now,
}: {
  next: string | null;
  days: number;
  now: number;
}) {
  return (
    <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-stone-500">
      <CalendarClock size={15} className="mt-0.5 shrink-0" aria-hidden />
      <span>
        {canEdit(next, now)
          ? `Dapat diubah sekarang. Setelah disimpan, perubahan berikutnya tersedia dalam ${days} hari.`
          : `Dapat diubah kembali pada ${profileDate(next)} (WIB).`}
      </span>
    </p>
  );
}
export function ProfileWorkspace({ initial }: { initial: ProfileData }) {
  const [data, setData] = useState(initial),
    [tab, setTab] = useState("personal"),
    [busy, setBusy] = useState(""),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [file, setFile] = useState<File | null>(null),
    [preview, setPreview] = useState(""),
    [photoFailed, setPhotoFailed] = useState(false),
    [now, setNow] = useState(Date.parse(initial.server_now)),
    [pending, setPending] = useState<{
      action: Action;
      values: Record<string, unknown>;
    } | null>(null);
  const offset = useRef(Date.parse(initial.server_now) - Date.now()),
    fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now() + offset.current), 30000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!file) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const blocked = (field: keyof ProfileData["next"]) =>
    !!busy || !canEdit(data.next[field], now);
  function accept(next: ProfileData) {
    setData(next);
    setPhotoFailed(false);
    offset.current = Date.parse(next.server_now) - Date.now();
    setNow(Date.parse(next.server_now));
  }
  async function save(action: Action, values: Record<string, unknown> = {}) {
    setBusy(action);
    setError("");
    setMessage("");
    try {
      let result: { result?: ProfileData; next?: string; message: string };
      if (action === "photo") {
        if (!file) throw Error("Pilih foto terlebih dahulu.");
        const form = new FormData();
        form.set("revision", String(data.revision));
        if (data.school) form.set("school", data.school);
        form.set("file", file);
        const res = await fetch("/api/profil/photo", {
          method: "POST",
          body: form,
          cache: "no-store",
        });
        try {
          result = await res.json();
        } catch {
          throw Error(
            "Unggahan foto belum dapat diproses. Periksa koneksi dan coba lagi.",
          );
        }
        if (!res.ok)
          throw Error(result.message || "Foto belum dapat disimpan.");
      } else
        result = await postJson(`/api/profil/${action}`, {
          school: data.school,
          revision: data.revision,
          ...values,
        });
      if (result.next) {
        window.location.assign(result.next);
        return;
      }
      if (result.result) accept(result.result);
      setPending(null);
      setMessage(result.message);
      if (action === "photo" || action === "remove-photo") {
        setFile(null);
        setPhotoFailed(false);
        if (fileInput.current) fileInput.current.value = "";
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Perubahan belum dapat disimpan.",
      );
    } finally {
      setBusy("");
    }
  }
  function submit(action: Action, e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const values = Object.fromEntries(new FormData(e.currentTarget));
    setError("");
    setMessage("");
    if (action === "phone") void save(action, values);
    else setPending({ action, values });
  }
  async function reload() {
    setBusy("reload");
    setError("");
    try {
      const r = await postJson<{ result: ProfileData }>("/api/profil/read", {
        school: data.school,
      });
      accept(r.result);
      setMessage("Profil berhasil dimuat ulang.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Profil belum dapat dimuat.");
    } finally {
      setBusy("");
    }
  }
  const confirmation =
    pending?.action === "email"
      ? "Email baru akan menggantikan email saat ini. Anda wajib memverifikasinya sebelum membuka halaman lain. Pastikan alamatnya benar; perubahan berikutnya tersedia setelah 60 hari."
      : pending?.action === "remove-photo"
        ? "Foto akan dihapus dan kembali memakai inisial. Anda dapat mengubah foto lagi setelah 90 hari."
        : pending?.action === "photo"
          ? "Foto pilihan akan disimpan. Penggantian atau penghapusan berikutnya tersedia setelah 90 hari."
          : pending?.action === "username"
            ? "Gunakan username baru saat login berikutnya. Perubahan username berikutnya tersedia setelah 40 hari."
            : "Pastikan data sudah benar. Perubahan berikutnya tersedia setelah 45 hari.";
  return (
    <div className="space-y-5">
      <PageHeading
        eyebrow="Akun saya"
        title="Profil"
        description="Kelola informasi pribadi dan keamanan akun. Informasi sekolah serta relasi dikelola oleh admin."
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/ruang-belajar"
          className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-800"
        >
          <ArrowLeft size={16} aria-hidden />
          Kembali ke ruang akun
        </Link>
        <Button
          variant="outline"
          disabled={!!busy}
          onClick={() => void reload()}
        >
          {busy === "reload" ? "Memuat…" : "Muat ulang profil"}
        </Button>
      </div>
      <section
        className={`${panelClass} flex flex-col gap-5 sm:flex-row sm:items-center`}
        aria-label="Ringkasan profil"
      >
        <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-emerald-100 bg-emerald-50 text-3xl font-semibold text-emerald-800">
          {data.has_photo && !photoFailed ? (
            <img
              src={`/api/profil/foto?v=${data.revision}`}
              alt={`Foto profil ${data.name}`}
              className="h-full w-full object-cover"
              onError={() => setPhotoFailed(true)}
            />
          ) : (
            data.name
              .split(/\s+/)
              .filter(Boolean)
              .slice(0, 2)
              .map((w) => w[0])
              .join("")
              .toUpperCase()
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="break-words text-xl font-semibold [overflow-wrap:anywhere]">
            {data.name}
          </h2>
          <p className="mt-1 break-all text-sm text-stone-500">
            @{data.username}
          </p>
          <p className="mt-1 break-words text-sm text-stone-500">
            {data.school_name || "Belum terhubung ke sekolah"}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {data.roles.map((role) => (
              <span
                key={role}
                className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800"
              >
                {roleLabels[role] || role}
              </span>
            ))}
            <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-medium">
              {data.status === "active" ? "Akun Aktif" : "Akun Nonaktif"}
            </span>
          </div>
          {photoFailed && (
            <p className="mt-2 text-xs text-amber-800">
              Foto belum dapat dimuat. Coba muat ulang halaman.
            </p>
          )}
        </div>
      </section>
      {message && (
        <p
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-900"
        >
          {message}
        </p>
      )}
      {error && !pending && (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-800"
        >
          {error}
        </p>
      )}
      <nav
        role="tablist"
        aria-label="Bagian profil"
        className="grid grid-cols-2 gap-2 rounded-2xl border border-stone-200 bg-white p-2 sm:grid-cols-4"
        onKeyDown={navigateTabs}
      >
        {tabs.map(([key, label, Icon]) => (
          <button
            type="button"
            role="tab"
            id={`profile-tab-${key}`}
            aria-controls={`profile-panel-${key}`}
            aria-selected={tab === key}
            tabIndex={tab === key ? 0 : -1}
            key={key}
            onClick={() => setTab(key)}
            className={`flex min-h-12 min-w-0 items-center justify-center gap-2 rounded-xl px-3 py-3 text-center text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 ${tab === key ? "bg-emerald-800 text-white shadow-sm" : "text-stone-600 hover:bg-stone-50"}`}
          >
            <Icon size={16} className="shrink-0" aria-hidden />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      <section
        hidden={tab !== "personal"}
        role="tabpanel"
        id="profile-panel-personal"
        aria-labelledby="profile-tab-personal"
        className="space-y-5"
      >
        <div className={panelClass}>
          <h2 className="text-lg font-semibold">Foto profil</h2>
          <p className="mt-2 text-sm leading-6 text-stone-500">
            JPG, PNG atau WebP, maksimal 3 MB. Foto disimpan privat dan
            dioptimalkan untuk menghemat penyimpanan.
          </p>
          {preview && (
            <img
              src={preview}
              alt="Pratinjau foto pilihan"
              className="mt-4 h-32 w-32 rounded-2xl border border-stone-200 object-cover"
            />
          )}
          <label className="mt-5 block text-sm font-medium">
            Pilih foto
            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={blocked("photo")}
              className={`${fieldClass} file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-50 file:px-3 file:py-2 file:text-emerald-800`}
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setError("");
                if (
                  f &&
                  (f.size > 3 * 1024 * 1024 ||
                    !["image/jpeg", "image/png", "image/webp"].includes(f.type))
                ) {
                  setError("Pilih JPG, PNG atau WebP maksimal 3 MB.");
                  e.target.value = "";
                  setFile(null);
                } else setFile(f);
              }}
            />
          </label>
          <Cooldown next={data.next.photo} days={90} now={now} />
          <div className="mt-4 flex flex-wrap gap-3">
            <Button
              disabled={blocked("photo") || !file}
              onClick={() => {
                setError("");
                setPending({ action: "photo", values: {} });
              }}
            >
              <Camera size={16} aria-hidden />
              {data.has_photo ? "Ganti foto" : "Simpan foto"}
            </Button>
            {file && (
              <Button
                variant="outline"
                disabled={!!busy}
                onClick={() => {
                  setFile(null);
                  if (fileInput.current) fileInput.current.value = "";
                }}
              >
                Batalkan pilihan
              </Button>
            )}
            {data.has_photo && (
              <Button
                variant="outline"
                disabled={blocked("photo")}
                onClick={() => {
                  setError("");
                  setPending({ action: "remove-photo", values: {} });
                }}
              >
                Hapus foto
              </Button>
            )}
          </div>
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          <form
            key={data.name}
            className={panelClass}
            onSubmit={(e) => submit("name", e)}
          >
            <h2 className="text-lg font-semibold">Nama lengkap</h2>
            <fieldset disabled={blocked("name")}>
              <label className="mt-4 block text-sm">
                Nama lengkap
                <input
                  name="name"
                  autoComplete="name"
                  required
                  minLength={2}
                  maxLength={100}
                  defaultValue={data.name}
                  className={fieldClass}
                />
              </label>
              <Cooldown next={data.next.name} days={45} now={now} />
              <Button type="submit" className="mt-4">
                Simpan nama
              </Button>
            </fieldset>
          </form>
          <form
            key={data.phone}
            className={panelClass}
            onSubmit={(e) => submit("phone", e)}
          >
            <h2 className="text-lg font-semibold">Nomor HP / WhatsApp</h2>
            <label className="mt-4 block text-sm">
              Nomor HP/WA
              <input
                name="phone"
                type="tel"
                autoComplete="tel"
                maxLength={40}
                defaultValue={data.phone}
                placeholder="Contoh: 081234567890 atau +6281234567890"
                className={fieldClass}
                disabled={!!busy}
              />
            </label>
            <p className="mt-3 text-xs leading-5 text-stone-500">
              Nomor ini juga ditampilkan kepada siswa yang ditautkan jika Anda
              berperan sebagai orang tua/wali. Perubahan nomor tidak memiliki
              masa tunggu.
            </p>
            <Button type="submit" className="mt-4" disabled={!!busy}>
              {busy === "phone" ? "Menyimpan…" : "Simpan nomor HP/WA"}
            </Button>
          </form>
        </div>
      </section>
      <section
        hidden={tab !== "identity"}
        role="tabpanel"
        id="profile-panel-identity"
        aria-labelledby="profile-tab-identity"
        className={panelClass}
      >
        <h2 className="text-lg font-semibold">
          Identitas{" "}
          {data.is_teacher
            ? "tenaga pendidik"
            : data.is_student
              ? "siswa"
              : "pribadi"}
        </h2>
        {data.is_student && (
          <dl className="mt-5 grid gap-3 sm:grid-cols-2">
            <Value label="Nomor Induk Siswa (readonly)">
              {data.student_number}
            </Value>
          </dl>
        )}
        {data.is_teacher && (
          <dl className="mt-5">
            <Value label="Kode pegawai sekolah (readonly)">
              {data.staff_code}
            </Value>
          </dl>
        )}
        {!data.is_student || data.is_teacher ? (
          <form
            key={`${data.nip}:${data.npk}:${data.nik}`}
            onSubmit={(e) => submit("identity", e)}
            className="mt-5"
          >
            <fieldset disabled={blocked("identity")}>
              <div className="grid gap-4 md:grid-cols-2">
                {data.is_teacher && (
                  <>
                    <label className="block text-sm">
                      NIP (18 digit)
                      <input
                        name="nip"
                        inputMode="numeric"
                        maxLength={18}
                        pattern="[0-9]{18}|"
                        defaultValue={data.nip}
                        className={fieldClass}
                      />
                    </label>
                    <label className="block text-sm">
                      NPK (13 digit)
                      <input
                        name="npk"
                        inputMode="numeric"
                        maxLength={13}
                        pattern="[0-9]{13}|"
                        defaultValue={data.npk}
                        className={fieldClass}
                      />
                    </label>
                  </>
                )}
                <label className="block text-sm">
                  NIK (16 digit)
                  <input
                    name="nik"
                    inputMode="numeric"
                    maxLength={16}
                    pattern="[0-9]{16}|"
                    defaultValue={data.nik}
                    className={fieldClass}
                  />
                </label>
              </div>
              <p className="mt-3 text-xs leading-5 text-stone-500">
                Nomor disimpan sebagai teks agar angka nol di awal tidak hilang.
                Kosongkan nomor yang belum dimiliki. Menyimpan perubahan
                identitas memulai masa tunggu bersama selama 45 hari.
              </p>
              <Cooldown next={data.next.identity} days={45} now={now} />
              <Button type="submit" className="mt-4">
                Simpan identitas
              </Button>
            </fieldset>
          </form>
        ) : (
          <p className="mt-4 text-sm leading-6 text-stone-500">
            Nomor induk dikelola admin melalui data akademik sekolah. Hubungi
            admin jika perlu diperbaiki.
          </p>
        )}
      </section>
      <section
        hidden={tab !== "security"}
        role="tabpanel"
        id="profile-panel-security"
        aria-labelledby="profile-tab-security"
        className="space-y-5"
      >
        <dl className={`${panelClass} grid gap-3 sm:grid-cols-2`}>
          <Value label="Status akun (readonly)">
            {data.status === "active" ? "Aktif" : "Nonaktif"}
          </Value>
          <Value label="Status email">
            {data.email_verified_at ? "Terverifikasi" : "Menunggu verifikasi"}
          </Value>
          <Value label="Peran / role (readonly)">
            {data.roles.map((r) => roleLabels[r] || r).join(", ")}
          </Value>
          <Value label="Akun dibuat">{profileDate(data.created_at)}</Value>
        </dl>
        <div className="grid gap-5 lg:grid-cols-2">
          <form
            key={data.username}
            className={panelClass}
            onSubmit={(e) => {
              if (data.is_student) e.preventDefault();
              else submit("username", e);
            }}
          >
            <h2 className="text-lg font-semibold">Username</h2>
            <label className="mt-4 block text-sm">
              Username
              <input
                name="username"
                readOnly={data.is_student}
                disabled={!data.is_student && blocked("username")}
                autoComplete="username"
                minLength={3}
                maxLength={50}
                required
                defaultValue={data.username}
                className={fieldClass}
              />
            </label>
            {data.is_student ? (
              <p className="mt-3 text-sm text-stone-500">
                Username siswa bersifat readonly dan dikelola admin.
              </p>
            ) : (
              <fieldset disabled={blocked("username")}>
                <label className="mt-4 block text-sm">
                  Password saat ini untuk ubah username
                  <input
                    name="password"
                    type="password"
                    required
                    maxLength={128}
                    autoComplete="current-password"
                    className={fieldClass}
                  />
                </label>
                <Cooldown next={data.next.username} days={40} now={now} />
                <Button type="submit" className="mt-4">
                  Simpan username
                </Button>
              </fieldset>
            )}
          </form>
          <form
            key={data.email}
            className={panelClass}
            onSubmit={(e) => submit("email", e)}
          >
            <h2 className="text-lg font-semibold">Email pemulihan</h2>
            <p className="mt-2 break-all text-sm text-stone-500">
              Saat ini: {data.email || "Belum tersedia"}
            </p>
            <fieldset disabled={blocked("email")}>
              <label className="mt-4 block text-sm">
                Email baru
                <input
                  name="email"
                  type="email"
                  required
                  maxLength={254}
                  autoComplete="email"
                  className={fieldClass}
                />
              </label>
              <label className="mt-4 block text-sm">
                Password saat ini untuk ubah email
                <input
                  name="password"
                  type="password"
                  required
                  maxLength={128}
                  autoComplete="current-password"
                  className={fieldClass}
                />
              </label>
              <Cooldown next={data.next.email} days={60} now={now} />
              <p className="mt-3 text-xs leading-5 text-stone-500">
                Siswa boleh memakai email orang tua/wali. Email baru wajib
                diverifikasi sebelum aplikasi dapat digunakan kembali.
              </p>
              <Button type="submit" className="mt-4">
                Ubah & verifikasi email
              </Button>
            </fieldset>
          </form>
        </div>
        <div
          className={`${panelClass} flex flex-wrap items-center justify-between gap-4`}
        >
          <div>
            <h2 className="font-semibold">Password</h2>
            <p className="mt-1 text-sm text-stone-500">
              Setelah mengganti password, Anda wajib login ulang.
            </p>
          </div>
          <Link
            href="/ganti-password?from=profil"
            className="rounded-xl border border-emerald-200 px-4 py-3 text-sm font-semibold text-emerald-800"
          >
            Ubah password
          </Link>
        </div>
      </section>
      <section
        hidden={tab !== "relations"}
        role="tabpanel"
        id="profile-panel-relations"
        aria-labelledby="profile-tab-relations"
        className="space-y-5"
      >
        <p className="text-sm leading-6 text-stone-500">
          Informasi berikut bersifat readonly dan mengikuti data sekolah aktif.
          Hubungi admin untuk memperbarui kelas, penugasan atau tautan keluarga.
        </p>
        {data.is_student && (
          <>
            <div className={panelClass}>
              <h2 className="text-lg font-semibold">Kelas / rombel saat ini</h2>
              {data.classrooms.length ? (
                <dl className="mt-5 grid gap-3 sm:grid-cols-2">
                  {data.classrooms.map((c) => (
                    <Value
                      key={c.id}
                      label={`${c.year} · Semester ${c.semester === 1 ? "Ganjil" : "Genap"}`}
                    >
                      {c.name}
                    </Value>
                  ))}
                </dl>
              ) : (
                <p className="mt-4 text-sm text-stone-500">
                  Belum terdaftar pada rombel semester aktif.
                </p>
              )}
            </div>
            <div className={panelClass}>
              <h2 className="text-lg font-semibold">
                Orang tua / wali tertaut
              </h2>
              {data.guardians.length ? (
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {data.guardians.map((g) => (
                    <dl
                      key={g.id}
                      className="min-w-0 space-y-3 rounded-xl border border-stone-200 p-4"
                    >
                      <Value label={`Nama wali · ${g.relationship}`}>
                        {g.full_name}
                      </Value>
                      <Value label="Nomor HP/WA wali">
                        {g.phone || "Belum diisi oleh wali"}
                      </Value>
                    </dl>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-sm text-stone-500">
                  Belum ada orang tua/wali yang ditautkan admin.
                </p>
              )}
            </div>
          </>
        )}
        {data.is_teacher && (
          <div className={panelClass}>
            <h2 className="text-lg font-semibold">Tugas & tugas tambahan</h2>
            {data.duties.length ? (
              <ul className="mt-5 space-y-3">
                {data.duties.map((d, i) => (
                  <li
                    key={`${d.kind}:${i}`}
                    className="rounded-xl border border-stone-200 p-4"
                  >
                    <h3 className="font-medium">{d.kind}</h3>
                    <p className="mt-1 break-words text-sm text-stone-500">
                      {d.detail}
                    </p>
                    {d.weekdays?.length ? (
                      <p className="mt-2 text-sm text-emerald-800">
                        {d.weekdays.map((day) => weekdays[day]).join(", ")}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-stone-500">
                Belum ada penugasan pada semester aktif. Peran resmi tercantum
                pada tab Akun & Keamanan.
              </p>
            )}
          </div>
        )}
        {data.roles.includes("guardian") && (
          <div className={panelClass}>
            <h2 className="text-lg font-semibold">Daftar anak tertaut</h2>
            {data.children.length ? (
              <ol
                className={`mt-5 space-y-3 ${data.children.length > 1 ? "list-decimal pl-6" : ""}`}
              >
                {data.children.map((c) => (
                  <li
                    key={c.id}
                    className="rounded-xl border border-stone-200 p-4"
                  >
                    <p className="break-words font-medium">{c.full_name}</p>
                    <p className="mt-1 text-xs text-stone-500">
                      Hubungan: {c.relationship}
                    </p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-4 text-sm text-stone-500">
                Belum ada anak berakun aktif yang ditautkan admin.
              </p>
            )}
          </div>
        )}
        {!data.is_student &&
          !data.is_teacher &&
          !data.roles.includes("guardian") && (
            <div className={panelClass}>
              <h2 className="font-semibold">Peran di sekolah</h2>
              <p className="mt-3 text-sm text-stone-500">
                {data.roles.map((r) => roleLabels[r] || r).join(", ") ||
                  "Belum ada peran sekolah."}
              </p>
            </div>
          )}
      </section>
      <ConfirmDialog
        open={!!pending}
        title={
          pending?.action === "remove-photo"
            ? "Hapus foto profil?"
            : "Simpan perubahan profil?"
        }
        description={confirmation}
        confirmLabel={
          pending?.action === "remove-photo"
            ? "Ya, hapus foto"
            : "Ya, simpan perubahan"
        }
        busy={!!busy}
        error={error || undefined}
        onCancel={() => {
          if (!busy) {
            setPending(null);
            setError("");
          }
        }}
        onConfirm={() => {
          if (pending) void save(pending.action, pending.values);
        }}
      />
    </div>
  );
}
