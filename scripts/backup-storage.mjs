// Operator-only: configure credentials locally, never through chat or the repository.
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { backupKey } from "./testing/backup-crypto.mjs";
import { backupStorage } from "./testing/storage-backup.mjs";
const sourceBucket = process.env.LMS_STORAGE_BUCKET ?? "lms-private";
if (!["lms-private", "profile-photos"].includes(sourceBucket))
  throw new Error("Bucket cadangan tidak diizinkan.");
const url = process.env.SUPABASE_URL,
  key =
    process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY,
  destination = process.env.LMS_BACKUP_DIR;
if (
  url !== "https://slppnagegknxsjhfqthm.supabase.co" ||
  !key ||
  !destination ||
  process.env.LMS_STORAGE_BACKUP_ACK !== "authorized-private-storage-export"
)
  throw new Error(
    "Konfigurasi operator belum lengkap: proyek sumber, kredensial server, direktori privat, dan ACK ekspor Storage.",
  );
const dest = path.resolve(destination),
  repo = process.cwd();
if (dest === repo || dest.startsWith(repo + path.sep))
  throw new Error("Cadangan harus berada di luar repository.");
const encryption = backupKey(process.env.LMS_BACKUP_KEY_BASE64),
  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
try {
  const bucket = await client.storage.getBucket(sourceBucket);
  if (bucket.error || bucket.data.public)
    throw new Error("Bucket privat sumber tidak dapat diverifikasi.");
  const result = await backupStorage(
    {
      list: async (prefix, offset, limit) => {
        const r = await client.storage.from(sourceBucket).list(prefix, {
          offset,
          limit,
          sortBy: { column: "name", order: "asc" },
        });
        if (r.error)
          throw new Error("Inventaris Storage gagal; ekspor dibatalkan.");
        return r.data;
      },
      download: async (object) => {
        const r = await client.storage.from(sourceBucket).download(object);
        if (r.error) throw new Error("Unduhan objek gagal; ekspor dibatalkan.");
        return r.data;
      },
    },
    dest,
    encryption,
  );
  console.log(
    `Cadangan Storage ${sourceBucket} terenkripsi selesai: ${result.objects} objek. Jalankan drill pemulihan sebelum menerima cadangan.`,
  );
} finally {
  encryption.fill(0);
}
