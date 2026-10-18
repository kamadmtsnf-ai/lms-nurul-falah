"use client";
import { ConfirmDialog } from "./confirm-dialog";
import { postJson } from "@/lib/http/client";
import { clearOffline } from "@/lib/offline/store";
import { Eye, EyeOff } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
export type Field = {
  name: string;
  label: string;
  type?: string;
  autoComplete?: string;
  hint?: string;
  value?: string;
  required?: boolean;
  minLength?: number;
  readOnly?: boolean;
};
export function AuthForm({
  action,
  fields = [],
  label,
  fragment = false,
  extra = {},
}: {
  action: string;
  fields?: Field[];
  label: string;
  fragment?: boolean;
  extra?: Record<string, string>;
}) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [token, setToken] = useState("");
  const [success, setSuccess] = useState(false);
  useEffect(() => {
    if (fragment) {
      const t = new URLSearchParams(window.location.hash.slice(1)).get("token");
      if (t) {
        setToken(t);
        window.history.replaceState(null, "", window.location.pathname);
      }
    }
  }, [fragment]);
  return (
    <form
      method="post"
      className="mt-7 space-y-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setMessage("");
        setSuccess(false);
        const form = new FormData(e.currentTarget);
        const body: Record<string, unknown> = { ...extra };
        form.forEach((value, key) => {
          body[key] = String(value);
        });
        if (fragment) body.token = token;
        try {
          const response = await fetch(`/api/identitas/${action}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          const data = await response.json();
          setSuccess(response.ok);
          setMessage(
            data.message ??
              (response.ok ? "Berhasil." : "Permintaan belum berhasil."),
          );
          if (response.ok && data.next) {
            if (["login", "password", "reset"].includes(action))
              await clearOffline();
            window.location.assign(data.next);
          }
        } catch {
          setMessage("Koneksi terputus. Periksa jaringan dan coba lagi.");
        } finally {
          setBusy(false);
        }
      }}
    >
      {fields.map((f) => (
        <div key={f.name}>
          <label htmlFor={f.name} className="mb-2 block text-sm font-semibold">
            {f.label}
          </label>
          <div className="relative">
            <input
              id={f.name}
              name={f.name}
              type={
                f.type === "password" && visible[f.name]
                  ? "text"
                  : (f.type ?? "text")
              }
              readOnly={f.readOnly}
              autoComplete={f.autoComplete}
              defaultValue={f.value}
              disabled={busy || !ready}
              required={f.required !== false}
              minLength={f.minLength}
              maxLength={
                f.type === "password" ? 128 : f.type === "email" ? 254 : 100
              }
              className={`form-control w-full rounded-xl border border-stone-300 bg-white px-4 py-3 outline-offset-4 focus:outline-emerald-700 ${f.type === "password" ? "pr-14" : ""}`}
              aria-describedby={f.hint ? `${f.name}-hint` : undefined}
            />
            {f.type === "password" && (
              <button
                type="button"
                disabled={busy}
                aria-label={`${visible[f.name] ? "Sembunyikan" : "Tampilkan"} ${f.label.toLowerCase()}`}
                aria-pressed={!!visible[f.name]}
                className="password-toggle"
                onClick={() =>
                  setVisible((v) => ({ ...v, [f.name]: !v[f.name] }))
                }
              >
                {visible[f.name] ? (
                  <EyeOff size={18} aria-hidden />
                ) : (
                  <Eye size={18} aria-hidden />
                )}
              </button>
            )}
          </div>
          {f.hint && (
            <p
              id={`${f.name}-hint`}
              className="mt-2 text-xs leading-5 text-stone-500"
            >
              {f.hint}
            </p>
          )}
        </div>
      ))}
      {fragment && !token && (
        <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
          Buka tautan dari email pada browser ini untuk melanjutkan. Jika Anda
          baru login, buka kembali tautan tersebut.
        </p>
      )}
      <div aria-live="polite">
        {message && (
          <p
            className={`rounded-xl p-4 text-sm ${success ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-800"}`}
          >
            {message}
          </p>
        )}
      </div>
      <Button
        type="submit"
        disabled={!ready || busy || (fragment && !token)}
        className="w-full"
      >
        {busy && <span aria-hidden className="loading-spinner" />}
        {busy ? "Memproses…" : label}
      </Button>
    </form>
  );
}
export function LogoutButton() {
  const [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [open, setOpen] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => setReady(true), []);
  async function logout() {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      await clearOffline();
      await postJson("/api/identitas/logout", {});
      window.location.assign("/masuk");
    } catch (e) {
      setMessage(
        e instanceof Error
          ? e.message
          : "Koneksi terputus. Coba keluar kembali.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex max-w-full flex-col items-end gap-2">
      <Button
        type="button"
        className="whitespace-nowrap"
        variant="outline"
        disabled={!ready || busy}
        onClick={() => {
          setMessage("");
          setOpen(true);
        }}
      >
        Keluar
      </Button>
      <ConfirmDialog
        open={open}
        busy={busy}
        error={message}
        title="Keluar dari akun?"
        description="Pastikan pekerjaan Anda sudah tersimpan di server. Salinan materi dan draf offline pada perangkat ini akan dihapus saat keluar."
        confirmLabel="Ya, keluar"
        onCancel={() => setOpen(false)}
        onConfirm={() => void logout()}
      />
    </div>
  );
}
