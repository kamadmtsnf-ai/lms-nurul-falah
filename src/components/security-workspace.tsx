"use client";
import Link from "next/link";
import { useEffect, useState, useRef } from "react";
import {
  ShieldCheck,
  MonitorSmartphone,
  History,
  KeyRound,
} from "lucide-react";
import { Button } from "./ui/button";
import { ConfirmDialog } from "./confirm-dialog";
import { PageHeading } from "./page-heading";
import { fieldClass, panelClass } from "./learning-shared";
import { postJson } from "@/lib/http/client";
import { eventLabels } from "@/lib/account-security/policy";
import { profileDate } from "@/lib/profile/validation";
type State = {
  factors: { id: string; name: string }[];
  sessions: {
    id: string;
    current: boolean;
    created_at: string;
    updated_at: string | null;
    user_agent: string;
  }[];
  events: { id: string; field: string; created_at: string }[];
};
type Enrollment = { factor_id: string; qr: string; secret: string };
export function SecurityWorkspace({ admin = false }: { admin?: boolean }) {
  const [data, setData] = useState<State | null>(null),
    [busy, setBusy] = useState(""),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [password, setPassword] = useState(""),
    [code, setCode] = useState(""),
    [disableFactor, setDisableFactor] = useState(""),
    [enrollment, setEnrollment] = useState<Enrollment | null>(null),
    [dialog, setDialog] = useState<
      "disable" | "revoke-others" | "logout-all" | null
    >(null);
  const reads = useRef(0),
    acting = useRef(false);
  async function load() {
    const read = ++reads.current;
    setError("");
    try {
      const r = await postJson<{ result: State }>("/api/keamanan/state", {});
      if (read === reads.current) setData(r.result);
    } catch (e) {
      if (read !== reads.current) return;
      setError(
        e instanceof Error ? e.message : "Status keamanan belum dapat dimuat.",
      );
    }
  }
  useEffect(() => {
    void load();
    return () => {
      reads.current++;
    };
  }, []);
  useEffect(() => {
    if (!enrollment) return;
    const timer = setTimeout(() => {
      setEnrollment(null);
      setPassword("");
      setCode("");
      setMessage(
        "Penyiapan ditutup setelah 10 menit. Mulai penyiapan lagi untuk melanjutkan.",
      );
    }, 600000);
    return () => clearTimeout(timer);
  }, [enrollment]);
  async function act(action: string, values: Record<string, unknown> = {}) {
    if (acting.current) return;
    acting.current = true;
    setBusy(action);
    setError("");
    setMessage("");
    try {
      const r = await postJson<{
        next?: string;
        message?: string;
        result?: Enrollment;
      }>(`/api/keamanan/${action}`, values);
      setPassword("");
      setCode("");
      if (r.next) {
        window.location.assign(r.next);
        return;
      }
      if (action === "enroll" && r.result) setEnrollment(r.result);
      if (action === "cancel-enroll") setEnrollment(null);
      setDialog(null);
      setMessage(r.message || "Permintaan berhasil.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Permintaan belum berhasil.");
    } finally {
      acting.current = false;
      setBusy("");
    }
  }
  return (
    <div className="space-y-5">
      <PageHeading
        eyebrow="Lindungi akun Anda"
        title="Keamanan akun"
        description="Kelola autentikator, sesi perangkat, dan riwayat keamanan. Password, kode, dan kunci autentikator tidak dicatat dalam riwayat."
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/profil"
          className="text-sm font-semibold text-emerald-800 underline"
        >
          Kembali ke Profil
        </Link>
        <Button variant="outline" disabled={!!busy} onClick={() => void load()}>
          Muat ulang keamanan
        </Button>
      </div>
      {message && (
        <p
          role="status"
          className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900"
        >
          {message}
        </p>
      )}
      {error && !dialog && (
        <p
          role="alert"
          className="rounded-xl bg-red-50 p-4 text-sm text-red-800"
        >
          {error}
        </p>
      )}
      {!data && !error && (
        <p role="status" className="text-sm text-stone-500">
          Memuat status keamanan akun…
        </p>
      )}
      {data && (
        <>
          <section className={panelClass}>
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <ShieldCheck size={20} aria-hidden />
              Verifikasi dua langkah
            </h2>
            <p className="mt-3 text-sm leading-6 text-stone-600">
              Gunakan aplikasi autentikator yang mendukung TOTP. Fitur ini tidak
              memakai SMS. Setelah diaktifkan, login baru harus dilanjutkan
              dengan kode autentikator sebelum data aplikasi dapat dibuka.
            </p>
            {admin && !data.factors.length && (
              <p className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
                Sangat disarankan untuk akun admin karena dapat mengelola akun
                dan data siswa.
              </p>
            )}
            <p className="mt-4 text-sm font-semibold text-emerald-800">
              Status: {data.factors.length ? "Aktif" : "Belum aktif"}
            </p>
            {data.factors.length ? (
              <>
                <p className="mt-2 text-sm text-stone-500">
                  Autentikator: {data.factors.map((f) => f.name).join(", ")}
                </p>
                <Button
                  className="mt-4"
                  variant="outline"
                  disabled={!!busy}
                  onClick={() => {
                    setError("");
                    setPassword("");
                    setCode("");
                    setDisableFactor(data.factors[0]?.id || "");
                    setDialog("disable");
                  }}
                >
                  Nonaktifkan autentikator
                </Button>
              </>
            ) : !enrollment ? (
              <form
                className="mt-5"
                onSubmit={(e) => {
                  e.preventDefault();
                  void act("enroll", { password });
                }}
              >
                <label className="block text-sm">
                  Password saat ini untuk penyiapan
                  <input
                    type="password"
                    required
                    maxLength={128}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={fieldClass}
                    disabled={!!busy}
                  />
                </label>
                <p className="mt-3 text-xs leading-5 text-stone-500">
                  Siapkan aplikasi autentikator di perangkat pribadi. Jika
                  perangkat hilang, pemulihan dilakukan operator setelah
                  identitas diverifikasi; email saja tidak menonaktifkan
                  autentikator.
                </p>
                <Button className="mt-4" type="submit" disabled={!!busy}>
                  {busy === "enroll" ? "Menyiapkan…" : "Siapkan autentikator"}
                </Button>
              </form>
            ) : (
              <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
                <h3 className="font-semibold">
                  Pindai dengan aplikasi autentikator
                </h3>
                <img
                  src={enrollment.qr}
                  alt="Kode QR penyiapan autentikator pribadi"
                  className="my-4 h-48 w-48 max-w-full rounded-xl bg-white p-2"
                />
                <details className="text-sm">
                  <summary className="cursor-pointer font-medium">
                    Tidak dapat memindai QR?
                  </summary>
                  <p className="mt-2 text-xs leading-5">
                    Masukkan kunci ini secara manual. Jangan bagikan atau
                    menyimpannya di perangkat bersama.
                  </p>
                  <code className="mt-2 block break-all rounded-lg bg-white p-3 select-all">
                    {enrollment.secret}
                  </code>
                </details>
                <form
                  className="mt-5"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void act("verify", {
                      factor_id: enrollment.factor_id,
                      code,
                    });
                  }}
                >
                  <label className="block text-sm">
                    Kode autentikator penyiapan
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      required
                      value={code}
                      onChange={(e) =>
                        setCode(e.target.value.replace(/\D/g, ""))
                      }
                      className={fieldClass}
                      disabled={!!busy}
                    />
                  </label>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <Button disabled={!!busy} type="submit">
                      Aktifkan autentikator
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!!busy}
                      onClick={() =>
                        void act("cancel-enroll", {
                          factor_id: enrollment.factor_id,
                        })
                      }
                    >
                      Batalkan penyiapan
                    </Button>
                  </div>
                </form>
              </div>
            )}
          </section>
          <section className={panelClass}>
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <MonitorSmartphone size={20} aria-hidden />
              Sesi perangkat
            </h2>
            <p className="mt-3 text-sm leading-6 text-stone-500">
              Perangkat dikenali dari informasi browser. Waktu pembaruan sesi
              bukan bukti waktu aktivitas pengguna terakhir.
            </p>
            <ul className="mt-5 space-y-3">
              {data.sessions.map((s) => (
                <li
                  key={s.id}
                  className="rounded-xl border border-stone-200 p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold">
                      {s.current ? "Sesi perangkat ini" : "Sesi perangkat lain"}
                    </h3>
                    {s.current && (
                      <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs text-emerald-800">
                        Saat ini
                      </span>
                    )}
                  </div>
                  <p className="mt-2 break-words text-xs leading-5 text-stone-500 [overflow-wrap:anywhere]">
                    {s.user_agent}
                  </p>
                  <p className="mt-2 text-xs leading-5 text-stone-500">
                    Dibuat: {profileDate(s.created_at)}
                    {s.updated_at
                      ? ` · Diperbarui: ${profileDate(s.updated_at)}`
                      : ""}
                  </p>
                </li>
              ))}
            </ul>
            {!data.sessions.length && (
              <p className="mt-4 text-sm text-stone-500">
                Tidak ada sesi yang dapat ditampilkan. Muat ulang status atau
                login kembali.
              </p>
            )}
            <div className="mt-5 flex flex-wrap gap-3">
              <Button
                variant="outline"
                disabled={!!busy || !data.sessions.some((s) => !s.current)}
                onClick={() => {
                  setPassword("");
                  setError("");
                  setDialog("revoke-others");
                }}
              >
                Keluar dari perangkat lain
              </Button>
              <Button
                variant="outline"
                disabled={!!busy}
                onClick={() => {
                  setPassword("");
                  setError("");
                  setDialog("logout-all");
                }}
              >
                Keluar dari semua perangkat
              </Button>
            </div>
          </section>
          <section className={panelClass}>
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <History size={20} aria-hidden />
              Riwayat keamanan
            </h2>
            <p className="mt-2 text-xs text-stone-500">
              20 catatan terakhir untuk akun Anda.
            </p>
            {data.events.length ? (
              <ol className="mt-4 space-y-3">
                {data.events.map((e) => (
                  <li key={e.id} className="border-b border-stone-100 py-3">
                    <p className="text-sm font-medium">
                      {eventLabels[e.field] || "Perubahan akun"}
                    </p>
                    <p className="mt-1 text-xs text-stone-500">
                      {profileDate(e.created_at)}
                    </p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-5 text-sm text-stone-500">
                Belum ada catatan keamanan.
              </p>
            )}
          </section>
        </>
      )}
      <ConfirmDialog
        open={!!dialog}
        title={
          dialog === "disable"
            ? "Nonaktifkan autentikator?"
            : "Akhiri sesi perangkat?"
        }
        description={
          dialog === "disable"
            ? "Kode terbaru dari autentikator yang dipilih dan password saat ini wajib benar. Semua sesi berakhir dan Anda wajib login ulang. Autentikator lain, jika ada, tetap aktif."
            : dialog === "logout-all"
              ? "Semua sesi, termasuk perangkat ini, akan diakhiri. Pekerjaan yang belum tersimpan dapat hilang."
              : "Sesi pada perangkat ini tetap aktif. Semua sesi perangkat lain akan diakhiri."
        }
        confirmLabel={
          dialog === "disable" ? "Ya, nonaktifkan" : "Ya, akhiri sesi"
        }
        busy={!!busy}
        error={error || undefined}
        onCancel={() => {
          setDialog(null);
          setPassword("");
          setCode("");
          setError("");
        }}
        onConfirm={() => {
          if (dialog)
            void act(dialog, {
              password,
              ...(dialog === "disable"
                ? { code, factor_id: disableFactor }
                : {}),
            });
        }}
      >
        <label className="mt-4 block text-sm">
          Password saat ini untuk keamanan
          <input
            type="password"
            value={password}
            maxLength={128}
            autoComplete="current-password"
            onChange={(e) => setPassword(e.target.value)}
            className={fieldClass}
            disabled={!!busy}
          />
        </label>
        {dialog === "disable" && (data?.factors.length || 0) > 1 && (
          <label className="mt-4 block text-sm">
            Autentikator yang dinonaktifkan
            <select
              className={fieldClass}
              value={disableFactor}
              onChange={(e) => setDisableFactor(e.target.value)}
              disabled={!!busy}
            >
              {data?.factors.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
            <span className="mt-2 block text-xs text-stone-500">
              Autentikator lain tetap aktif.
            </span>
          </label>
        )}
        {dialog === "disable" && (
          <label className="mt-4 block text-sm">
            Kode autentikator terbaru
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              className={fieldClass}
              disabled={!!busy}
            />
          </label>
        )}
      </ConfirmDialog>
    </div>
  );
}
export function MfaChallenge({
  factors,
}: {
  factors: { id: string; name: string }[];
}) {
  const [factor, setFactor] = useState(factors[0]?.id || ""),
    [code, setCode] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <form
      className="mt-6 space-y-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          const r = await postJson<{ next: string }>("/api/keamanan/verify", {
            factor_id: factor,
            code,
          });
          window.location.assign(r.next);
        } catch (e) {
          setError(
            e instanceof Error ? e.message : "Verifikasi belum berhasil.",
          );
        } finally {
          setBusy(false);
          setCode("");
        }
      }}
    >
      {factors.length > 1 && (
        <label className="block text-sm">
          Pilih autentikator
          <select
            className={fieldClass}
            value={factor}
            onChange={(e) => setFactor(e.target.value)}
          >
            {factors.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="block text-sm font-medium">
        Kode autentikator
        <input
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          required
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          className={fieldClass}
          disabled={busy}
        />
      </label>
      {error && (
        <p
          role="alert"
          className="rounded-xl bg-red-50 p-3 text-sm text-red-800"
        >
          {error}
        </p>
      )}
      <Button type="submit" disabled={busy || !factor} className="w-full">
        <KeyRound size={16} aria-hidden />
        {busy ? "Memverifikasi…" : "Verifikasi & lanjutkan"}
      </Button>
      <details className="text-sm leading-6 text-stone-500">
        <summary className="cursor-pointer font-medium">
          Tidak dapat mengakses autentikator?
        </summary>
        <p className="mt-2">
          Hubungi operator madrasah melalui jalur yang sudah dikenal. Operator
          harus memverifikasi identitas sebelum mereset autentikator. Pemulihan
          password melalui email tidak menghapus perlindungan dua langkah.
        </p>
      </details>
    </form>
  );
}
