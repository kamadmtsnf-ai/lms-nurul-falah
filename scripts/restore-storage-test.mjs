import path from "node:path";
import { backupKey } from "./testing/backup-crypto.mjs";
import { restoreStorageLocal } from "./testing/storage-backup.mjs";
const [index, destination] = process.argv.slice(2);
if (
  !index ||
  !destination ||
  process.env.LMS_STORAGE_RESTORE_ACK !== "isolated-local-storage-test"
)
  throw new Error(
    "Berikan index, direktori uji kosong baru, dan ACK pemulihan lokal.",
  );
const dest = path.resolve(destination),
  repo = process.cwd();
if (dest === repo || dest.startsWith(repo + path.sep))
  throw new Error("Target pemulihan harus di luar repository.");
const key = backupKey(process.env.LMS_BACKUP_KEY_BASE64);
try {
  const result = await restoreStorageLocal(index, dest, key);
  console.log(
    `Pemulihan lokal dan hash cocok: ${result.objects} objek. Ini belum membuktikan restore ke Supabase atau izin akses aplikasi.`,
  );
} finally {
  key.fill(0);
}
