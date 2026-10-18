"use client";
import { useEffect, useState, useRef } from "react";
import { Button } from "./ui/button";
import { ConfirmDialog } from "./confirm-dialog";
import { fieldClass } from "./learning-shared";
import { postJson } from "@/lib/http/client";
export function SensitiveNik({
  masked,
  active,
}: {
  masked: string;
  active: boolean;
}) {
  const [open, setOpen] = useState(false),
    [password, setPassword] = useState(""),
    [value, setValue] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const sequence = useRef(0),
    activeRef = useRef(active);
  activeRef.current = active;
  useEffect(() => {
    if (!active) {
      sequence.current++;
      setOpen(false);
      setValue("");
      setPassword("");
      setError("");
    }
  }, [active]);
  useEffect(() => {
    const clear = () => {
      sequence.current++;
      setValue("");
      setPassword("");
      setOpen(false);
    };
    const visibility = () => {
      if (document.hidden) clear();
    };
    window.addEventListener("pagehide", clear);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      sequence.current++;
      window.removeEventListener("pagehide", clear);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  useEffect(() => {
    if (!value) return;
    const clear = () => setValue("");
    const timer = setTimeout(clear, 60000);
    return () => clearTimeout(timer);
  }, [value]);
  return (
    <div className="mt-5 rounded-xl border border-stone-200 bg-stone-50 p-4">
      <p className="text-xs font-medium text-stone-500">NIK tersimpan</p>
      <p className="mt-2 break-all font-mono text-sm">
        {(active && value) || masked || "Belum diisi"}
      </p>
      <p className="mt-2 text-xs leading-5 text-stone-500">
        NIK lengkap hanya dikirim setelah password diverifikasi. Tampilan akan
        disembunyikan setelah 60 detik atau saat halaman ditinggalkan.
      </p>
      <Button
        type="button"
        variant="outline"
        className="mt-3"
        disabled={!masked || busy}
        onClick={() => {
          if (value) setValue("");
          else {
            setError("");
            setPassword("");
            setOpen(true);
          }
        }}
      >
        {value ? "Sembunyikan NIK" : "Lihat NIK lengkap"}
      </Button>
      <ConfirmDialog
        open={open}
        title="Tampilkan NIK lengkap?"
        description="Pastikan Anda menggunakan perangkat pribadi. Akses ini dicatat pada riwayat keamanan akun."
        confirmLabel="Verifikasi & tampilkan"
        busy={busy}
        error={error || undefined}
        onCancel={() => {
          setOpen(false);
          setPassword("");
          setError("");
        }}
        onConfirm={async () => {
          const requestId = ++sequence.current;
          setBusy(true);
          setError("");
          try {
            const r = await postJson<{ result: { nik: string } }>(
              "/api/keamanan/reveal-nik",
              { password },
            );
            if (
              requestId !== sequence.current ||
              !activeRef.current ||
              document.hidden
            )
              return;
            setValue(r.result.nik);
            setOpen(false);
            setPassword("");
          } catch (e) {
            setError(
              e instanceof Error ? e.message : "NIK belum dapat dibuka.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="mt-4 block text-sm">
          Password saat ini untuk melihat NIK
          <input
            type="password"
            autoComplete="current-password"
            maxLength={128}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={fieldClass}
            disabled={busy}
          />
        </label>
      </ConfirmDialog>
    </div>
  );
}
