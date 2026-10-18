"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ConfirmDialog } from "./confirm-dialog";
import { devRequest } from "@/lib/development/client";
import { Button } from "./ui/button";
import { fieldClass, panelClass, Notice, Links } from "./learning-shared";
import {
  saveOffline,
  listOffline,
  deleteOffline,
  clearOffline,
  watchOfflineClear,
} from "@/lib/offline/store";
import type { OfflineRecord } from "@/lib/offline/crypto";
import { learningRequest } from "@/lib/learning/types";
export function PwaRegistration() {
  useEffect(() => {
    if ("serviceWorker" in navigator)
      void navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .catch(() => {});
    return watchOfflineClear();
  }, []);
  return null;
}
export function OfflineWorkspace() {
  const [rows, setRows] = useState<OfflineRecord[]>([]),
    [message, setMessage] = useState(""),
    [error, setError] = useState(false),
    [online, setOnline] = useState(true),
    [submitting, setSubmitting] = useState<OfflineRecord | null>(null),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState<Record<string, boolean>>({});
  const load = () =>
    listOffline()
      .then(setRows)
      .catch((e) => setMessage(e.message));
  useEffect(() => {
    void load();
    const connection = () => setOnline(navigator.onLine);
    connection();
    window.addEventListener("online", connection);
    window.addEventListener("offline", connection);
    const timer = setInterval(() => void load(), 15000);
    const clear = () => setRows([]);
    window.addEventListener("lms-offline-cleared", clear);
    const unwatch = watchOfflineClear();
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", connection);
      window.removeEventListener("offline", connection);
      window.removeEventListener("lms-offline-cleared", clear);
      unwatch();
    };
  }, []);
  async function submitDraft() {
    if (!submitting || busy) return;
    const row = submitting;
    setBusy(true);
    setMessage("");
    setError(false);
    try {
      if (Date.parse(row.expires_at) <= Date.now())
        throw new Error(
          "Izin draf offline sudah berakhir. Siapkan kembali draf saat online.",
        );
      const ticket = await devRequest<Omit<OfflineRecord, "id">>(
        "offline-draft-context",
        { course: row.course, target: row.content.id },
      );
      if (ticket.owner !== row.owner || ticket.school !== row.school)
        throw new Error("Akun/sekolah berbeda. Draf tidak dikirim.");
      await learningRequest("submit", {
        course: row.course,
        target: row.content.id,
        data: {
          request_id: row.content.request_id,
          revision: row.content.revision,
          body: row.content.body ?? "",
          links: row.content.links ?? [],
          asset_ids: [],
        },
      });
      await deleteOffline(row.id);
      setMessage("Server mengonfirmasi kiriman. Draf lokal dihapus.");
      await load();
    } catch (e) {
      setError(true);
      setMessage(
        e instanceof Error
          ? e.message
          : "Koneksi belum tersedia. Draf tetap disimpan sampai izin berakhir.",
      );
    } finally {
      setBusy(false);
      setSubmitting(null);
    }
  }
  return (
    <div className="space-y-5">
      <Notice message={message} error={error} />
      <p
        role="status"
        className={`rounded-xl border p-3 text-sm ${online ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}
      >
        {online
          ? "Koneksi perangkat tersedia. Pengumpulan tetap memerlukan konfirmasi server."
          : "Anda sedang offline. Materi dan draf lokal tetap dapat digunakan sampai izin berakhir."}
      </p>
      <ConfirmDialog
        open={!!submitting}
        busy={busy}
        title="Kumpulkan draf ini?"
        description="Server akan memeriksa akun, izin kelas, tenggat dan revisi. Draf lokal baru dihapus setelah server mengonfirmasi kiriman."
        confirmLabel="Kumpulkan draf"
        onCancel={() => setSubmitting(null)}
        onConfirm={() => void submitDraft()}
      />
      <p className="text-sm leading-6 text-stone-600">
        Hanya materi yang Anda pilih dan draf tugas individu disimpan di
        perangkat ini. Izin berlaku maksimal 30 menit. Kunci hanya berada pada
        sesi tab ini; menutup tab dapat mengakhiri akses. Jawaban kuis, nilai,
        token dan lampiran privat tidak disimpan.
      </p>
      <Button variant="outline" disabled={busy} onClick={() => void load()}>
        Periksa data lokal
      </Button>
      {!rows.length && (
        <p className={panelClass}>
          Belum ada salinan yang dapat dibuka. Saat online, gunakan tombol
          Simpan offline di tab Pengembangan kelas.
        </p>
      )}
      {rows.map((row) => (
        <section key={row.id} className={panelClass}>
          <h2 className="text-lg font-semibold">
            {String(row.content.title ?? "Draf")}
          </h2>
          <p className="mt-2 text-xs text-stone-500">
            Berlaku sampai {new Date(row.expires_at).toLocaleString("id-ID")} ·{" "}
            {row.kind === "material"
              ? "Materi tersimpan"
              : "Draf belum dikumpulkan"}
          </p>
          {row.kind === "material" ? (
            <>
              <p className="mt-4 whitespace-pre-wrap text-sm leading-7">
                {String(row.content.body ?? "")}
              </p>
              <Links links={(row.content.links as string[]) ?? []} />
            </>
          ) : (
            <form
              method="post"
              className="mt-4 space-y-3"
              onChange={() => setDirty((d) => ({ ...d, [row.id]: true }))}
              onSubmit={(e) => {
                e.preventDefault();
                const d = new FormData(e.currentTarget);
                setBusy(true);
                setError(false);
                setMessage("");
                void saveOffline({
                  ...row,
                  content: {
                    ...row.content,
                    body: String(d.get("body") ?? ""),
                    links: String(d.get("links") ?? "")
                      .split("\n")
                      .map((x) => x.trim())
                      .filter(Boolean),
                    request_id: crypto.randomUUID(),
                  },
                })
                  .then(() => {
                    setDirty((d) => ({ ...d, [row.id]: false }));
                    setMessage("Draf disimpan lokal, belum dikumpulkan.");
                    return load();
                  })
                  .catch((e) => {
                    setError(true);
                    setMessage(e.message);
                  })
                  .finally(() => setBusy(false));
              }}
            >
              {((row.content.formats as string[]) ?? []).includes("text") && (
                <label className="block text-sm">
                  Jawaban draf
                  <textarea
                    className={fieldClass}
                    name="body"
                    disabled={busy}
                    rows={5}
                    maxLength={30000}
                    defaultValue={String(row.content.body ?? "")}
                  />
                </label>
              )}
              {((row.content.formats as string[]) ?? []).includes("link") && (
                <label className="block text-sm">
                  Tautan HTTPS (satu per baris)
                  <textarea
                    className={fieldClass}
                    name="links"
                    disabled={busy}
                    defaultValue={((row.content.links as string[]) ?? []).join(
                      "\n",
                    )}
                  />
                </label>
              )}
              <Button disabled={busy} type="submit" variant="outline">
                Simpan draf lokal
              </Button>
            </form>
          )}
          {row.kind === "draft" && (
            <Button
              className="mt-4"
              disabled={busy || !online || dirty[row.id]}
              onClick={() => setSubmitting(row)}
            >
              Kumpulkan saat online
            </Button>
          )}
          {row.kind === "draft" && dirty[row.id] && (
            <p role="status" className="mt-3 text-sm text-amber-800">
              Simpan perubahan draf lokal sebelum mengumpulkan.
            </p>
          )}
          <button
            className="ml-4 mt-4 text-sm text-red-800 underline"
            disabled={busy}
            onClick={() =>
              void deleteOffline(row.id)
                .then(() => load())
                .catch((e) => setMessage(e.message))
            }
          >
            Hapus salinan lokal
          </button>
        </section>
      ))}
      <Button
        variant="outline"
        disabled={busy}
        onClick={() =>
          void clearOffline()
            .then(() => load())
            .catch((e) => setMessage(e.message))
        }
      >
        Hapus seluruh data offline perangkat
      </Button>
      <Link
        href="/ruang-belajar"
        className="ml-4 text-sm text-emerald-800 underline"
      >
        Kembali saat online
      </Link>
    </div>
  );
}
