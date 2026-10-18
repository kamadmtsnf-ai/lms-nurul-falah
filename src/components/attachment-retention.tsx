"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "./ui/button";
import { ConfirmDialog } from "./confirm-dialog";
import { DataTableViewport } from "./data-table-viewport";
import { Notice, fieldClass, panelClass } from "./learning-shared";
import { postJson } from "@/lib/http/client";
import type {
  RetentionState,
  RetentionAsset,
} from "@/lib/attachment-retention/types";
import { RetentionManager } from "./retention-manager";
const statusLabel: Record<string, string> = {
  queued: "Menunggu",
  cancelled: "Dibatalkan",
  processing: "Sedang diproses",
  failed: "Gagal — perlu tindak lanjut",
  deleted: "Terhapus",
};
const categoryLabel: Record<string, string> = {
  pending: "Unggahan tidak terpakai",
  material: "Materi guru",
  submission: "Lampiran tugas",
};
const date = (v: string | null) =>
  v
    ? new Intl.DateTimeFormat("id-ID", {
        dateStyle: "medium",
        timeZone: "Asia/Jakarta",
      }).format(new Date(v))
    : "—";
export function AttachmentRetention({ school }: { school: string }) {
  const [state, setState] = useState<RetentionState | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(false),
    [offset, setOffset] = useState(0),
    [confirmation, setConfirmation] = useState("");
  const [modal, setModal] = useState<{
      action: string;
      data: Record<string, unknown>;
      target?: string;
      title: string;
    } | null>(null),
    [backup, setBackup] = useState<RetentionAsset | null>(null),
    [reference, setReference] = useState(""),
    [backupChecked, setBackupChecked] = useState(false);
  const requestId = useRef(0),
    acting = useRef(false),
    activeSchool = useRef(school);
  activeSchool.current = school;
  async function perform(
    action: string,
    data: Record<string, unknown> = {},
    target?: string,
    page = offset,
  ) {
    if (acting.current) return false;
    acting.current = true;
    const id = ++requestId.current,
      scope = school;
    setBusy(true);
    setError(false);
    setMessage("");
    try {
      const r = await postJson<{ result: RetentionState }>(
        `/api/retensi-lampiran/${action}`,
        { school: scope, offset: page, data, ...(target ? { target } : {}) },
      );
      if (id === requestId.current && scope === activeSchool.current) {
        setState(r.result);
        setOffset(page);
        if (action !== "state")
          setMessage(
            action === "run"
              ? "Batch selesai. Periksa status antrean; berkas yang belum memenuhi syarat tetap disimpan."
              : "Perubahan tersimpan.",
          );
      }
      return true;
    } catch (e) {
      if (id === requestId.current) {
        setError(true);
        setMessage(e instanceof Error ? e.message : "Permintaan gagal.");
      }
      return false;
    } finally {
      acting.current = false;
      if (id === requestId.current) setBusy(false);
    }
  }
  useEffect(() => {
    setState(null);
    setModal(null);
    setBackup(null);
    setOffset(0);
    void perform("state", {}, undefined, 0);
    return () => {
      requestId.current++;
    };
  }, [school]);
  function askSettings(form: HTMLFormElement) {
    if (!state) return;
    const f = new FormData(form);
    const data = {
      revision: state.policy.revision,
      enabled: f.has("enabled"),
      pending_days: Number(f.get("pending_days")),
      material_days: Number(f.get("material_days")),
      submission_days: Number(f.get("submission_days")),
      grace_days: Number(f.get("grace_days")),
      backup_required: f.has("backup_required"),
    };
    setConfirmation("");
    setModal({ action: "settings", data, title: "Simpan kebijakan retensi" });
  }
  return (
    <div className="space-y-5 min-w-0">
      <Notice message={message} error={error} />
      <section className={panelClass}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Retensi lampiran</h2>
            <p className="mt-2 text-sm text-stone-600">
              Pratinjau, masa tenggang, dan pelindungan berkas. Nilai dan
              riwayat akademik tetap disimpan.
            </p>
          </div>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void perform("state")}
          >
            Muat ulang lampiran
          </Button>
        </div>
        <p role="status" className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm">
          {!state
            ? "Memuat pengaturan…"
            : state.policy.enabled
              ? "Otomatisasi aktif. Hanya berkas yang lolos seluruh pemeriksaan yang diproses."
              : "Mode pratinjau. Penghapusan otomatis nonaktif."}
        </p>
        {state && !state.scheduler_configured && (
          <p className="mt-3 text-sm text-amber-800">
            Penjadwal belum dikonfigurasi. Admin dapat menjalankan batch setelah
            kebijakan diaktifkan.
          </p>
        )}
        <p className="mt-3 text-xs text-stone-500">
          Foto profil aktif tidak termasuk; foto lama tetap mengikuti
          pembersihan saat penggantian profil. Berkas pada tautan eksternal
          tidak dihapus. Pemeriksaan dijadwalkan harian sekitar pukul 02 WIB;
          waktu aktual mengikuti penjadwal Vercel.
        </p>
      </section>
      {state && (
        <>
          <form
            key={state.policy.revision}
            className={panelClass}
            onSubmit={(e) => {
              e.preventDefault();
              askSettings(e.currentTarget);
            }}
          >
            <fieldset disabled={busy}>
              <legend className="font-semibold">Kebijakan sekolah</legend>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {[
                  [
                    "pending_days",
                    "Unggahan tidak terpakai (hari sejak dibuat)",
                  ],
                  ["material_days", "Materi (hari setelah arsip)"],
                  ["submission_days", "Lampiran tugas (hari setelah arsip)"],
                  ["grace_days", "Masa tenggang antrean (hari)"],
                ].map(([name, label]) => (
                  <label key={name} className="block text-sm">
                    {label}
                    <input
                      name={name}
                      type="number"
                      min={1}
                      max={name === "grace_days" ? 90 : 3650}
                      required
                      className={fieldClass}
                      defaultValue={state.policy[name as "pending_days"]}
                    />
                  </label>
                ))}
              </div>
              <label className="mt-4 flex min-h-11 items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  name="backup_required"
                  defaultChecked={state.policy.backup_required}
                />
                Wajib verifikasi backup sebelum menghapus lampiran akademik
              </label>
              <label className="flex min-h-11 items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  name="enabled"
                  defaultChecked={state.policy.enabled}
                />
                Aktifkan pemrosesan otomatis
              </label>
              <p className="mt-2 text-xs text-stone-500">
                Tugas memerlukan semester diarsipkan, nilai final terkunci, dan
                tidak ada tindak lanjut yang masih direncanakan. Unggahan
                gagal/tidak terpakai tidak memerlukan backup akademik. Perubahan
                aturan memberi masa tenggang baru saat pemindaian berikutnya.
              </p>
              <Button className="mt-4" type="submit">
                Simpan kebijakan
              </Button>
            </fieldset>
          </form>
          <section className={panelClass}>
            <h3 className="font-semibold">Ringkasan antrean sekolah</h3>
            <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ["Menunggu", state.summary.queued],
                ["Diproses", state.summary.processing],
                ["Gagal", state.summary.failed],
                ["Terhapus", state.summary.deleted],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl bg-stone-50 p-3">
                  <dt className="text-xs text-stone-500">{label}</dt>
                  <dd className="mt-1 text-xl font-semibold">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-sm">
              Estimasi ukuran berkas dalam antrean:{" "}
              {(Number(state.summary.estimated_queued_bytes) / 1000000).toFixed(
                2,
              )}{" "}
              MB.
            </p>
            <p className="mt-2 text-xs text-stone-500">
              Estimasi berasal dari metadata, bukan pengukuran kuota Storage.
              Ruang dibebaskan setelah objek berhasil dihapus. Pembatalan hanya
              tersedia sebelum penghapusan dimulai.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => void perform("scan")}
              >
                Pindai dan antrekan kandidat
              </Button>
              <Button
                disabled={busy || !state.policy.enabled}
                onClick={() => {
                  setConfirmation("");
                  setModal({
                    action: "run",
                    data: { confirmation: "JALANKAN BATCH RETENSI" },
                    title: "Jalankan batch penghapusan",
                  });
                }}
              >
                Jalankan satu batch
              </Button>
            </div>
          </section>
          <section className={panelClass}>
            <h3 className="font-semibold">Pratinjau dan daftar lampiran</h3>
            <p className="mt-2 text-sm text-stone-500">
              Halaman {Math.floor(offset / 50) + 1}. “Belum memenuhi syarat”
              berarti berkas aktif, masa simpan belum berakhir, atau prasyarat
              arsip/penilaian belum lengkap.
            </p>
            {!state.rows.length ? (
              <p className="mt-4 text-sm">
                Belum ada lampiran pada halaman ini.
              </p>
            ) : (
              <DataTableViewport label="Retensi lampiran">
                <table style={{ minWidth: "64rem" }}>
                  <thead>
                    <tr>
                      <th scope="col">Berkas</th>
                      <th scope="col">Kategori / ukuran</th>
                      <th scope="col">Status</th>
                      <th scope="col">Tenggat / backup</th>
                      <th scope="col" style={{ width: "14rem" }}>Tindakan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.rows.map((a) => {
                      const irreversible = [
                        "processing",
                        "failed",
                        "deleted",
                      ].includes(a.state ?? "");
                      return (
                        <tr key={a.id}>
                          <td>
                            <span
                              title={a.name}
                              className="line-clamp-3 break-words font-medium [overflow-wrap:anywhere]"
                            >
                              {a.name}
                            </span>
                            {a.retention_hold && (
                              <p className="mt-1 text-xs text-emerald-800">
                                Dipertahankan admin
                              </p>
                            )}
                          </td>
                          <td>
                            {categoryLabel[
                              a.category ?? a.eligible_category ?? ""
                            ] ?? a.target_type}
                            <p className="text-xs text-stone-500">
                              {(a.bytes / 1000000).toFixed(2)} MB
                            </p>
                          </td>
                          <td>
                            {a.state
                              ? statusLabel[a.state]
                              : a.eligible_category
                                ? "Kandidat — belum diantrekan"
                                : "Belum memenuhi syarat"}
                            {a.state === "failed" && (
                              <p className="mt-1 text-xs text-amber-800">
                                Percobaan {a.attempts}. Penghapusan belum
                                terkonfirmasi; akses ditutup sampai
                                diselesaikan.
                              </p>
                            )}
                          </td>
                          <td>
                            {date(a.delete_after)}
                            <p className="mt-1 text-xs">
                              {a.backup_verified_at
                                ? "Backup dinyatakan terverifikasi " +
                                  date(a.backup_verified_at)
                                : a.category === "pending"
                                  ? "Backup akademik tidak diperlukan"
                                  : state.policy.backup_required
                                    ? "Menunggu verifikasi backup"
                                    : "Backup tidak diwajibkan"}
                            </p>
                          </td>
                          <td>
                            <div className="flex flex-wrap gap-2">
                              {!irreversible && (
                                <Button
                                  variant="outline"
                                  disabled={busy}
                                  onClick={() =>
                                    void perform(
                                      "hold",
                                      { hold: !a.retention_hold },
                                      a.id,
                                    )
                                  }
                                >
                                  {a.retention_hold
                                    ? "Lepas pelindungan"
                                    : "Pertahankan berkas"}
                                </Button>
                              )}
                              {a.state === "queued" && (
                                <>
                                  <Button
                                    variant="outline"
                                    disabled={busy}
                                    onClick={() =>
                                      void perform("cancel", {}, a.id)
                                    }
                                  >
                                    Batalkan antrean
                                  </Button>
                                  {a.category !== "pending" && (
                                    <Button
                                      variant="outline"
                                      disabled={busy}
                                      onClick={() => {
                                        setBackup(a);
                                        setReference("");
                                        setBackupChecked(false);
                                      }}
                                    >
                                      Catat verifikasi backup
                                    </Button>
                                  )}
                                </>
                              )}
                              {a.state === "cancelled" &&
                                a.eligible_category &&
                                !a.retention_hold && (
                                  <Button
                                    variant="outline"
                                    disabled={busy}
                                    onClick={() =>
                                      void perform("requeue", {}, a.id)
                                    }
                                  >
                                    Antrekan ulang
                                  </Button>
                                )}
                              {a.state === "failed" && (
                                <Button
                                  variant="outline"
                                  disabled={busy}
                                  onClick={() =>
                                    void perform("retry", {}, a.id)
                                  }
                                >
                                  Jadwalkan ulang percobaan
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </DataTableViewport>
            )}
            <div className="mt-4 flex flex-wrap gap-3">
              <Button
                variant="outline"
                disabled={busy || offset === 0}
                onClick={() =>
                  void perform("state", {}, undefined, Math.max(0, offset - 50))
                }
              >
                Lampiran sebelumnya
              </Button>
              <Button
                variant="outline"
                disabled={busy || !state.has_more}
                onClick={() =>
                  void perform("state", {}, undefined, offset + 50)
                }
              >
                Lampiran berikutnya
              </Button>
            </div>
          </section>
        </>
      )}
      <ConfirmDialog
        open={!!modal}
        title={modal?.title ?? ""}
        description={
          modal?.action === "run"
            ? "Maksimal 10 berkas yang sudah melewati tenggat akan diproses. Penghapusan permanen tidak dapat dibatalkan tanpa backup."
            : "Pengaturan hanya berlaku untuk sekolah ini. Berkas yang dipertahankan tetap dikecualikan. Pekerjaan yang sudah dimulai akan dituntaskan meskipun otomatisasi dimatikan."
        }
        confirmLabel={
          modal?.action === "run" ? "Jalankan batch" : "Simpan kebijakan"
        }
        busy={busy}
        error={error ? message : undefined}
        onCancel={() => !busy && setModal(null)}
        onConfirm={() => {
          if (!modal) return;
          if (
            modal.action === "settings" &&
            modal.data.enabled &&
            confirmation !== "AKTIFKAN RETENSI"
          ) {
            setError(true);
            setMessage("Ketik AKTIFKAN RETENSI untuk mengaktifkan.");
            return;
          }
          void perform(
            modal.action,
            {
              ...modal.data,
              ...(modal.action === "settings" ? { confirmation } : {}),
            },
            modal.target,
          ).then((ok) => {
            if (ok) setModal(null);
          });
        }}
      >
        {modal?.action === "settings" && modal.data.enabled === true && (
          <label className="mt-4 block text-sm">
            Ketik AKTIFKAN RETENSI
            <input
              className={fieldClass}
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              autoComplete="off"
            />
          </label>
        )}
        {modal?.action === "settings" && !modal.data.backup_required && (
          <p className="mt-3 text-sm text-amber-800">
            Backup tidak diwajibkan. Berkas yang terhapus mungkin tidak dapat
            dipulihkan.
          </p>
        )}
      </ConfirmDialog>
      <ConfirmDialog
        open={!!backup}
        title="Pernyataan verifikasi backup"
        description="Hanya catat backup yang sudah Anda periksa dan dapat dipulihkan. Referensi ini merupakan pernyataan admin, bukan verifikasi otomatis ke layanan backup."
        confirmLabel="Simpan pernyataan backup"
        busy={busy}
        error={error ? message : undefined}
        onCancel={() => !busy && setBackup(null)}
        onConfirm={() => {
          if (!backup) return;
          if (!backupChecked || reference.trim().length < 10) {
            setError(true);
            setMessage("Isi referensi dan nyatakan backup sudah diverifikasi.");
            return;
          }
          void perform(
            "backup",
            { reference, confirmation: "BACKUP SUDAH DIVERIFIKASI" },
            backup.id,
          ).then((ok) => {
            if (ok) setBackup(null);
          });
        }}
      >
        <label className="mt-4 block text-sm">
          Referensi backup
          <input
            className={fieldClass}
            value={reference}
            maxLength={500}
            onChange={(e) => setReference(e.target.value)}
            placeholder="ID arsip dan hasil pemeriksaan pemulihan"
          />
        </label>
        <label className="mt-3 flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={backupChecked}
            onChange={(e) => setBackupChecked(e.target.checked)}
          />
          Saya telah memverifikasi backup berkas ini dan akses pemulihannya.
        </label>
      </ConfirmDialog>
    </div>
  );
}
export function RetentionWorkspace({ school }: { school: string }) {
  const [view, setView] = useState("files");
  return (
    <div className="space-y-5">
      <nav
        className="grid grid-cols-2 gap-2 sm:flex"
        aria-label="Jenis retensi"
      >
        <Button
          variant={view === "files" ? "default" : "outline"}
          onClick={() => setView("files")}
        >
          Lampiran pembelajaran
        </Button>
        <Button
          variant={view === "alumni" ? "default" : "outline"}
          onClick={() => setView("alumni")}
        >
          Data alumni
        </Button>
      </nav>
      {view === "files" ? (
        <AttachmentRetention key={school} school={school} />
      ) : (
        <RetentionManager key={school} school={school} />
      )}
    </div>
  );
}
